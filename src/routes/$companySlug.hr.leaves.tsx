import { createFileRoute } from '@tanstack/react-router'
import { CalendarClock, CheckCircle2, Users } from 'lucide-react'
import { getHrData } from '~/server/dataFetchers'

export const Route = createFileRoute('/$companySlug/hr/leaves')({
  loader: async ({ params }) => getHrData({ data: { companySlug: params.companySlug } }),
  component: LeavesPage,
})

function LeavesPage() {
  const { employees } = Route.useLoaderData()
  const onLeave = employees.filter((employee: any) => employee.status === 'OnLeave')
  const available = employees.filter((employee: any) => employee.status === 'Active')

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">RH</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-950">Conges & absences</h1>
        <p className="mt-1 text-sm text-slate-500">Suivi simple des absences declarees dans les statuts employes.</p>
      </div>
      <section className="mb-6 grid gap-4 md:grid-cols-3">
        <Stat title="Absences" value={onLeave.length.toString()} icon={CalendarClock} alert={onLeave.length > 0} />
        <Stat title="Disponibles" value={available.length.toString()} icon={CheckCircle2} />
        <Stat title="Effectif total" value={employees.length.toString()} icon={Users} />
      </section>
      <section className="neon-surface rounded">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="font-bold text-slate-950">Collaborateurs absents</h2>
        </div>
        <div className="divide-y divide-slate-100">
          {onLeave.length ? onLeave.map((employee: any) => (
            <div key={employee.id} className="list-row flex items-center justify-between gap-4 px-5 py-4">
              <div>
                <p className="font-bold text-slate-950">{employee.firstName} {employee.lastName}</p>
                <p className="mt-1 text-xs text-slate-500">{employee.department} - {employee.position}</p>
              </div>
              <span className="rounded bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-700">En conge</span>
            </div>
          )) : <p className="px-5 py-8 text-sm text-slate-500">Aucune absence en cours.</p>}
        </div>
      </section>
    </main>
  )
}

function Stat({ title, value, icon: Icon, alert = false }: { title: string; value: string; icon: any; alert?: boolean }) {
  return (
    <div className="neon-surface rounded p-5">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{title}</p>
        <Icon className={`size-4 ${alert ? 'text-rose-500' : 'text-slate-300'}`} />
      </div>
      <p className="text-2xl font-bold text-slate-950">{value}</p>
    </div>
  )
}
