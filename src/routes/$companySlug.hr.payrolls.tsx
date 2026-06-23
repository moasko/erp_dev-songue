import { createFileRoute } from '@tanstack/react-router'
import { Banknote, ReceiptText, Users } from 'lucide-react'
import { getHrData } from '~/server/dataFetchers'
import { formatMoney } from '~/utils/currency'

export const Route = createFileRoute('/$companySlug/hr/payrolls')({
  loader: async ({ params }) => getHrData({ data: { companySlug: params.companySlug } }),
  component: PayrollsPage,
})

function PayrollsPage() {
  const { employees } = Route.useLoaderData()
  const active = employees.filter((employee: any) => employee.status !== 'Terminated')
  const payroll = active.reduce((sum: number, employee: any) => sum + employee.salary, 0)
  const average = active.length ? Math.round(payroll / active.length) : 0

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">RH</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-950">Paie</h1>
        <p className="mt-1 text-sm text-slate-500">Synthese de masse salariale basee sur les salaires employes.</p>
      </div>
      <section className="mb-6 grid gap-4 md:grid-cols-3">
        <Stat title="Masse salariale" value={formatMoney(payroll)} icon={Banknote} />
        <Stat title="Employes payes" value={active.length.toString()} icon={Users} />
        <Stat title="Salaire moyen" value={formatMoney(average)} icon={ReceiptText} />
      </section>
      <section className="neon-surface overflow-hidden rounded">
        <div className="hidden grid-cols-[1fr_1fr_1fr_auto] gap-4 border-b border-slate-200 px-5 py-3 text-xs font-bold uppercase text-slate-400 lg:grid">
          <span>Employe</span>
          <span>Departement</span>
          <span>Type</span>
          <span className="text-right">Salaire</span>
        </div>
        <div className="divide-y divide-slate-100">
          {active.map((employee: any) => (
            <article key={employee.id} className="list-row grid gap-2 px-5 py-4 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-center">
              <div className="font-bold text-slate-950">{employee.firstName} {employee.lastName}</div>
              <div className="text-sm text-slate-600">{employee.department}</div>
              <div className="text-sm text-slate-600">{employee.type}</div>
              <div className="font-bold text-slate-950 lg:text-right">{formatMoney(employee.salary)}</div>
            </article>
          ))}
        </div>
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
