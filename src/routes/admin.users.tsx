import { createFileRoute, useRouter } from '@tanstack/react-router'
import { KeyRound, LogOut, ShieldAlert, Users } from 'lucide-react'
import * as React from 'react'
import { createUserResetLink, listPlatformUsers, revokeUserSessions } from '~/server/platformAdmin'
import { AdminBadge, AdminCard, AdminEmpty, AdminPageHeader, AdminTable, formatDateTime } from '~/components/AdminUI'

export const Route = createFileRoute('/admin/users')({
  loader: async () => listPlatformUsers(),
  component: UsersPage,
})

function UsersPage() {
  const data = Route.useLoaderData()
  const router = useRouter()
  const [message, setMessage] = React.useState<string | null>(null)
  const [resetLink, setResetLink] = React.useState<string | null>(null)
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState('')

  if (!data.ok) return <AdminEmpty>Donnees indisponibles.</AdminEmpty>

  const users = data.users.filter((user) => {
    const query = search.trim().toLowerCase()
    if (!query) return true
    return `${user.name} ${user.email}`.toLowerCase().includes(query)
  })

  async function handleRevoke(userId: string, email: string) {
    setBusyId(userId)
    setResetLink(null)
    const result = await revokeUserSessions({ data: { userId } })
    setBusyId(null)
    setMessage(result.ok ? `Sessions de ${email} revoquees (${result.revoked}).` : result.message)
    if (result.ok) await router.invalidate()
  }

  async function handleReset(userId: string, email: string) {
    setBusyId(userId)
    setResetLink(null)
    const result = await createUserResetLink({ data: { userId } })
    setBusyId(null)
    if (result.ok) {
      setMessage(
        `Lien de reinitialisation cree pour ${email}${result.delivered ? ' (envoye par email).' : '.'} Valide ${result.expiresInMinutes} min.`,
      )
      setResetLink(result.resetPath)
    } else {
      setMessage(result.message)
    }
  }

  return (
    <div>
      <AdminPageHeader
        title="Utilisateurs"
        description={`${data.users.length} compte(s). Gestion des sessions et des reinitialisations de mot de passe.`}
        icon={Users}
      />

      {message ? (
        <div className="mb-4 rounded border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700">
          {message}
          {resetLink ? (
            <code className="mt-1 block break-all rounded bg-white px-2 py-1 text-xs font-normal text-slate-600">{resetLink}</code>
          ) : null}
        </div>
      ) : null}

      <div className="mb-4">
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Rechercher par nom ou email…"
          className="w-full max-w-sm rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-950"
        />
      </div>

      <AdminCard>
        {users.length === 0 ? (
          <AdminEmpty>Aucun utilisateur.</AdminEmpty>
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
            {users.map((user) => (
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
                          {company.roles.length ? <span className="text-slate-400"> · {company.roles.join(', ')}</span> : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td className="px-4 py-3">
                  {user.verified ? <AdminBadge tone="good">Verifie</AdminBadge> : <AdminBadge tone="warn">En attente</AdminBadge>}
                  <span className="mt-1 block text-xs text-slate-400">{user.sessions} session(s)</span>
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">{formatDateTime(user.lastLoginAt)}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-col items-end gap-1.5">
                    <button
                      type="button"
                      disabled={busyId === user.id}
                      onClick={() => handleReset(user.id, user.email)}
                      className="inline-flex items-center gap-1.5 rounded border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
                    >
                      <KeyRound className="size-3.5" />
                      Lien reset
                    </button>
                    <button
                      type="button"
                      disabled={busyId === user.id || user.sessions === 0}
                      onClick={() => handleRevoke(user.id, user.email)}
                      className="inline-flex items-center gap-1.5 rounded border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-40"
                    >
                      <LogOut className="size-3.5" />
                      Deconnecter
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </AdminTable>
        )}
      </AdminCard>
    </div>
  )
}
