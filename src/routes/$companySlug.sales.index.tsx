import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowRight, FileCheck2, ReceiptText, ShoppingCart } from 'lucide-react'
import { getPosData } from '~/server/dataFetchers'
import { useMoney } from '~/context/CompanyContext'

export const Route = createFileRoute('/$companySlug/sales/')({
  loader: async ({ params }) => getPosData({ data: { companySlug: params.companySlug } }),
  component: SalesDashboard,
})

function SalesDashboard() {
  const { formatMoney } = useMoney()
  const { companySlug } = Route.useParams()
  const { today } = Route.useLoaderData()
  const averageBasket = today.count > 0 ? today.total / today.count : 0

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-950 dark:text-white">Ventes</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Caisse, devis et factures dans un parcours simple.</p>
        </div>
        <Link to="/$companySlug/pos/register" params={{ companySlug }} className="inline-flex items-center justify-center gap-2 rounded bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-cyan-400 dark:text-slate-950 dark:hover:bg-cyan-300">
          <ShoppingCart className="size-4" />
          Nouvelle vente
        </Link>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <SalesMetric title="Caisse du jour" value={formatMoney(today.total)} detail={`${today.count} tickets aujourd'hui`} icon={ReceiptText} />
        <SalesMetric title="Panier moyen du jour" value={formatMoney(averageBasket)} detail="Ventes comptoir" icon={ShoppingCart} />
        <SalesMetric title="Documents" value="Devis + factures" detail="Suivi commercial simple" icon={FileCheck2} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <SalesAction to={`/${companySlug}/pos/sales-report`} title="Rapport caisse" text="Voir les encaissements par mode de paiement." />
        <SalesAction to={`/${companySlug}/quotes`} title="Devis" text="Preparer un prix avant facturation." />
        <SalesAction to={`/${companySlug}/invoices`} title="Factures" text="Suivre les factures et paiements." />
      </div>
    </main>
  )
}

function SalesMetric({ title, value, detail, icon: Icon }: { title: string; value: string; detail: string; icon: any }) {
  return (
    <div className="neon-surface rounded p-5">
      <div className="mb-4 flex items-start justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">{title}</p>
        <Icon className="size-4 text-slate-300 dark:text-slate-600" />
      </div>
      <p className="text-2xl font-bold text-slate-950 dark:text-white">{value}</p>
      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{detail}</p>
    </div>
  )
}

function SalesAction({ to, title, text }: { to: string; title: string; text: string }) {
  return (
    <Link to={to as any} className="neon-surface group rounded p-5 transition hover:border-slate-300">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-slate-950 dark:text-white">{title}</h3>
        <ArrowRight className="size-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-600 dark:text-slate-600 dark:group-hover:text-cyan-300" />
      </div>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{text}</p>
    </Link>
  )
}
