import { createFileRoute } from '@tanstack/react-router'
import { Building2, Copy, Image as ImageIcon, KeyRound, LockKeyhole, Mail, Pencil, Plus, Save, ShieldCheck, ToggleLeft, ToggleRight, Trash2, Users, X } from 'lucide-react'
import * as React from 'react'
import { createRole, deleteRole, getCompanyAdministration, updateCompanyModule, updateCompanyProfile, updateRole } from '~/server/auth'
import { ImageUploadField } from '~/components/ImageUploadField'
import { defaultCurrency, defaultLocale } from '~/utils/currency'
import { currencies, locales } from '~/utils/onboarding'
import {
  changePassword,
  confirmTotpSetup,
  createInvitation,
  createPasswordResetLink,
  disableTotp,
  getSecurityOverview,
  listMySessions,
  removeMembership,
  revokeInvitation,
  revokeOtherSessions,
  revokeSession,
  startTotpSetup,
  updateMembership,
} from '~/server/security'

export const Route = createFileRoute('/$companySlug/settings')({
  component: SettingsPage,
})

type SettingsTab = 'general' | 'users' | 'security' | 'roles' | 'modules' | 'notifications'

type AdministrationData = Awaited<ReturnType<typeof getCompanyAdministration>>

const settingsTabs = [
  { key: 'general' as const, label: 'General', icon: Building2 },
  { key: 'users' as const, label: 'Utilisateurs', icon: Users },
  { key: 'security' as const, label: 'Securite', icon: LockKeyhole },
  { key: 'roles' as const, label: 'Roles & permissions', icon: ShieldCheck },
  { key: 'modules' as const, label: 'Modules', icon: ToggleRight },
  { key: 'notifications' as const, label: 'Notifications', icon: Mail },
]

function SettingsPage() {
  const { companySlug } = Route.useParams()
  // Permissions issues du contexte de route parent ($companySlug) : evite un
  // appel reseau et permet de cacher les onglets d'administration.
  const context = Route.useRouteContext() as {
    user?: { isOwner?: boolean } | null
    activeCompany?: { permissions?: string[] } | null
  }
  const canManage = Boolean(
    context.user?.isOwner || context.activeCompany?.permissions?.includes('company.manage'),
  )
  // L'onglet "Securite" gere le compte personnel (mot de passe, 2FA, sessions) :
  // toujours accessible. Les autres onglets sont reserves aux gestionnaires.
  const visibleTabs = canManage ? settingsTabs : settingsTabs.filter((tab) => tab.key === 'security')
  const [activeTab, setActiveTab] = React.useState<SettingsTab>(canManage ? 'general' : 'security')
  const [data, setData] = React.useState<AdministrationData | null>(null)
  const [message, setMessage] = React.useState<string | null>(null)

  const refresh = React.useCallback(async () => {
    if (!canManage) return
    const administrationData = await getCompanyAdministration({ data: { companySlug } })
    setData(administrationData)
  }, [companySlug, canManage])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  async function handleCreateRole(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const permissionKeys = form.getAll('permissionKeys').map(String)
    const result = await createRole({
      data: {
        companySlug,
        name: String(form.get('name') ?? ''),
        description: String(form.get('description') ?? ''),
        permissionKeys,
      },
    })
    setMessage(result.ok ? 'Role cree.' : result.message)
    if (result.ok) {
      formElement.reset()
      await refresh()
    }
  }

  async function handleUpdateCompany(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const logoUrl = normalizeOptionalUrl(String(form.get('logoUrl') ?? ''))
    const website = normalizeOptionalUrl(String(form.get('website') ?? ''))
    if (!isOptionalHttpUrl(logoUrl)) {
      setMessage('Logo URL invalide. Exemple attendu: https://exemple.com/logo.png')
      return
    }
    if (!isOptionalHttpUrl(website)) {
      setMessage('Site web invalide. Exemple attendu: https://exemple.com')
      return
    }
    try {
      const result = await updateCompanyProfile({
        data: {
          companySlug,
          name: String(form.get('name') ?? ''),
          currency: String(form.get('currency') ?? ''),
          locale: String(form.get('locale') ?? ''),
          legalName: String(form.get('legalName') ?? ''),
          logoUrl,
          address: String(form.get('address') ?? ''),
          phone: String(form.get('phone') ?? ''),
          email: String(form.get('email') ?? ''),
          taxId: String(form.get('taxId') ?? ''),
          website,
        },
      })
      setMessage(result.ok ? 'Informations entreprise mises a jour.' : result.message)
      if (result.ok) {
        setData((current) => current?.ok ? { ...current, company: result.company } : current)
        await refresh()
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Impossible de mettre a jour les informations.')
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-950">Parametres</h1>
        <p className="text-sm text-slate-500 mt-1">Gestion de l'entreprise, des roles, permissions et gestionnaires.</p>
      </div>

      {message ? (
        <div className="mb-6 rounded border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700">
          {message}
        </div>
      ) : null}

      <div className="flex flex-col gap-8 lg:flex-row">
        <nav className="shrink-0 lg:w-60">
          <div className="space-y-1">
            {visibleTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={
                  'flex w-full items-center gap-3 rounded px-3 py-2.5 text-sm font-semibold transition-colors ' +
                  (activeTab === tab.key ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950')
                }
              >
                <tab.icon className="size-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </nav>

        <div className="min-w-0 flex-1">
          {activeTab === 'security' ? (
            // Onglet personnel : independant des donnees d'administration.
            <SecuritySettings onMessage={setMessage} />
          ) : data === null ? (
            <SettingsSection title="Chargement" description="Recuperation des informations d'administration.">
              <p className="text-sm text-slate-500">Patiente un instant...</p>
            </SettingsSection>
          ) : !data.ok ? (
            <SettingsSection title="Acces impossible" description="Les parametres de cette entreprise ne sont pas disponibles.">
              <p className="text-sm font-semibold text-slate-700">{data.message}</p>
            </SettingsSection>
          ) : (
            <>
              {activeTab === 'general' && <GeneralSettings companySlug={companySlug} data={data} onSubmit={handleUpdateCompany} />}
              {activeTab === 'users' && <UsersSettings companySlug={companySlug} data={data} onMessage={setMessage} onRefresh={refresh} />}
              {activeTab === 'roles' && <RolesSettings companySlug={companySlug} data={data} onSubmit={handleCreateRole} onMessage={setMessage} onRefresh={refresh} />}
              {activeTab === 'modules' && <ModulesSettings companySlug={companySlug} data={data} onMessage={setMessage} onRefresh={refresh} />}
              {activeTab === 'notifications' && <NotificationsSettings />}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function GeneralSettings({
  companySlug,
  data,
  onSubmit,
}: {
  companySlug: string
  data: AdministrationData | null
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
}) {
  const company = data?.ok ? data.company : null
  const logoUrl = company?.logoUrl ?? ''
  const formKey = [
    company?.id,
    company?.name,
    company?.currency,
    company?.locale,
    company?.legalName,
    company?.logoUrl,
    company?.address,
    company?.phone,
    company?.email,
    company?.taxId,
    company?.website,
  ].join('|')

  return (
    <div className="space-y-6">
      <SettingsSection title="Informations entreprise" description="Ces informations seront utilisees sur les documents, devis et factures.">
        <form key={formKey} onSubmit={onSubmit} className="grid gap-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Nom commercial *" name="name" defaultValue={company?.name ?? ''} required placeholder="Nom affiche dans l'application" />
            <TextField label="Nom legal" name="legalName" defaultValue={company?.legalName ?? ''} placeholder="Raison sociale" />
            <div className="sm:col-span-2">
              <ImageUploadField
                label="Logo"
                companySlug={companySlug}
                kind="logo"
                name="logoUrl"
                defaultValue={logoUrl}
                hint="Affiche dans l'application et sur les devis. JPG, PNG, WEBP, GIF ou AVIF. 5 Mo maximum."
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Telephone" name="phone" defaultValue={company?.phone ?? ''} />
            <TextField label="Email" name="email" type="email" defaultValue={company?.email ?? ''} />
            <TextField label="NIF / RCCM" name="taxId" defaultValue={company?.taxId ?? ''} />
            <TextField label="Site web" name="website" defaultValue={company?.website ?? ''} placeholder="https://..." />
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">Devise</span>
              <select
                name="currency"
                defaultValue={company?.currency ?? defaultCurrency}
                className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-950"
              >
                {currencies.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.label}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-slate-400">
                Utilisee pour tous les montants affiches. Ne convertit pas les montants deja enregistres.
              </span>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">Langue par defaut</span>
              <select
                name="locale"
                defaultValue={company?.locale ?? defaultLocale}
                className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-950"
              >
                {locales.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">Adresse</span>
              <textarea name="address" defaultValue={company?.address ?? ''} rows={3} className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-950" placeholder="Adresse complete de l'entreprise" />
            </label>
          </div>

          <div className="flex justify-end border-t border-slate-100 pt-4">
            <button className="inline-flex items-center gap-2 rounded bg-slate-950 px-4 py-2 text-sm font-semibold text-white">
              <Save className="size-4" />
              Enregistrer
            </button>
          </div>
        </form>
      </SettingsSection>

      <SettingsSection title="Contexte technique" description="Cette instance appartient au client et tourne sur son VPS.">
        <div className="grid gap-4 sm:grid-cols-2">
          <ReadOnlyField label="Slug" value={companySlug} />
          <ReadOnlyField label="Type" value="Self-hosted" />
          <ReadOnlyField label="Isolation" value="companyId obligatoire sur les donnees metier" />
        </div>
      </SettingsSection>
    </div>
  )
}

function UsersSettings({
  companySlug,
  data,
  onMessage,
  onRefresh,
}: {
  companySlug: string
  data: AdministrationData | null
  onMessage: (message: string) => void
  onRefresh: () => Promise<void>
}) {
  const roles = data?.ok ? data.roles : []
  const users = data?.ok ? data.users : []
  const invitations = data?.ok ? data.invitations : []
  const [generatedLink, setGeneratedLink] = React.useState<string | null>(null)
  const [resetLink, setResetLink] = React.useState<{ email: string; url: string } | null>(null)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [editingMemberId, setEditingMemberId] = React.useState<string | null>(null)

  async function handleInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSubmitting) return
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    setIsSubmitting(true)
    try {
      const result = await createInvitation({
        data: {
          companySlug,
          email: String(form.get('email') ?? ''),
          roleId: String(form.get('roleId') ?? ''),
        },
      })
      if (!result.ok) {
        onMessage(result.message)
        return
      }
      // Le lien n'est affiche que si l'email n'est pas parti : sinon il n'y a rien
      // a copier, et le montrer inviterait a le transmettre par un canal moins sur.
      setGeneratedLink(result.delivered ? null : `${window.location.origin}${result.invitePath}`)
      onMessage(
        result.delivered
          ? "Invitation envoyee par email a la personne concernee."
          : "Invitation creee. L'email n'a pas pu etre envoye : copie le lien et transmets-le toi-meme.",
      )
      formElement.reset()
      await onRefresh()
    } catch (error: any) {
      onMessage(error?.message ?? 'Impossible de creer l invitation.')
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleRevoke(invitationId: string) {
    await revokeInvitation({ data: { companySlug, invitationId } })
    onMessage('Invitation revoquee.')
    await onRefresh()
  }

  async function handleResetLink(email: string) {
    try {
      const result = await createPasswordResetLink({ data: { companySlug, email } })
      if (!result.ok) {
        onMessage(result.message)
        return
      }
      setResetLink(result.delivered ? null : { email, url: `${window.location.origin}${result.resetPath}` })
      onMessage(
        result.delivered
          ? `Lien de reinitialisation envoye a ${email} (valide ${result.expiresInMinutes} min, usage unique).`
          : `Lien genere pour ${email} (valide ${result.expiresInMinutes} min, usage unique). L'email n'a pas pu etre envoye : transmets-le toi-meme.`,
      )
    } catch (error: any) {
      onMessage(error?.message ?? 'Impossible de generer le lien.')
    }
  }

  async function handleMemberUpdate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingMemberId || isSubmitting) return
    const form = new FormData(event.currentTarget)
    setIsSubmitting(true)
    try {
      const result = await updateMembership({ data: {
        companySlug, membershipId: editingMemberId,
        roleIds: form.getAll('roleIds').map(String),
        status: String(form.get('status')) as 'ACTIVE' | 'SUSPENDED',
      } })
      onMessage(result.ok ? 'Acces du membre mis a jour.' : result.message)
      if (result.ok) { setEditingMemberId(null); await onRefresh() }
    } finally { setIsSubmitting(false) }
  }

  async function handleRemoveMember(user: (typeof users)[number]) {
    if (isSubmitting || !window.confirm(`Retirer ${user.name} de cette entreprise ?`)) return
    setIsSubmitting(true)
    try {
      const result = await removeMembership({ data: { companySlug, membershipId: user.id } })
      onMessage(result.ok ? 'Membre retire de l entreprise.' : result.message)
      if (result.ok) await onRefresh()
    } finally { setIsSubmitting(false) }
  }

  const editingMember = users.find((user) => user.id === editingMemberId)

  return (
    <div className="space-y-6">
      <SettingsSection title="Inviter un membre" description="Genere un lien d'invitation a transmettre : la personne choisit elle-meme son mot de passe. Le lien expire dans 7 jours.">
        <form onSubmit={handleInvite} className="grid gap-3 lg:grid-cols-[2fr_1fr_auto]">
          <input name="email" required type="email" placeholder="Email de la personne" className="rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-950" />
          <select name="roleId" required className="rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-950">
            <option value="">Role</option>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>{role.name}</option>
            ))}
          </select>
          <button disabled={isSubmitting} className="inline-flex items-center justify-center gap-2 rounded bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
            <Plus className="size-4" />
            {isSubmitting ? 'Creation...' : 'Inviter'}
          </button>
        </form>

        {generatedLink ? <CopyableLink label="Lien d'invitation (visible une seule fois)" url={generatedLink} /> : null}

        {invitations.length > 0 ? (
          <div className="mt-4 divide-y divide-slate-100 rounded border border-slate-200">
            {invitations.map((invitation) => (
              <div key={invitation.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{invitation.email}</p>
                  <p className="text-xs text-slate-500">{invitation.roleName} - expire le {new Date(invitation.expiresAt).toLocaleDateString('fr-FR')}</p>
                </div>
                <button onClick={() => void handleRevoke(invitation.id)} className="inline-flex items-center gap-1.5 rounded border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-rose-600" title="Revoquer l'invitation">
                  <Trash2 className="size-3.5" />
                  Revoquer
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </SettingsSection>

      {resetLink ? (
        <SettingsSection title="Lien de reinitialisation" description={`A transmettre a ${resetLink.email}. Valide 30 minutes, usage unique. Toutes ses sessions seront deconnectees.`}>
          <CopyableLink label="Lien de reinitialisation (visible une seule fois)" url={resetLink.url} />
        </SettingsSection>
      ) : null}

      <div className="overflow-x-auto rounded border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 font-semibold">Utilisateur</th>
              <th className="px-4 py-3 font-semibold">Roles</th>
              <th className="px-4 py-3 font-semibold">Statut</th>
              <th className="px-4 py-3 font-semibold">Derniere connexion</th>
              <th className="px-4 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((user) => (
              <tr key={user.id} className="list-row">
                <td className="px-4 py-3">
                  <p className="font-semibold text-slate-900">{user.name}</p>
                  <p className="text-xs text-slate-500">{user.email}</p>
                </td>
                <td className="px-4 py-3">{user.roles.join(', ')}</td>
                <td className="px-4 py-3">
                  <span className={`rounded px-2 py-0.5 text-xs font-semibold ${statusClass(user.status)}`}>{statusLabel(user.status)}</span>
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">
                  {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString('fr-FR') : 'Jamais'}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex flex-wrap justify-end gap-2">
                  <button onClick={() => void handleResetLink(user.email)} className="inline-flex items-center gap-1.5 rounded border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50" title="Generer un lien de reinitialisation de mot de passe">
                    <KeyRound className="size-3.5" />
                    Lien de reinit.
                  </button>
                  {!user.isOwner ? (
                    <>
                      <button onClick={() => setEditingMemberId(user.id)} className="inline-flex items-center gap-1.5 rounded border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"><Pencil className="size-3.5" />Acces</button>
                      <button onClick={() => void handleRemoveMember(user)} className="inline-flex items-center gap-1.5 rounded border border-rose-200 px-2.5 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50"><Trash2 className="size-3.5" />Retirer</button>
                    </>
                  ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editingMember ? (
        <SettingsSection title={`Acces de ${editingMember.name}`} description="Attribue ses roles et controle son acces a cette entreprise.">
          <form onSubmit={handleMemberUpdate} className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {roles.map((role) => (
                <label key={role.id} className="flex items-center gap-2 rounded border border-slate-200 px-3 py-2 text-sm text-slate-700">
                  <input type="checkbox" name="roleIds" value={role.id} defaultChecked={editingMember.roleIds.includes(role.id)} />
                  {role.name}
                </label>
              ))}
            </div>
            <select name="status" defaultValue={editingMember.status === 'SUSPENDED' ? 'SUSPENDED' : 'ACTIVE'} className="rounded border border-slate-300 px-3 py-2 text-sm">
              <option value="ACTIVE">Actif</option><option value="SUSPENDED">Suspendu</option>
            </select>
            <div className="flex gap-2">
              <button disabled={isSubmitting} className="inline-flex items-center gap-2 rounded bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"><Save className="size-4" />Enregistrer</button>
              <button type="button" onClick={() => setEditingMemberId(null)} className="rounded border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600">Annuler</button>
            </div>
          </form>
        </SettingsSection>
      ) : null}
    </div>
  )
}

function CopyableLink({ label, url }: { label: string; url: string }) {
  const [copied, setCopied] = React.useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Le champ reste selectionnable manuellement si le presse-papier est bloque.
    }
  }

  return (
    <div className="mt-4 rounded border border-emerald-200 bg-emerald-50 p-3">
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-emerald-800">{label}</p>
      <div className="flex items-center gap-2">
        <input readOnly value={url} onFocus={(event) => event.target.select()} className="w-full rounded border border-emerald-200 bg-white px-3 py-2 font-mono text-xs text-slate-700 outline-none" />
        <button type="button" onClick={() => void copy()} className="inline-flex shrink-0 items-center gap-1.5 rounded bg-slate-950 px-3 py-2 text-xs font-semibold text-white">
          <Copy className="size-3.5" />
          {copied ? 'Copie !' : 'Copier'}
        </button>
      </div>
    </div>
  )
}

function SecuritySettings({ onMessage }: { onMessage: (message: string) => void }) {
  const [overview, setOverview] = React.useState<Awaited<ReturnType<typeof getSecurityOverview>> | null>(null)
  const [sessions, setSessions] = React.useState<Awaited<ReturnType<typeof listMySessions>>>([])
  const [totpSetup, setTotpSetup] = React.useState<{ secret: string; uri: string } | null>(null)
  const [totpCode, setTotpCode] = React.useState('')
  const [currentPassword, setCurrentPassword] = React.useState('')
  const [newPassword, setNewPassword] = React.useState('')
  const [confirmPassword, setConfirmPassword] = React.useState('')
  const [isBusy, setIsBusy] = React.useState(false)

  const refresh = React.useCallback(async () => {
    const [nextOverview, nextSessions] = await Promise.all([getSecurityOverview(), listMySessions()])
    setOverview(nextOverview)
    setSessions(nextSessions)
  }, [])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  async function handleStartTotp() {
    const result = await startTotpSetup()
    if (!result.ok) {
      onMessage(result.message)
      return
    }
    setTotpSetup({ secret: result.secret, uri: result.uri })
    setTotpCode('')
  }

  async function handleConfirmTotp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const result = await confirmTotpSetup({ data: { code: totpCode } })
    onMessage(result.ok ? 'Double authentification activee.' : result.message)
    if (result.ok) {
      setTotpSetup(null)
      setTotpCode('')
      await refresh()
    }
  }

  async function handleDisableTotp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const result = await disableTotp({ data: { code: totpCode } })
    onMessage(result.ok ? 'Double authentification desactivee.' : result.message)
    if (result.ok) {
      setTotpCode('')
      await refresh()
    }
  }

  async function handleChangePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (newPassword !== confirmPassword) {
      onMessage('Les deux nouveaux mots de passe ne correspondent pas.')
      return
    }
    if (isBusy) return
    setIsBusy(true)
    try {
      const result = await changePassword({ data: { currentPassword, newPassword } })
      onMessage(result.ok ? 'Mot de passe modifie. Les autres sessions ont ete deconnectees.' : result.message)
      if (result.ok) {
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
        await refresh()
      }
    } finally {
      setIsBusy(false)
    }
  }

  async function handleRevokeSession(sessionId: string) {
    await revokeSession({ data: { sessionId } })
    onMessage('Session revoquee.')
    await refresh()
  }

  async function handleRevokeOthers() {
    await revokeOtherSessions()
    onMessage('Toutes les autres sessions ont ete deconnectees.')
    await refresh()
  }

  const fieldClass = 'w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-950'

  return (
    <div className="space-y-6">
      <SettingsSection
        title="Double authentification (2FA)"
        description="Un code a 6 chiffres genere par une application (Google Authenticator, Aegis, 1Password...) sera demande a chaque connexion."
      >
        {overview === null ? (
          <p className="text-sm text-slate-500">Chargement...</p>
        ) : overview.totpEnabled ? (
          <form onSubmit={handleDisableTotp} className="space-y-3">
            <p className="inline-flex items-center gap-2 rounded bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
              <ShieldCheck className="size-4" />
              La double authentification est active sur votre compte.
            </p>
            <div className="flex items-end gap-3">
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">Code actuel pour desactiver</span>
                <input value={totpCode} onChange={(event) => setTotpCode(event.target.value)} required inputMode="numeric" placeholder="123456" className={fieldClass} />
              </label>
              <button className="rounded border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100">Desactiver</button>
            </div>
          </form>
        ) : totpSetup ? (
          <form onSubmit={handleConfirmTotp} className="space-y-4">
            <div className="rounded border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-800">1. Ajoute ce compte dans ton application d'authentification :</p>
              <p className="mt-2 select-all break-all rounded border border-slate-200 bg-white px-3 py-2 font-mono text-sm font-bold tracking-wider text-slate-900">{totpSetup.secret}</p>
              <p className="mt-2 text-xs text-slate-500">Saisie manuelle : choisis « Cle de configuration » dans l'application, ou utilise ce lien :</p>
              <p className="mt-1 select-all break-all font-mono text-[11px] text-slate-500">{totpSetup.uri}</p>
            </div>
            <div className="flex items-end gap-3">
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">2. Code affiche par l'application</span>
                <input value={totpCode} onChange={(event) => setTotpCode(event.target.value)} required inputMode="numeric" placeholder="123456" className={fieldClass} />
              </label>
              <button className="rounded bg-slate-950 px-4 py-2 text-sm font-semibold text-white">Activer</button>
            </div>
          </form>
        ) : (
          <button onClick={() => void handleStartTotp()} className="inline-flex items-center gap-2 rounded bg-slate-950 px-4 py-2 text-sm font-semibold text-white">
            <ShieldCheck className="size-4" />
            Activer la double authentification
          </button>
        )}
      </SettingsSection>

      <SettingsSection title="Changer mon mot de passe" description="Les autres sessions actives seront deconnectees apres le changement.">
        <form onSubmit={handleChangePassword} className="grid gap-3 sm:grid-cols-3">
          <input value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required type="password" autoComplete="current-password" placeholder="Mot de passe actuel" className={fieldClass} />
          <input value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required minLength={10} type="password" autoComplete="new-password" placeholder="Nouveau (10 car. min.)" className={fieldClass} />
          <input value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required type="password" autoComplete="new-password" placeholder="Confirmer" className={fieldClass} />
          <div className="sm:col-span-3">
            <button disabled={isBusy} className="inline-flex items-center gap-2 rounded bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
              <Save className="size-4" />
              {isBusy ? 'Modification...' : 'Modifier le mot de passe'}
            </button>
          </div>
        </form>
      </SettingsSection>

      <SettingsSection title="Sessions actives" description="Les appareils actuellement connectes a votre compte.">
        <div className="divide-y divide-slate-100 rounded border border-slate-200">
          {sessions.map((session) => (
            <div key={session.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">
                  {session.current ? 'Cet appareil' : session.userAgent ? shortUserAgent(session.userAgent) : 'Appareil inconnu'}
                  {session.current ? <span className="ml-2 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-emerald-700">Session courante</span> : null}
                </p>
                <p className="text-xs text-slate-500">
                  {session.ip ?? 'IP inconnue'} - connecte le {new Date(session.createdAt).toLocaleString('fr-FR')}
                </p>
              </div>
              {!session.current ? (
                <button onClick={() => void handleRevokeSession(session.id)} className="inline-flex items-center gap-1.5 rounded border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-rose-600">
                  <Trash2 className="size-3.5" />
                  Deconnecter
                </button>
              ) : null}
            </div>
          ))}
        </div>
        {sessions.filter((session) => !session.current).length > 0 ? (
          <button onClick={() => void handleRevokeOthers()} className="mt-3 rounded border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
            Deconnecter toutes les autres sessions
          </button>
        ) : null}
      </SettingsSection>
    </div>
  )
}

function shortUserAgent(userAgent: string) {
  if (userAgent.includes('Edg/')) return 'Microsoft Edge'
  if (userAgent.includes('Chrome/')) return 'Chrome'
  if (userAgent.includes('Firefox/')) return 'Firefox'
  if (userAgent.includes('Safari/')) return 'Safari'
  return userAgent.slice(0, 60)
}

function ModulesSettings({ companySlug, data, onMessage, onRefresh }: { companySlug: string; data: AdministrationData | null; onMessage: (message: string) => void; onRefresh: () => Promise<void> }) {
  const modules = data?.ok ? data.modules : []
  const [busyKey, setBusyKey] = React.useState<string | null>(null)
  async function toggle(moduleKey: string, enabled: boolean) {
    setBusyKey(moduleKey)
    try {
      const result = await updateCompanyModule({ data: { companySlug, moduleKey, enabled } })
      onMessage(result.ok ? `Module ${enabled ? 'active' : 'desactive'}.` : result.message)
      if (result.ok) await onRefresh()
    } finally { setBusyKey(null) }
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {modules.map((module) => (
        <div key={module.key} className="rounded border border-slate-200 bg-white p-5">
          <div className="flex items-start justify-between gap-4">
            <div><h3 className="font-bold text-slate-950">{module.name}</h3><p className="mt-1 text-xs text-slate-500">{module.description || module.category}</p></div>
            <button disabled={busyKey === module.key || module.key === 'settings'} onClick={() => void toggle(module.key, !module.enabled)} className="disabled:cursor-not-allowed disabled:opacity-50" aria-label={`${module.enabled ? 'Desactiver' : 'Activer'} ${module.name}`}>
              {module.enabled ? <ToggleRight className="size-7 text-emerald-600" /> : <ToggleLeft className="size-7 text-slate-300" />}
            </button>
          </div>
          <p className={`mt-4 text-xs font-bold uppercase tracking-wide ${module.enabled ? 'text-emerald-700' : 'text-slate-400'}`}>{module.enabled ? 'Actif' : 'Desactive'}</p>
        </div>
      ))}
    </div>
  )
}

function RolesSettings({
  companySlug,
  data,
  onSubmit,
  onMessage,
  onRefresh,
}: {
  companySlug: string
  data: AdministrationData | null
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
  onMessage: (message: string) => void
  onRefresh: () => Promise<void>
}) {
  const roles = data?.ok ? data.roles : []
  const permissions = data?.ok ? data.permissions : []
  const [editingRoleId, setEditingRoleId] = React.useState<string | null>(null)
  const [isBusy, setIsBusy] = React.useState(false)

  async function handleUpdate(event: React.FormEvent<HTMLFormElement>, roleId: string) {
    event.preventDefault()
    if (isBusy) return
    const form = new FormData(event.currentTarget)
    setIsBusy(true)
    try {
      const result = await updateRole({
        data: {
          companySlug,
          roleId,
          name: String(form.get('name') ?? ''),
          description: String(form.get('description') ?? ''),
          permissionKeys: form.getAll('permissionKeys').map(String),
        },
      })
      onMessage(result.ok ? 'Role modifie.' : result.message)
      if (result.ok) {
        setEditingRoleId(null)
        await onRefresh()
      }
    } finally {
      setIsBusy(false)
    }
  }

  async function handleDelete(roleId: string, roleName: string) {
    if (isBusy || !window.confirm(`Supprimer definitivement le role « ${roleName} » ?`)) return
    setIsBusy(true)
    try {
      const result = await deleteRole({ data: { companySlug, roleId } })
      onMessage(result.ok ? 'Role supprime.' : result.message)
      if (result.ok) await onRefresh()
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <SettingsSection title="Nouveau role" description="Compose un role avec des permissions precises pour cette entreprise.">
        <form onSubmit={onSubmit} className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <input name="name" required placeholder="Nom du role" className="rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-950" />
            <input name="description" placeholder="Description" className="rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-950" />
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {permissions.map((permission) => (
              <label key={permission.key} className="flex items-center gap-2 rounded border border-slate-200 px-3 py-2 text-sm text-slate-700">
                <input type="checkbox" name="permissionKeys" value={permission.key} />
                {permission.key}
              </label>
            ))}
          </div>
          <button className="inline-flex w-fit items-center gap-2 rounded bg-slate-950 px-4 py-2 text-sm font-semibold text-white">
            <Plus className="size-4" />
            Creer le role
          </button>
        </form>
      </SettingsSection>

      <div className="grid gap-4 sm:grid-cols-2">
        {roles.map((role) => (
          <div key={role.id} className="list-row rounded border border-slate-200 bg-white p-5">
            {editingRoleId === role.id ? (
              <form onSubmit={(event) => void handleUpdate(event, role.id)} className="space-y-4">
                <div className="grid gap-3">
                  <input name="name" defaultValue={role.name} required className="rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-950" />
                  <input name="description" defaultValue={role.description} placeholder="Description" className="rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-950" />
                </div>
                <div className="grid gap-2">
                  {permissions.map((permission) => (
                    <label key={permission.key} className="flex items-center gap-2 rounded border border-slate-200 px-3 py-2 text-xs text-slate-700">
                      <input type="checkbox" name="permissionKeys" value={permission.key} defaultChecked={role.permissions.includes(permission.key)} />
                      {permission.key}
                    </label>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button disabled={isBusy} className="inline-flex items-center gap-2 rounded bg-slate-950 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"><Save className="size-3.5" />Enregistrer</button>
                  <button type="button" onClick={() => setEditingRoleId(null)} className="inline-flex items-center gap-2 rounded border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600"><X className="size-3.5" />Annuler</button>
                </div>
              </form>
            ) : (
              <>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-bold text-slate-950">{role.name}</h3>
                <p className="mt-1 text-xs text-slate-500">{role.description || 'Role personnalise'}</p>
              </div>
              <span className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">{role.users} utilisateur{role.users > 1 ? 's' : ''}</span>
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {role.permissions.slice(0, 8).map((permission) => (
                <span key={permission} className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">{permission}</span>
              ))}
              {role.permissions.length > 8 ? <span className="text-xs text-slate-400">+{role.permissions.length - 8}</span> : null}
            </div>
                <div className="mt-4 flex gap-2 border-t border-slate-100 pt-4">
                  {role.systemKey ? (
                    <span className="text-xs font-semibold text-slate-400">Role systeme protege</span>
                  ) : (
                    <>
                      <button type="button" onClick={() => setEditingRoleId(role.id)} className="inline-flex items-center gap-1.5 rounded border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"><Pencil className="size-3.5" />Modifier</button>
                      <button type="button" disabled={isBusy} onClick={() => void handleDelete(role.id, role.name)} className="inline-flex items-center gap-1.5 rounded border border-rose-200 px-2.5 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-60"><Trash2 className="size-3.5" />Supprimer</button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

const notificationSettings = [
  { id: 'email_invoices', label: 'Factures et paiements', description: 'Recevoir un email pour chaque nouvelle facture ou paiement', enabled: true },
  { id: 'email_stock', label: 'Alertes de stock', description: 'Notification quand un produit passe sous le seuil minimum', enabled: true },
  { id: 'email_security', label: 'Connexions suspectes', description: 'Alerte en cas de connexion depuis un appareil inconnu', enabled: true },
]

function NotificationsSettings() {
  const [settings, setSettings] = React.useState(notificationSettings)

  return (
    <div className="rounded border border-slate-200 bg-white divide-y divide-slate-100">
      {settings.map((setting) => (
        <div key={setting.id} className="list-row flex items-center justify-between px-5 py-4">
          <div>
            <p className="text-sm font-bold text-slate-900">{setting.label}</p>
            <p className="text-xs text-slate-500 mt-0.5">{setting.description}</p>
          </div>
          <button onClick={() => setSettings((prev) => prev.map((item) => item.id === setting.id ? { ...item, enabled: !item.enabled } : item))}>
            {setting.enabled ? <ToggleRight className="size-6 text-slate-950" /> : <ToggleLeft className="size-6 text-slate-300" />}
          </button>
        </div>
      ))}
    </div>
  )
}

function SettingsSection({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="rounded border border-slate-200 bg-white p-5">
      <div className="mb-4">
        <h3 className="font-bold text-slate-950">{title}</h3>
        <p className="mt-0.5 text-xs text-slate-500">{description}</p>
      </div>
      {children}
    </div>
  )
}

function TextField({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      <input {...props} className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-950" />
    </label>
  )
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</label>
      <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800">{value}</div>
    </div>
  )
}

function isOptionalHttpUrl(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return true
  try {
    const url = new URL(trimmed)
    return ['http:', 'https:'].includes(url.protocol)
  } catch {
    return false
  }
}

function normalizeOptionalUrl(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

function statusLabel(status: string) {
  const normalized = status.toUpperCase()
  if (normalized === 'ACTIVE') return 'Actif'
  if (normalized === 'INVITED') return 'Invite'
  if (normalized === 'SUSPENDED') return 'Suspendu'
  return status
}

function statusClass(status: string) {
  const normalized = status.toUpperCase()
  if (normalized === 'ACTIVE') return 'bg-emerald-50 text-emerald-700'
  if (normalized === 'INVITED') return 'bg-amber-50 text-amber-700'
  return 'bg-slate-100 text-slate-600'
}
