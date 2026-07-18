import { createFileRoute, Link } from '@tanstack/react-router'
import {
  AlarmClock,
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  Boxes,
  CircleDollarSign,
  Contact,
  FileText,
  ReceiptText,
  ShoppingCart,
  Wallet,
} from 'lucide-react'
import { useState } from 'react'
import { getDashboardData } from '~/server/dashboard'
import { useCompany, useMoney } from '~/context/CompanyContext'
import { TOUR_START_EVENT } from '~/components/OnboardingTour'
import { StatCard } from '~/components/StatCard'
import { DateRangeFilter, getDateRangeBounds, todayInputValue, type DatePreset } from '~/components/DateRangeFilter'

export const Route = createFileRoute('/$companySlug/dashboard')({
  loader: async ({ params }) => {
    // Par defaut le tableau de bord montre le mois en cours.
    const bounds = getDateRangeBounds('month')
    return getDashboardData({ data: { companySlug: params.companySlug, start: bounds.start, end: bounds.end } })
  },
  component: DashboardPage,
})

function DashboardPage() {
  const { formatMoney } = useMoney()
  const { companySlug } = Route.useParams()
  const { activeCompany } = useCompany()
  const initialData = Route.useLoaderData()

  const [data, setData] = useState(initialData)
  const [datePreset, setDatePreset] = useState<DatePreset>('month')
  const [startDate, setStartDate] = useState(todayInputValue())
  const [endDate, setEndDate] = useState(todayInputValue())
  const [isLoading, setIsLoading] = useState(false)

  async function refresh(preset: DatePreset, start: string, end: string) {
    const bounds = getDateRangeBounds(preset, start, end)
    setIsLoading(true)
    try {
      setData(await getDashboardData({ data: { companySlug, start: bounds.start, end: bounds.end } }))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-500">{activeCompany.name}</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-950">Resume du jour</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Les chiffres utiles pour piloter les ventes, le stock et les paiements sans bruit.
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event(TOUR_START_EVENT))}
          className="inline-flex h-9 shrink-0 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950"
        >
          Revoir le guide
        </button>
      </div>

      <div className="mb-5">
        <DateRangeFilter
          preset={datePreset}
          startDate={startDate}
          endDate={endDate}
          onPresetChange={(preset) => {
            setDatePreset(preset)
            void refresh(preset, startDate, endDate)
          }}
          onStartDateChange={(value) => {
            setStartDate(value)
            void refresh(datePreset, value, endDate)
          }}
          onEndDateChange={(value) => {
            setEndDate(value)
            void refresh(datePreset, startDate, value)
          }}
        />
      </div>

      <section
        data-tour="dashboard-metrics"
        className={`grid grid-cols-2 gap-3 transition-opacity sm:grid-cols-3 lg:grid-cols-4 ${isLoading ? 'opacity-60' : ''}`}
      >
        <StatCard icon={Wallet} title="Argent disponible" value={formatMoney(data.balance)} detail="Solde des comptes" />
        <StatCard icon={ArrowUpRight} title="Entrees" value={formatMoney(data.income)} detail="Encaisse sur la periode" />
        <StatCard icon={ArrowDownRight} title="Depenses" value={formatMoney(data.expense)} detail="Sorties sur la periode" />
        <StatCard icon={CircleDollarSign} title="Benefice net" value={formatMoney(data.net)} detail="Entrees moins depenses" alert={data.net < 0} />
        <StatCard icon={ShoppingCart} title="Ventes caisse" value={formatMoney(data.salesAmount)} detail={`${data.salesCount} ticket(s) · panier ${formatMoney(data.avgBasket)}`} />
        <StatCard icon={FileText} title="Factures emises" value={String(data.invoicesIssuedCount)} detail={formatMoney(data.invoicesIssuedTotal)} />
        <StatCard icon={AlarmClock} title="Impayes" value={formatMoney(data.outstanding)} detail="Reste a encaisser" alert={data.outstanding > 0} />
        <StatCard icon={Banknote} title="En retard" value={formatMoney(data.overdueTotal)} detail={`${data.overdueCount} facture(s)`} alert={data.overdueTotal > 0} />
        <StatCard icon={Boxes} title="Stock bas" value={String(data.lowStockCount)} detail="Sous le seuil" alert={data.lowStockCount > 0} />
        <StatCard icon={Contact} title="Nouveaux clients" value={String(data.newCustomers)} detail="Sur la periode" />
        <StatCard icon={FileText} title="Devis en attente" value={String(data.pendingQuotes)} detail="A suivre" />
        <StatCard icon={ReceiptText} title="Clients a suivre" value={String(data.openDealsCount)} detail="Opportunites ouvertes" />
      </section>

      <section className={`mt-6 grid gap-5 lg:grid-cols-[1.2fr_0.8fr] ${isLoading ? 'opacity-60' : ''}`}>
        <div className="neon-surface rounded">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <h2 className="font-bold text-slate-950">Entrees et depenses</h2>
            <span className="text-xs font-semibold text-slate-500">Solde net {formatMoney(data.net)}</span>
          </div>
          <RevenueChart series={data.series} formatMoney={formatMoney} />
        </div>

        <div className="neon-surface rounded">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="font-bold text-slate-950">Dernieres operations</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {data.recent.length ? (
              data.recent.map((tx: any) => (
                <div key={tx.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-950">{tx.description}</p>
                    <p className="text-xs text-slate-500">{formatDate(tx.date)}</p>
                  </div>
                  <span className={`shrink-0 text-sm font-bold ${tx.type === 'Expense' ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {tx.type === 'Expense' ? '-' : '+'}{formatMoney(tx.amount)}
                  </span>
                </div>
              ))
            ) : (
              <div className="px-5 py-8 text-sm text-slate-500">Aucune operation sur la periode.</div>
            )}
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-5 lg:grid-cols-[1fr_0.8fr]">
        <div className="neon-surface rounded">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="font-bold text-slate-950">A traiter</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {data.lowStock.map((product: any) => (
              <ActionRow
                key={product.id}
                title={product.name}
                text={`${product.stock ?? 0} en stock, seuil ${product.minStockLevel ?? 0}`}
                to={`/${companySlug}/inventory`}
              />
            ))}
            {data.pendingPayments.map((transaction: any) => (
              <ActionRow
                key={transaction.id}
                title={transaction.description}
                text={`Paiement a verifier: ${formatMoney(transaction.amount)}`}
                to={`/${companySlug}/finance`}
              />
            ))}
            {data.lowStock.length === 0 && data.pendingPayments.length === 0 ? (
              <div className="px-5 py-8 text-sm text-slate-500">Rien d'urgent pour le moment.</div>
            ) : null}
          </div>
        </div>

        <div className="neon-surface rounded">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="font-bold text-slate-950">Actions rapides</h2>
          </div>
          <div className="grid gap-2 p-3">
            {quickActions.map((action) => {
              const Icon = action.icon
              return (
                <Link
                  key={action.title}
                  to={action.to}
                  params={{ companySlug }}
                  className="list-row flex items-start gap-3 rounded px-3 py-3"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded bg-slate-100 text-slate-700">
                    <Icon className="size-4" />
                  </span>
                  <span>
                    <span className="block text-sm font-bold text-slate-950">{action.title}</span>
                    <span className="mt-1 block text-xs leading-5 text-slate-500">{action.text}</span>
                  </span>
                </Link>
              )
            })}
          </div>
        </div>
      </section>
    </main>
  )
}

const quickActions = [
  {
    title: 'Nouvelle vente',
    text: 'Ouvrir la caisse et encaisser rapidement.',
    icon: ShoppingCart,
    to: '/$companySlug/pos/register' as const,
  },
  {
    title: 'Ajouter un produit',
    text: 'Creer ou modifier un article vendu.',
    icon: Boxes,
    to: '/$companySlug/products-services' as const,
  },
  {
    title: 'Voir les factures',
    text: 'Suivre ce qui est paye ou en attente.',
    icon: ReceiptText,
    to: '/$companySlug/invoices' as const,
  },
]

function RevenueChart({
  series,
  formatMoney,
}: {
  series: Array<{ label: string; income: number; expense: number }>
  formatMoney: (value: number) => string
}) {
  if (!series.length) {
    return <p className="px-5 py-10 text-center text-sm text-slate-500">Aucun mouvement sur la periode.</p>
  }
  const height = 130
  const max = Math.max(1, ...series.map((point) => Math.max(point.income, point.expense)))
  const barHeight = (value: number) => (value <= 0 ? 0 : Math.max(3, Math.round((value / max) * height)))

  return (
    <div>
      <div className="flex items-end gap-1.5 px-5 pt-5 sm:gap-2">
        {series.map((point, index) => (
          <div
            key={index}
            className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1.5"
            style={{ height: height + 20 }}
          >
            <div className="flex items-end justify-center gap-0.5">
              <div
                title={`Entrees ${formatMoney(point.income)}`}
                className="w-1.5 rounded-t sm:w-2.5"
                style={{ height: barHeight(point.income), background: 'var(--app-accent)' }}
              />
              <div
                title={`Depenses ${formatMoney(point.expense)}`}
                className="w-1.5 rounded-t bg-slate-300 sm:w-2.5 dark:bg-slate-700"
                style={{ height: barHeight(point.expense) }}
              />
            </div>
            <span className="w-full truncate text-center text-[9px] font-semibold text-slate-400">{point.label}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-4 border-t border-slate-100 px-5 py-3 text-xs font-semibold text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: 'var(--app-accent)' }} />
          Entrees
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-slate-300 dark:bg-slate-700" />
          Depenses
        </span>
      </div>
    </div>
  )
}

function ActionRow({ title, text, to }: { title: string; text: string; to: string }) {
  return (
    <Link to={to as any} className="list-row block px-5 py-4">
      <p className="text-sm font-bold text-slate-950">{title}</p>
      <p className="mt-1 text-xs text-slate-500">{text}</p>
    </Link>
  )
}

function formatDate(value: string | Date) {
  return new Date(value).toLocaleDateString('fr-FR')
}
