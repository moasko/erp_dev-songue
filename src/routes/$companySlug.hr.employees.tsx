import { createFileRoute } from '@tanstack/react-router'
import { Search, SlidersHorizontal, UserPlus, MoreHorizontal, Mail } from 'lucide-react'
import { getHrData } from '~/server/dataFetchers'

export const Route = createFileRoute('/$companySlug/hr/employees')({
  loader: async ({ params }) => getHrData({ data: { companySlug: params.companySlug } }),
  component: HrEmployees,
})

function HrEmployees() {
  const { employees } = Route.useLoaderData()

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">Employés</h1>
          <p className="mt-1 text-sm text-slate-500">Annuaire et gestion du personnel.</p>
        </div>
        <button className="inline-flex items-center gap-2 rounded bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
          <UserPlus className="size-4" />
          Nouvel Employé
        </button>
      </div>
      
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
          <input type="text" placeholder="Rechercher un employé..." className="w-full rounded border border-slate-300 pl-9 pr-4 py-2 text-sm focus:border-slate-950 outline-none" />
        </div>
        <button className="inline-flex items-center gap-2 rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          <SlidersHorizontal className="size-4" />
          Filtres
        </button>
      </div>

      <div className="rounded border border-slate-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 font-semibold">Employé</th>
                <th className="px-4 py-3 font-semibold">Poste & Département</th>
                <th className="px-4 py-3 font-semibold">Statut</th>
                <th className="px-4 py-3 font-semibold">Contrat</th>
                <th className="px-4 py-3 font-semibold">Date d'embauche</th>
                <th className="px-4 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {employees.map((emp) => (
                <tr key={emp.id} className="list-row">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="size-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-xs">
                        {emp.firstName.charAt(0)}{emp.lastName.charAt(0)}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900">{emp.firstName} {emp.lastName}</p>
                        <p className="text-xs text-slate-500">{emp.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900">{emp.position}</p>
                    <p className="text-xs text-slate-500">{emp.department}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={"inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold " + (
                      emp.status === 'Active' ? 'bg-slate-950 text-white' :
                      emp.status === 'OnLeave' ? 'bg-slate-200 text-slate-700' :
                      emp.status === 'Onboarding' ? 'bg-slate-100 text-slate-800' :
                      'bg-slate-100 text-slate-500'
                    )}>
                      {emp.status === 'Active' ? 'Actif' :
                       emp.status === 'OnLeave' ? 'En congé' :
                       emp.status === 'Onboarding' ? 'Intégration' : 'Ancien'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-2 py-1 rounded">{emp.type}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {new Date(emp.hireDate).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button className="p-1.5 text-slate-400 hover:text-slate-900"><Mail className="size-4" /></button>
                      <button className="p-1.5 text-slate-400 hover:text-slate-900"><MoreHorizontal className="size-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
