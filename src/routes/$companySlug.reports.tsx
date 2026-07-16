import { createFileRoute } from '@tanstack/react-router'
import { BarChart3, Boxes, CircleDollarSign, Users } from 'lucide-react'
import { getReportsData } from '~/server/dataFetchers'
import { useMoney } from '~/context/CompanyContext'

export const Route = createFileRoute('/$companySlug/reports')({
  loader: async ({ params }) => getReportsData({ data: { companySlug: params.companySlug } }),
  component: ReportsPage,
})

function ReportsPage() {
  const { formatMoney } = useMoney()
  const { income, expenses, stockValue, openDeals } = Route.useLoaderData()

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-950">Rapports</h1>
        <p className="mt-1 text-sm text-slate-500">Synthese dynamique finance, clients et catalogue.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        <ReportCard title="Revenus" value={formatMoney(income)} icon={CircleDollarSign} />
        <ReportCard title="Depenses" value={formatMoney(expenses)} icon={BarChart3} />
        <ReportCard title="Valeur stock" value={formatMoney(stockValue)} icon={Boxes} />
        <ReportCard title="Dossiers ouverts" value={openDeals.toString()} icon={Users} />
      </div>
    </main>
  )
}

function ReportCard({ title, value, icon: Icon }: { title: string; value: string; icon: any }) {
  return (
    <div className="neon-surface rounded p-5">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{title}</p>
        <Icon className="size-4 text-slate-400" />
      </div>
      <p className="text-2xl font-bold text-slate-950">{value}</p>
    </div>
  )
}
