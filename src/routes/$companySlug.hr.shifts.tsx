import { createFileRoute } from '@tanstack/react-router'
import { BriefcaseBusiness, Clock, Users } from 'lucide-react'
import { getHrData } from '~/server/dataFetchers'

export const Route = createFileRoute('/$companySlug/hr/shifts')({
  loader: async ({ params }) => getHrData({ data: { companySlug: params.companySlug } }),
  component: ShiftsPage,
})

function ShiftsPage() {
  const { employees, departments } = Route.useLoaderData()
  const active = employees.filter((employee: any) => employee.status === 'Active')

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">RH</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-950">Planning equipes</h1>
        <p className="mt-1 text-sm text-slate-500">Organisation rapide par departement et disponibilite.</p>
      </div>
      <section className="mb-6 grid gap-4 md:grid-cols-3">
        <Stat title="Equipes" value={departments.length.toString()} icon={BriefcaseBusiness} />
        <Stat title="Actifs" value={active.length.toString()} icon={Users} />
        <Stat title="Plage standard" value="08h-17h" icon={Clock} />
      </section>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {departments.map((department: any) => {
          const members = employees.filter((employee: any) => employee.department === department.id)
          return (
            <div key={department.id} className="neon-surface rounded p-5">
              <h2 className="font-bold text-slate-950">{department.id}</h2>
              <p className="mt-1 text-xs text-slate-500">{members.length} collaborateur(s)</p>
              <div className="mt-4 space-y-2">
                {members.slice(0, 5).map((employee: any) => (
                  <div key={employee.id} className="list-row flex items-center justify-between gap-3 rounded border border-slate-100 px-3 py-2">
                    <span className="truncate text-sm font-semibold text-slate-700">{employee.firstName} {employee.lastName}</span>
                    <span className="text-xs font-bold text-slate-400">{employee.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </section>
    </main>
  )
}

function Stat({ title, value, icon: Icon }: { title: string; value: string; icon: any }) {
  return (
    <div className="neon-surface rounded p-5">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{title}</p>
        <Icon className="size-4 text-slate-300" />
      </div>
      <p className="text-2xl font-bold text-slate-950">{value}</p>
    </div>
  )
}
