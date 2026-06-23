import { createFileRoute } from '@tanstack/react-router'
import { Building2, Image as ImageIcon, Mail, Plus, Save, ShieldCheck, ToggleLeft, ToggleRight, Users } from 'lucide-react'
import * as React from 'react'
import { addManager, createRole, getCompanyAdministration, updateCompanyProfile } from '~/server/auth'

export const Route = createFileRoute('/$companySlug/settings')({
  component: SettingsPage,
})

type SettingsTab = 'general' | 'users' | 'roles' | 'notifications'

type AdministrationData = Awaited<ReturnType<typeof getCompanyAdministration>>

const settingsTabs = [
  { key: 'general' as const, label: 'General', icon: Building2 },
  { key: 'users' as const, label: 'Utilisateurs', icon: Users },
  { key: 'roles' as const, label: 'Roles & permissions', icon: ShieldCheck },
  { key: 'notifications' as const, label: 'Notifications', icon: Mail },
]

function SettingsPage() {
  const { companySlug } = Route.useParams()
  const [activeTab, setActiveTab] = React.useState<SettingsTab>('general')
  const [data, setData] = React.useState<AdministrationData | null>(null)
  const [message, setMessage] = React.useState<string | null>(null)

  const refresh = React.useCallback(async () => {
    const administrationData = await getCompanyAdministration({ data: { companySlug } })
    setData(administrationData)
  }, [companySlug])

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

  async function handleAddManager(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const result = await addManager({
      data: {
        companySlug,
        name: String(form.get('name') ?? ''),
        email: String(form.get('email') ?? ''),
        roleId: String(form.get('roleId') ?? ''),
        temporaryPassword: String(form.get('temporaryPassword') ?? ''),
      },
    })
    setMessage(result.ok ? 'Gestionnaire ajoute.' : result.message)
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
            {settingsTabs.map((tab) => (
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
          {data === null ? (
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
              {activeTab === 'users' && <UsersSettings data={data} onSubmit={handleAddManager} />}
              {activeTab === 'roles' && <RolesSettings data={data} onSubmit={handleCreateRole} />}
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
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded border border-slate-200 bg-slate-50">
              {logoUrl ? (
                <img src={logoUrl} alt="Logo entreprise" className="size-full object-contain" />
              ) : (
                <ImageIcon className="size-8 text-slate-300" />
              )}
            </div>
            <div className="grid min-w-0 flex-1 gap-4 sm:grid-cols-2">
              <TextField label="Nom commercial *" name="name" defaultValue={company?.name ?? ''} required placeholder="Nom affiche dans l'application" />
              <TextField label="Nom legal" name="legalName" defaultValue={company?.legalName ?? ''} placeholder="Raison sociale" />
              <div className="sm:col-span-2">
                <TextField label="Logo URL" name="logoUrl" defaultValue={logoUrl} placeholder="https://..." />
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Telephone" name="phone" defaultValue={company?.phone ?? ''} />
            <TextField label="Email" name="email" type="email" defaultValue={company?.email ?? ''} />
            <TextField label="NIF / RCCM" name="taxId" defaultValue={company?.taxId ?? ''} />
            <TextField label="Site web" name="website" defaultValue={company?.website ?? ''} placeholder="https://..." />
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
  data,
  onSubmit,
}: {
  data: AdministrationData | null
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
}) {
  const roles = data?.ok ? data.roles : []
  const users = data?.ok ? data.users : []

  return (
    <div className="space-y-6">
      <SettingsSection title="Ajouter un gestionnaire" description="Cree un utilisateur et lui donne un role dans cette entreprise.">
        <form onSubmit={onSubmit} className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr_1fr_auto]">
          <input name="name" required placeholder="Nom" className="rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-950" />
          <input name="email" required type="email" placeholder="Email" className="rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-950" />
          <select name="roleId" required className="rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-950">
            <option value="">Role</option>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>{role.name}</option>
            ))}
          </select>
          <input name="temporaryPassword" required type="password" placeholder="Mot de passe temporaire" className="rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-950" />
          <button className="inline-flex items-center justify-center gap-2 rounded bg-slate-950 px-4 py-2 text-sm font-semibold text-white">
            <Plus className="size-4" />
            Ajouter
          </button>
        </form>
      </SettingsSection>

      <div className="overflow-hidden rounded border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 font-semibold">Utilisateur</th>
              <th className="px-4 py-3 font-semibold">Roles</th>
              <th className="px-4 py-3 font-semibold">Statut</th>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function RolesSettings({
  data,
  onSubmit,
}: {
  data: AdministrationData | null
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
}) {
  const roles = data?.ok ? data.roles : []
  const permissions = data?.ok ? data.permissions : []

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
