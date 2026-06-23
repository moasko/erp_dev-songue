import { createFileRoute } from '@tanstack/react-router'
import { Clock, UserCheck, Users } from 'lucide-react'
import { getHrData } from '~/server/dataFetchers'

export const Route = createFileRoute('/$companySlug/hr/attendances')({
  loader: async ({ params }) => getHrData({ data: { companySlug: params.companySlug } }),
  component: AttendancesPage,
})

function AttendancesPage() {
  const { employees } = Route.useLoaderData()
  const active = employees.filter((employee: any) => employee.status === 'Active')
  const absent = employees.filter((employee: any) => employee.status === 'OnLeave')

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <Header title="Presences" description="Vue operationnelle des collaborateurs presents, absents et a suivre aujourd'hui." />
      <section className="mb-6 grid gap-4 md:grid-cols-3">
        <Stat title="Effectif" value={employees.length.toString()} icon={Users} />
        <Stat title="Presents" value={active.length.toString()} icon={UserCheck} />
        <Stat title="Absents" value={absent.length.toString()} icon={Clock} alert={absent.length > 0} />
      </section>
      <section className="neon-surface overflow-hidden rounded">
        <div className="hidden grid-cols-[1fr_1fr_1fr_auto] gap-4 border-b border-slate-200 px-5 py-3 text-xs font-bold uppercase text-slate-400 lg:grid">
          <span>Employe</span>
          <span>Departement</span>
          <span>Poste</span>
          <span className="text-right">Statut</span>
        </div>
        <div className="divide-y divide-slate-100">
          {employees.map((employee: any) => (
            <article key={employee.id} className="list-row grid gap-2 px-5 py-4 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-center">
              <div className="font-bold text-slate-950">{employee.firstName} {employee.lastName}</div>
              <div className="text-sm text-slate-600">{employee.department}</div>
              <div className="text-sm text-slate-600">{employee.position}</div>
              <div className="lg:text-right"><Status status={employee.status} /></div>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}

function Header({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-6">
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">RH</p>
      <h1 className="mt-1 text-2xl font-bold text-slate-950">{title}</h1>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
    </div>
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

function Status({ status }: { status: string }) {
  const label = status === 'Active' ? 'Present' : status === 'OnLeave' ? 'Absent' : status === 'Onboarding' ? 'Integration' : status
  const tone = status === 'Active' ? 'bg-emerald-100 text-emerald-700' : status === 'OnLeave' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
  return <span className={`inline-flex rounded px-2.5 py-1 text-xs font-bold ${tone}`}>{label}</span>
}
