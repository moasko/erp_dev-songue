import { createFileRoute, Link } from '@tanstack/react-router'
import { CreditCard, ReceiptText, Smartphone, Wallet } from 'lucide-react'
import { useState } from 'react'
import { DateRangeFilter, matchesDatePreset, todayInputValue, type DatePreset } from '~/components/DateRangeFilter'
import { getPosData } from '~/server/dataFetchers'
import { formatMoney } from '~/utils/currency'

export const Route = createFileRoute('/$companySlug/pos/sales-report')({
  loader: async ({ params }) => getPosData({ data: { companySlug: params.companySlug } }),
  component: PosSalesReport,
})

function PosSalesReport() {
  const { companySlug } = Route.useParams()
  const { tickets } = Route.useLoaderData()
  const [datePreset, setDatePreset] = useState<DatePreset>('today')
  const [startDate, setStartDate] = useState(todayInputValue())
  const [endDate, setEndDate] = useState(todayInputValue())
  const filteredTickets = tickets.filter((ticket: any) => matchesDatePreset(ticket.date, datePreset, startDate, endDate))
  const cash = totalFor(filteredTickets, 'Caisse boutique')
  const mobile = totalFor(filteredTickets, 'Mobile money')
  const card = totalFor(filteredTickets, 'Paiement carte')
  const total = cash + mobile + card

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-cyan-500">Cloture caisse</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-950 dark:text-white">Rapport caisse</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Totaux encaisses par mode de paiement et liste des tickets POS.</p>
        </div>
        <Link to="/$companySlug/pos/register" params={{ companySlug }} className="inline-flex h-11 items-center justify-center rounded bg-slate-950 px-4 text-sm font-bold text-white hover:bg-slate-800 dark:bg-cyan-400 dark:text-slate-950 dark:hover:bg-cyan-300">
          Nouvelle vente
        </Link>
      </div>

      <div className="mb-6">
        <DateRangeFilter
          preset={datePreset}
          startDate={startDate}
          endDate={endDate}
          onPresetChange={setDatePreset}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
        />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
        <ReportCard title="Total caisse" value={formatMoney(total)} icon={ReceiptText} />
        <ReportCard title="Especes" value={formatMoney(cash)} icon={Wallet} />
        <ReportCard title="Mobile" value={formatMoney(mobile)} icon={Smartphone} />
        <ReportCard title="Carte" value={formatMoney(card)} icon={CreditCard} />
      </div>

      <section className="neon-surface overflow-hidden rounded">
        <div className="hidden grid-cols-[1fr_1fr_1fr_auto] gap-4 border-b border-slate-200 px-5 py-3 text-xs font-bold uppercase tracking-wide text-slate-400 dark:border-slate-800 lg:grid">
          <span>Ticket</span>
          <span>Date</span>
          <span>Paiement</span>
          <span className="text-right">Total</span>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {filteredTickets.length > 0 ? filteredTickets.map((ticket: any) => (
            <article key={ticket.id} className="list-row grid gap-2 px-5 py-4 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-center">
              <div className="font-bold text-slate-950 dark:text-white">{ticket.reference}</div>
              <div className="text-sm text-slate-500 dark:text-slate-400">{new Date(ticket.date).toLocaleString('fr-FR')}</div>
              <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">{paymentLabel(ticket.account?.name)}</div>
              <div className="font-bold text-slate-950 dark:text-white lg:text-right">{formatMoney(ticket.amount)}</div>
            </article>
          )) : (
            <div className="px-5 py-10 text-center text-sm font-semibold text-slate-500 dark:text-slate-400">Aucun encaissement POS sur cette periode.</div>
          )}
        </div>
      </section>
    </main>
  )
}

function ReportCard({ title, value, icon: Icon }: { title: string; value: string; icon: any }) {
  return (
    <div className="neon-surface rounded p-5">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">{title}</p>
        <Icon className="size-4 text-slate-300 dark:text-slate-600" />
      </div>
      <p className="text-2xl font-bold text-slate-950 dark:text-white">{value}</p>
    </div>
  )
}

function totalFor(tickets: any[], accountName: string) {
  return tickets
    .filter((ticket) => ticket.account?.name === accountName)
    .reduce((sum, ticket) => sum + ticket.amount, 0)
}

function paymentLabel(accountName?: string) {
  if (!accountName) return 'Caisse'
  if (accountName.toLowerCase().includes('mobile')) return 'Mobile'
  if (accountName.toLowerCase().includes('carte')) return 'Carte'
  return 'Especes'
}
