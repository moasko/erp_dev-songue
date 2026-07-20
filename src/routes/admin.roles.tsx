import { createFileRoute } from '@tanstack/react-router'
import { Boxes, ShieldCheck } from 'lucide-react'
import { listPlatformRoles } from '~/server/platformAdmin'
import { AdminBadge, AdminCard, AdminEmpty, AdminPageHeader, AdminTable } from '~/components/AdminUI'

export const Route = createFileRoute('/admin/roles')({
  loader: async () => listPlatformRoles(),
  component: RolesPage,
})

function RolesPage() {
  const data = Route.useLoaderData()
  if (!data.ok) return <AdminEmpty>Donnees indisponibles.</AdminEmpty>

  return (
    <div>
      <AdminPageHeader
        title="Roles & permissions"
        description="Roles definis dans chaque entreprise et catalogue global des modules et permissions."
        icon={ShieldCheck}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <AdminCard title={`Roles par entreprise (${data.roles.length})`} className="lg:col-span-2">
          {data.roles.length === 0 ? (
            <AdminEmpty>Aucun role.</AdminEmpty>
          ) : (
            <AdminTable
              head={
                <>
                  <th className="px-4 py-2.5">Role</th>
                  <th className="px-4 py-2.5">Entreprise</th>
                  <th className="px-4 py-2.5">Membres</th>
                  <th className="px-4 py-2.5">Permissions</th>
                </>
              }
            >
              {data.roles.map((role) => (
                <tr key={role.id} className="list-row">
                  <td className="px-4 py-3">
                    <span className="block font-semibold text-slate-950">{role.name}</span>
                    {role.systemKey ? <span className="block text-xs text-slate-400">systeme · {role.systemKey}</span> : null}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{role.companyName}</td>
                  <td className="px-4 py-3"><AdminBadge>{role.users}</AdminBadge></td>
                  <td className="px-4 py-3 text-slate-600">{role.permissions}</td>
                </tr>
              ))}
            </AdminTable>
          )}
        </AdminCard>

        <AdminCard title={`Modules (${data.modules.length})`} className="lg:col-span-1">
          <ul className="divide-y divide-slate-100">
            {data.modules.map((module) => (
              <li key={module.key} className="flex items-center justify-between px-4 py-2.5">
                <span className="flex items-center gap-2 text-sm">
                  <Boxes className="size-4 text-slate-400" />
                  <span className="font-semibold text-slate-950">{module.name}</span>
                  <span className="text-xs text-slate-400">{module.category}</span>
                </span>
                <AdminBadge>{module.permissions}</AdminBadge>
              </li>
            ))}
          </ul>
        </AdminCard>
      </div>

      <AdminCard title={`Catalogue des permissions (${data.permissions.length})`} className="mt-4">
        <div className="flex flex-wrap gap-1.5 p-4">
          {data.permissions.map((permission) => (
            <span
              key={permission.key}
              title={permission.description ?? permission.key}
              className="inline-flex items-center rounded border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[11px] text-slate-600"
            >
              {permission.key}
            </span>
          ))}
        </div>
      </AdminCard>
    </div>
  )
}
