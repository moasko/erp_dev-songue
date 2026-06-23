import { createFileRoute } from '@tanstack/react-router'
import { ArrowDownRight, Download, ReceiptText } from 'lucide-react'
import { useState } from 'react'
import { DateRangeFilter, matchesDatePreset, todayInputValue, type DatePreset } from '~/components/DateRangeFilter'
import { getFinanceData } from '~/server/dataFetchers'
import { formatMoney } from '~/utils/currency'
import { downloadCsv } from '~/utils/csvExport'

export const Route = createFileRoute('/$companySlug/finance/expenses')({
  loader: async ({ params }) => getFinanceData({ data: { companySlug: params.companySlug } }),
  component: ExpensesPage,
})

function ExpensesPage() {
  const { transactions } = Route.useLoaderData()
  const [datePreset, setDatePreset] = useState<DatePreset>('month')
  const [startDate, setStartDate] = useState(todayInputValue())
  const [endDate, setEndDate] = useState(todayInputValue())
  const expenses = transactions.filter((tx: any) => tx.type === 'Expense' && matchesDatePreset(tx.date, datePreset, startDate, endDate))
  const total = expenses.reduce((sum: number, tx: any) => sum + tx.amount, 0)
  const categories = new Set(expenses.map((tx: any) => tx.category)).size

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">Depenses</h1>
          <p className="mt-1 text-sm text-slate-500">Achats, charges, paiements fournisseurs et sorties de caisse.</p>
        </div>
        <button
          type="button"
          onClick={() => exportTransactions('depenses.csv', expenses)}
          disabled={!expenses.length}
          className="inline-flex h-10 items-center justify-center gap-2 rounded border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Download className="size-4" />
          Export CSV
        </button>
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
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <Stat title="Total depenses" value={formatMoney(total)} />
        <Stat title="Operations" value={expenses.length.toString()} />
        <Stat title="Categories" value={categories.toString()} />
      </div>
      <section className="neon-surface overflow-hidden rounded">
        <div className="divide-y divide-slate-100">
          {expenses.length ? expenses.map((tx: any) => (
            <div key={tx.id} className="list-row flex items-center justify-between gap-4 px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded bg-slate-100 text-slate-600">
                  <ReceiptText className="size-4" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-950">{tx.description}</p>
                  <p className="truncate text-xs text-slate-500">{new Date(tx.date).toLocaleDateString('fr-FR')} - {tx.category}</p>
                </div>
              </div>
              <p className="shrink-0 text-sm font-bold text-slate-950">{formatMoney(tx.amount)}</p>
            </div>
          )) : <p className="px-5 py-8 text-sm text-slate-500">Aucune depense sur cette periode.</p>}
        </div>
      </section>
    </main>
  )
}

function Stat({ title, value }: { title: string; value: string }) {
  return (
    <div className="neon-surface rounded p-5">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{title}</p>
        <ArrowDownRight className="size-4 text-slate-400" />
      </div>
      <p className="text-2xl font-bold text-slate-950">{value}</p>
    </div>
  )
}

function exportTransactions(filename: string, transactions: any[]) {
  downloadCsv(filename, transactions, [
    { header: 'Date', value: (tx) => new Date(tx.date).toLocaleDateString('fr-FR') },
    { header: 'Reference', value: (tx) => tx.reference ?? '' },
    { header: 'Description', value: (tx) => tx.description },
    { header: 'Categorie', value: (tx) => tx.category },
    { header: 'Statut', value: (tx) => tx.status },
    { header: 'Montant', value: (tx) => tx.amount },
  ])
}
