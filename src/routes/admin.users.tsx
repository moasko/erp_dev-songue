import { createFileRoute, useRouter } from '@tanstack/react-router'
import {
  Ban,
  CircleCheck,
  Download,
  Eye,
  Fingerprint,
  KeyRound,
  LogOut,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import * as React from 'react'
import {
  createUserResetLink,
  deletePlatformUser,
  disableUserTotp,
  getPlatformUserDetail,
  listPlatformUsers,
  revokeUserSessions,
  setUserSuspended,
  setUserVerified,
} from '~/server/platformAdmin'
import {
  AdminBadge,
  AdminCard,
  AdminEmpty,
  AdminPageHeader,
  AdminTable,
  IconButton,
  ModalShell,
  downloadCsv,
  formatDate,
  formatDateTime,
} from '~/components/AdminUI'

export const Route = createFileRoute('/admin/users')({
  loader: async () => listPlatformUsers(),
  component: UsersPage,
})

type UserRow = Awaited<ReturnType<typeof listPlatformUsers>>['users'][number]
type StatusFilter = 'all' | 'verified' | 'pending' | 'suspended' | 'totp' | 'admins'

const statusFilters: Array<{ key: StatusFilter; label: string }> = [
  { key: 'all', label: 'Tous' },
  { key: 'verified', label: 'Valides' },
  { key: 'pending', label: 'En attente' },
  { key: 'suspended', label: 'Suspendus' },
  { key: 'totp', label: '2FA active' },
  { key: 'admins', label: 'Super admins' },
]

function UsersPage() {
  const data = Route.useLoaderData()
  const router = useRouter()
  const context = Route.useRouteContext() as { admin?: { email: string } | null }
  const [message, setMessage] = React.useState<string | null>(null)
  const [resetLink, setResetLink] = React.useState<string | null>(null)
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState('')
  const [filter, setFilter] = React.useState<StatusFilter>('all')
  const [detailId, setDetailId] = React.useState<string | null>(null)
  const [suspendTarget, setSuspendTarget] = React.useState<UserRow | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<UserRow | null>(null)

  if (!data.ok) return <AdminEmpty>Donnees indisponibles.</AdminEmpty>

  const adminEmail = context.admin?.email?.toLowerCase() ?? ''

  const users = data.users.filter((user) => {
    const query = search.trim().toLowerCase()
    if (query && !`${user.name} ${user.email}`.toLowerCase().includes(query)) return false
    if (filter === 'verified') return user.verified && !user.disabled
    if (filter === 'pending') return !user.verified
    if (filter === 'suspended') return user.disabled
    if (filter === 'totp') return user.totpEnabled
    if (filter === 'admins') return user.isSuperAdmin
    return true
  })

  const counts = {
    total: data.users.length,
    pending: data.users.filter((user) => !user.verified).length,
    suspended: data.users.filter((user) => user.disabled).length,
  }

  async function refresh() {
    await router.invalidate()
  }

  // Les actions sensibles sont bloquees cote serveur pour les super admins et
  // pour son propre compte ; on retire aussi les boutons pour ne pas induire en erreur.
  function isProtected(user: UserRow) {
    return user.isSuperAdmin || user.email.toLowerCase() === adminEmail
  }

  async function handleVerify(user: UserRow, verified: boolean) {
    if (
      !verified &&
      !window.confirm(
        `Devalider « ${user.email} » ? Ses sessions seront revoquees et il devra reverifier son email pour se reconnecter.`,
      )
    ) {
      return
    }
    setBusyId(user.id)
    setResetLink(null)
    const result = await setUserVerified({ data: { userId: user.id, verified } })
    setBusyId(null)
    setMessage(result.ok ? `Compte ${user.email} ${verified ? 'valide' : 'devalide'}.` : result.message)
    if (result.ok) await refresh()
  }

  async function handleReactivate(user: UserRow) {
    if (!window.confirm(`Reactiver « ${user.email} » ? Il retrouvera l'acces a ses entreprises.`)) return
    setBusyId(user.id)
    setResetLink(null)
    const result = await setUserSuspended({ data: { userId: user.id, suspend: false } })
    setBusyId(null)
    setMessage(result.ok ? `Compte ${user.email} reactive (${result.affected} acces retabli(s)).` : result.message)
    if (result.ok) await refresh()
  }

  async function handleDisableTotp(user: UserRow) {
    if (
      !window.confirm(
        `Desactiver la 2FA de « ${user.email} » ? Il sera deconnecte et pourra se reconnecter sans code. A reserver aux demandes d'assistance verifiees.`,
      )
    ) {
      return
    }
    setBusyId(user.id)
    setResetLink(null)
    const result = await disableUserTotp({ data: { userId: user.id } })
    setBusyId(null)
    setMessage(result.ok ? `2FA desactivee pour ${user.email}.` : result.message)
    if (result.ok) await refresh()
  }

  async function handleRevoke(user: UserRow) {
    setBusyId(user.id)
    setResetLink(null)
    const result = await revokeUserSessions({ data: { userId: user.id } })
    setBusyId(null)
    setMessage(result.ok ? `Sessions de ${user.email} revoquees (${result.revoked}).` : result.message)
    if (result.ok) await refresh()
  }

  async function handleReset(user: UserRow) {
    setBusyId(user.id)
    setResetLink(null)
    const result = await createUserResetLink({ data: { userId: user.id } })
    setBusyId(null)
    if (result.ok) {
      setMessage(
        `Lien de reinitialisation cree pour ${user.email}${result.delivered ? ' (envoye par email).' : '.'} Valide ${result.expiresInMinutes} min.`,
      )
      setResetLink(result.resetPath)
    } else {
      setMessage(result.message)
    }
  }

  function handleExport() {
    downloadCsv(
      'utilisateurs.csv',
      ['Nom', 'Email', 'Statut', 'Suspendu', '2FA', 'Super admin', 'Entreprises', 'Sessions', 'Derniere connexion', 'Cree le'],
      users.map((user) => [
        user.name,
        user.email,
        user.verified ? 'Valide' : 'En attente',
        user.disabled ? 'Oui' : 'Non',
        user.totpEnabled ? 'Oui' : 'Non',
        user.isSuperAdmin ? 'Oui' : 'Non',
        user.companies.map((company) => company.name).join(', '),
        user.sessions,
        formatDateTime(user.lastLoginAt),
        formatDate(user.createdAt),
      ]),
    )
  }

  return (
    <div>
      <AdminPageHeader
        title="Utilisateurs"
        description={`${counts.total} compte(s) · ${counts.pending} en attente de validation · ${counts.suspended} suspendu(s).`}
        icon={Users}
        actions={
          <button
            type="button"
            onClick={handleExport}
            className="inline-flex items-center gap-1.5 rounded border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50"
          >
            <Download className="size-3.5" />
            Export CSV
          </button>
        }
      />

      {message ? (
        <div className="mb-4 rounded border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700">
          {message}
          {resetLink ? (
            <code className="mt-1 block break-all rounded bg-white px-2 py-1 text-xs font-normal text-slate-600">{resetLink}</code>
          ) : null}
        </div>
      ) : null}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {statusFilters.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setFilter(item.key)}
              className={`rounded border px-3 py-1.5 text-xs font-semibold transition-colors ${
                filter === item.key
                  ? 'border-slate-950 bg-slate-950 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Rechercher par nom ou email…"
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-950 sm:max-w-xs"
        />
      </div>

      <AdminCard>
        {users.length === 0 ? (
          <AdminEmpty>Aucun utilisateur ne correspond.</AdminEmpty>
        ) : (
          <AdminTable
            head={
              <>
                <th className="px-4 py-2.5">Utilisateur</th>
                <th className="px-4 py-2.5">Entreprises</th>
                <th className="px-4 py-2.5">Statut</th>
                <th className="px-4 py-2.5">Derniere connexion</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </>
            }
          >
            {users.map((user) => {
              const protectedUser = isProtected(user)
              return (
                <tr key={user.id} className="list-row align-top">
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1.5 font-semibold text-slate-950">
                      {user.name}
                      {user.isSuperAdmin ? (
                        <ShieldAlert className="size-3.5 text-slate-950" aria-label="Super admin" />
                      ) : null}
                    </span>
                    <span className="block text-xs text-slate-400">{user.email}</span>
                    <span className="mt-1 flex flex-wrap gap-1">
                      {user.isSuperAdmin ? <AdminBadge tone="risk">Super admin</AdminBadge> : null}
                      {user.isOwner ? <AdminBadge tone="info">Proprietaire</AdminBadge> : null}
                      {user.totpEnabled ? <AdminBadge tone="good">2FA</AdminBadge> : null}
                      {user.mustChangePassword ? <AdminBadge tone="warn">Mdp a changer</AdminBadge> : null}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {user.companies.length === 0 ? (
                      <span className="text-xs text-slate-400">Aucune</span>
                    ) : (
                      <ul className="space-y-0.5">
                        {user.companies.map((company) => (
                          <li key={company.slug} className="text-xs text-slate-600">
                            <span className="font-semibold text-slate-700">{company.name}</span>
                            {company.status !== 'ACTIVE' ? (
                              <span className="font-semibold text-red-600"> · {company.status === 'DISABLED' ? 'suspendu' : company.status.toLowerCase()}</span>
                            ) : null}
                            {company.roles.length ? <span className="text-slate-400"> · {company.roles.join(', ')}</span> : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col items-start gap-1">
                      {user.disabled ? (
                        <AdminBadge tone="risk">Suspendu</AdminBadge>
                      ) : user.verified ? (
                        <AdminBadge tone="good">Valide</AdminBadge>
                      ) : (
                        <AdminBadge tone="warn">En attente</AdminBadge>
                      )}
                      <span className="text-xs text-slate-400">{user.sessions} session(s)</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{formatDateTime(user.lastLoginAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <IconButton title="Details" onClick={() => setDetailId(user.id)}>
                        <Eye className="size-3.5" />
                      </IconButton>
                      {user.verified ? (
                        !protectedUser ? (
                          <IconButton title="Devalider (email a reverifier)" disabled={busyId === user.id} onClick={() => handleVerify(user, false)}>
                            <ShieldOff className="size-3.5" />
                          </IconButton>
                        ) : null
                      ) : (
                        <IconButton title="Valider le compte" tone="good" disabled={busyId === user.id} onClick={() => handleVerify(user, true)}>
                          <ShieldCheck className="size-3.5" />
                        </IconButton>
                      )}
                      {!protectedUser ? (
                        user.disabled ? (
                          <IconButton title="Reactiver" tone="good" disabled={busyId === user.id} onClick={() => handleReactivate(user)}>
                            <CircleCheck className="size-3.5" />
                          </IconButton>
                        ) : (
                          <IconButton
                            title="Suspendre"
                            tone="warn"
                            disabled={busyId === user.id || user.companies.length === 0}
                            onClick={() => { setSuspendTarget(user); setMessage(null) }}
                          >
                            <Ban className="size-3.5" />
                          </IconButton>
                        )
                      ) : null}
                      {user.totpEnabled && !protectedUser ? (
                        <IconButton title="Desactiver la 2FA (assistance)" tone="warn" disabled={busyId === user.id} onClick={() => handleDisableTotp(user)}>
                          <Fingerprint className="size-3.5" />
                        </IconButton>
                      ) : null}
                      <IconButton title="Lien de reinitialisation" disabled={busyId === user.id} onClick={() => handleReset(user)}>
                        <KeyRound className="size-3.5" />
                      </IconButton>
                      <IconButton title="Deconnecter (revoquer les sessions)" disabled={busyId === user.id || user.sessions === 0} onClick={() => handleRevoke(user)}>
                        <LogOut className="size-3.5" />
                      </IconButton>
                      {!protectedUser ? (
                        <IconButton title="Supprimer le compte" tone="risk" onClick={() => { setDeleteTarget(user); setMessage(null) }}>
                          <Trash2 className="size-3.5" />
                        </IconButton>
                      ) : null}
                    </div>
                  </td>
                </tr>
              )
            })}
          </AdminTable>
        )}
      </AdminCard>

      {detailId ? <UserDetailModal userId={detailId} onClose={() => setDetailId(null)} /> : null}

      {suspendTarget ? (
        <SuspendUserModal
          user={suspendTarget}
          onClose={() => setSuspendTarget(null)}
          onDone={async (email, affected) => {
            setSuspendTarget(null)
            setMessage(`Compte ${email} suspendu (${affected} acces coupe(s)).`)
            await refresh()
          }}
        />
      ) : null}

      {deleteTarget ? (
        <DeleteUserModal
          user={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={async (email) => {
            setDeleteTarget(null)
            setMessage(`Compte ${email} supprime.`)
            await refresh()
          }}
        />
      ) : null}
    </div>
  )
}

function SuspendUserModal({
  user,
  onClose,
  onDone,
}: {
  user: UserRow
  onClose: () => void
  onDone: (email: string, affected: number) => void
}) {
  const [reason, setReason] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)

  async function handleSuspend() {
    if (!reason.trim()) {
      setError('Un motif est requis.')
      return
    }
    setSubmitting(true)
    setError(null)
    const result = await setUserSuspended({ data: { userId: user.id, suspend: true, reason: reason.trim() } })
    setSubmitting(false)
    if (result.ok) onDone(user.email, result.affected)
    else setError(result.message)
  }

  return (
    <ModalShell onClose={onClose}>
      <div className="flex items-center gap-2.5">
        <span className="flex size-9 items-center justify-center rounded bg-amber-50 text-amber-600">
          <Ban className="size-4" />
        </span>
        <h2 className="text-base font-bold text-slate-950">Suspendre cet utilisateur ?</h2>
      </div>
      <p className="mt-3 text-sm text-slate-600">
        <strong>{user.email}</strong> sera deconnecte et perdra l'acces a toutes ses entreprises
        ({user.companies.length}). L'action est reversible via « Reactiver ».
      </p>
      <label className="mt-4 block">
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">Motif (obligatoire)</span>
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={3}
          autoFocus
          placeholder="Ex: abus, compte compromis, demande du proprietaire…"
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-amber-500"
        />
      </label>
      {error ? <p className="mt-2 text-xs font-semibold text-red-600">{error}</p> : null}
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onClose} className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          Annuler
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={handleSuspend}
          className="rounded bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {submitting ? 'Suspension…' : 'Suspendre'}
        </button>
      </div>
    </ModalShell>
  )
}

function DeleteUserModal({
  user,
  onClose,
  onDeleted,
}: {
  user: UserRow
  onClose: () => void
  onDeleted: (email: string) => void
}) {
  const [confirm, setConfirm] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)
  const matches = confirm.trim().toLowerCase() === user.email.toLowerCase()

  async function handleDelete() {
    if (!matches) return
    setSubmitting(true)
    setError(null)
    const result = await deletePlatformUser({ data: { userId: user.id, confirmEmail: confirm.trim() } })
    setSubmitting(false)
    if (result.ok) onDeleted(result.deleted)
    else setError(result.message)
  }

  return (
    <ModalShell onClose={onClose}>
      <div className="flex items-center gap-2.5">
        <span className="flex size-9 items-center justify-center rounded bg-red-50 text-red-600">
          <Trash2 className="size-4" />
        </span>
        <h2 className="text-base font-bold text-slate-950">Supprimer ce compte ?</h2>
      </div>
      <p className="mt-3 text-sm text-slate-600">
        Cette action est <strong className="text-red-600">irreversible</strong>. Le compte de
        {' '}<strong>{user.name}</strong>, ses sessions et ses acces seront definitivement supprimes.
        Un compte qui possede encore des entreprises ne peut pas etre supprime.
      </p>
      <label className="mt-4 block">
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
          Tapez l'email « {user.email} » pour confirmer
        </span>
        <input
          type="text"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          placeholder={user.email}
          autoFocus
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-red-500"
        />
      </label>
      {error ? <p className="mt-2 text-xs font-semibold text-red-600">{error}</p> : null}
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onClose} className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          Annuler
        </button>
        <button
          type="button"
          disabled={!matches || submitting}
          onClick={handleDelete}
          className="rounded bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
        >
          {submitting ? 'Suppression…' : 'Supprimer definitivement'}
        </button>
      </div>
    </ModalShell>
  )
}

function UserDetailModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [detail, setDetail] = React.useState<Awaited<ReturnType<typeof getPlatformUserDetail>> | null>(null)

  React.useEffect(() => {
    let alive = true
    void getPlatformUserDetail({ data: { userId } }).then((result) => {
      if (alive) setDetail(result)
    })
    return () => {
      alive = false
    }
  }, [userId])

  return (
    <ModalShell onClose={onClose} wide>
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-base font-bold text-slate-950">Detail de l'utilisateur</h2>
        <button type="button" onClick={onClose} aria-label="Fermer" className="flex size-8 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-950">
          <X className="size-4" />
        </button>
      </div>

      {!detail ? (
        <p className="py-10 text-center text-sm text-slate-500">Chargement…</p>
      ) : !detail.ok ? (
        <p className="py-10 text-center text-sm text-red-600">{detail.message}</p>
      ) : (
        <div className="mt-4 space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-bold text-slate-950">{detail.user.name}</span>
            <span className="text-xs text-slate-400">{detail.user.email}</span>
            {detail.user.disabled ? (
              <AdminBadge tone="risk">Suspendu</AdminBadge>
            ) : detail.user.verified ? (
              <AdminBadge tone="good">Valide</AdminBadge>
            ) : (
              <AdminBadge tone="warn">En attente</AdminBadge>
            )}
            {detail.user.isSuperAdmin ? <AdminBadge tone="risk">Super admin</AdminBadge> : null}
            {detail.user.totpEnabled ? <AdminBadge tone="good">2FA</AdminBadge> : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded border border-slate-100 p-3">
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Compte</h3>
              <dl className="space-y-1 text-xs text-slate-600">
                <DetailLine label="Cree le" value={formatDate(detail.user.createdAt)} />
                <DetailLine label="Email valide le" value={detail.user.verifiedAt ? formatDateTime(detail.user.verifiedAt) : 'Non valide'} />
                <DetailLine label="Derniere connexion" value={formatDateTime(detail.user.lastLoginAt)} />
                <DetailLine label="Mdp a changer" value={detail.user.mustChangePassword ? 'Oui' : 'Non'} />
              </dl>
            </div>
            <div className="rounded border border-slate-100 p-3">
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Espaces possedes</h3>
              {detail.workspaces.length === 0 ? (
                <p className="text-xs text-slate-400">Aucun</p>
              ) : (
                <ul className="space-y-1 text-xs text-slate-600">
                  {detail.workspaces.map((workspace) => (
                    <li key={workspace.name} className="flex justify-between gap-2">
                      <span className="font-semibold text-slate-700">{workspace.name}</span>
                      <span className="text-slate-400">{workspace.companies} entreprise(s)</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="rounded border border-slate-100">
            <h3 className="border-b border-slate-100 px-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-400">
              Entreprises ({detail.memberships.length})
            </h3>
            {detail.memberships.length === 0 ? (
              <p className="px-3 py-3 text-xs text-slate-400">Aucune entreprise.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {detail.memberships.map((membership) => (
                  <li key={membership.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-slate-800">{membership.companyName}</span>
                      <span className="block truncate text-xs text-slate-400">
                        /{membership.companySlug}
                        {membership.roles.length ? ` · ${membership.roles.join(', ')}` : ''}
                      </span>
                    </span>
                    {membership.status === 'ACTIVE' ? (
                      <AdminBadge tone="good">Actif</AdminBadge>
                    ) : (
                      <AdminBadge tone="risk">{membership.status === 'DISABLED' ? 'Suspendu' : membership.status}</AdminBadge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded border border-slate-100">
            <h3 className="border-b border-slate-100 px-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-400">
              Sessions ({detail.sessions.length})
            </h3>
            {detail.sessions.length === 0 ? (
              <p className="px-3 py-3 text-xs text-slate-400">Aucune session.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {detail.sessions.map((session) => (
                  <li key={session.id} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                    <span className="min-w-0">
                      <span className="block font-semibold text-slate-700">
                        {session.ip ?? 'IP inconnue'}
                        {session.active ? '' : ' (expiree)'}
                      </span>
                      <span className="block truncate text-slate-400">{session.userAgent ?? '—'}</span>
                    </span>
                    <span className="shrink-0 text-slate-400">{formatDateTime(session.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {detail.loginEvents.length ? (
            <div className="rounded border border-slate-100">
              <h3 className="border-b border-slate-100 px-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-400">
                Dernieres connexions
              </h3>
              <ul className="divide-y divide-slate-100">
                {detail.loginEvents.map((event) => (
                  <li key={event.id} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                    <span className="flex items-center gap-2">
                      {event.success ? <AdminBadge tone="good">OK</AdminBadge> : <AdminBadge tone="risk">Echec</AdminBadge>}
                      <span className="text-slate-500">{event.reason ?? (event.success ? 'Connexion reussie' : '—')}</span>
                      {event.ip ? <span className="text-slate-400">· {event.ip}</span> : null}
                    </span>
                    <span className="shrink-0 text-slate-400">{formatDateTime(event.createdAt)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {detail.recentActions.length ? (
            <div className="rounded border border-slate-100">
              <h3 className="border-b border-slate-100 px-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-400">
                Dernieres actions
              </h3>
              <ul className="divide-y divide-slate-100">
                {detail.recentActions.map((log) => (
                  <li key={log.id} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                    <span className="min-w-0 truncate">
                      <span className="font-mono font-semibold text-slate-700">{log.action}</span>
                      {log.companyName ? <span className="text-slate-400"> · {log.companyName}</span> : null}
                    </span>
                    <span className="shrink-0 text-slate-400">{formatDateTime(log.createdAt)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </ModalShell>
  )
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-slate-400">{label}</dt>
      <dd className="min-w-0 truncate text-right font-semibold text-slate-700">{value}</dd>
    </div>
  )
}
