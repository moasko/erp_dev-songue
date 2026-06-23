import { createFileRoute } from '@tanstack/react-router'
import { Users, UserPlus, CalendarOff, TrendingUp } from 'lucide-react'
import { getHrData } from '~/server/dataFetchers'
import { formatMoney } from '~/utils/currency'

export const Route = createFileRoute('/$companySlug/hr/')({
  loader: async ({ params }) => getHrData({ data: { companySlug: params.companySlug } }),
  component: HrDashboard,
})

function HrDashboard() {
  const { employees, departments } = Route.useLoaderData()

  const totalEmployees = employees.length
  const activeEmployees = employees.filter((e: any) => e.status === 'Active').length
  const onLeave = employees.filter((e: any) => e.status === 'OnLeave').length
  const newHires = employees.filter((e: any) => e.status === 'Onboarding').length
  const totalPayroll = employees.reduce((sum: number, e: any) => sum + e.salary, 0)

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">Ressources Humaines</h1>
          <p className="text-sm text-slate-500 mt-1">Vue d'ensemble des effectifs et de l'activité RH.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard title="Effectif Total" value={totalEmployees.toString()} icon={Users} trend="+2 ce mois" />
        <StatCard title="En Congé" value={onLeave.toString()} icon={CalendarOff} trend="Stable" />
        <StatCard title="Nouveaux Employés" value={newHires.toString()} icon={UserPlus} trend="+1 cette semaine" />
        <StatCard title="Masse Salariale" value={formatMoney(totalPayroll)} icon={TrendingUp} trend="+3.2% vs N-1" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded border border-slate-200 bg-white p-6">
          <h2 className="text-lg font-bold text-slate-950 mb-6">Répartition par Département</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {departments.map((dept: any) => (
              <div key={dept.id} className="list-row p-4 rounded border border-slate-100 bg-slate-50 flex flex-col justify-between h-24">
                <span className="text-sm font-semibold text-slate-700">{dept.id}</span>
                <div className="flex items-end justify-between">
                  <span className="text-2xl font-bold text-slate-950">{dept.count}</span>
                  <span className="text-xs text-slate-400">personnes</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded border border-slate-200 bg-white p-6 flex flex-col">
          <h2 className="text-lg font-bold text-slate-950 mb-6">Mouvements Récents</h2>
          <div className="flex-1 space-y-0 divide-y divide-slate-100">
            {employees.slice(0, 4).map((emp: any) => (
              <div key={emp.id} className="list-row -mx-3 flex items-center justify-between px-3 py-3">
                <div className="flex items-center gap-3">
                  <div className="size-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-xs">
                    {emp.firstName.charAt(0)}{emp.lastName.charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">{emp.firstName} {emp.lastName}</p>
                    <p className="text-xs text-slate-500">{emp.position}</p>
                  </div>
                </div>
                <span className={"text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded " + (
                  emp.status === 'Active' ? 'bg-slate-950 text-white' :
                  emp.status === 'OnLeave' ? 'bg-slate-200 text-slate-700' :
                  emp.status === 'Onboarding' ? 'bg-slate-100 text-slate-800' :
                  'bg-slate-100 text-slate-600'
                )}>
                  {emp.status === 'OnLeave' ? 'En congé' : emp.status === 'Onboarding' ? 'Intégration' : 'Actif'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({ title, value, icon: Icon, trend }: { title: string, value: string, icon: any, trend: string }) {
  return (
    <div className="rounded border border-slate-200 bg-white p-5">
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-sm font-semibold text-slate-500">{title}</h3>
        <div className="p-2 rounded bg-slate-50 text-slate-400"><Icon className="size-4" /></div>
      </div>
      <span className="text-2xl font-bold text-slate-950">{value}</span>
      <div className="mt-3 text-xs font-medium text-slate-500">{trend}</div>
    </div>
  )
}
