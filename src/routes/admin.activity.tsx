import { createFileRoute } from '@tanstack/react-router'
import { Activity } from 'lucide-react'
import { listPlatformActivity } from '~/server/platformAdmin'
import { AdminBadge, AdminCard, AdminEmpty, AdminPageHeader, AdminTable, formatDateTime } from '~/components/AdminUI'

export const Route = createFileRoute('/admin/activity')({
  loader: async () => listPlatformActivity(),
  component: ActivityPage,
})

function ActivityPage() {
  const data = Route.useLoaderData()
  if (!data.ok) return <AdminEmpty>Donnees indisponibles.</AdminEmpty>

  return (
    <div>
      <AdminPageHeader
        title="Activite"
        description="Journal d'audit de toutes les entreprises et evenements de connexion."
        icon={Activity}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <AdminCard title={`Journal d'audit (${data.auditLogs.length})`}>
          {data.auditLogs.length === 0 ? (
            <AdminEmpty>Aucune activite enregistree.</AdminEmpty>
          ) : (
            <AdminTable
              head={
                <>
                  <th className="px-4 py-2.5">Action</th>
                  <th className="px-4 py-2.5">Entreprise</th>
                  <th className="px-4 py-2.5">Acteur</th>
                  <th className="px-4 py-2.5">Date</th>
                </>
              }
            >
              {data.auditLogs.map((log) => (
                <tr key={log.id} className="list-row">
                  <td className="px-4 py-3">
                    <span className="block font-mono text-xs font-semibold text-slate-950">{log.action}</span>
                    <span className="block text-xs text-slate-400">{log.entity}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{log.companyName ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{log.actorEmail ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-slate-400">{formatDateTime(log.createdAt)}</td>
                </tr>
              ))}
            </AdminTable>
          )}
        </AdminCard>

        <AdminCard title={`Connexions (${data.loginEvents.length})`}>
          {data.loginEvents.length === 0 ? (
            <AdminEmpty>Aucun evenement.</AdminEmpty>
          ) : (
            <AdminTable
              head={
                <>
                  <th className="px-4 py-2.5">Email</th>
                  <th className="px-4 py-2.5">Resultat</th>
                  <th className="px-4 py-2.5">IP</th>
                  <th className="px-4 py-2.5">Date</th>
                </>
              }
            >
              {data.loginEvents.map((event) => (
                <tr key={event.id} className="list-row">
                  <td className="px-4 py-3 text-slate-700">{event.email}</td>
                  <td className="px-4 py-3">
                    {event.success ? (
                      <AdminBadge tone="good">Succes</AdminBadge>
                    ) : (
                      <AdminBadge tone="risk">{event.reason ?? 'Echec'}</AdminBadge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">{event.ip ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-slate-400">{formatDateTime(event.createdAt)}</td>
                </tr>
              ))}
            </AdminTable>
          )}
        </AdminCard>
      </div>
    </div>
  )
}
