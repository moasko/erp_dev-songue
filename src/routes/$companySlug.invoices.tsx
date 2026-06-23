import { createFileRoute } from '@tanstack/react-router'
import { ReceiptText } from 'lucide-react'
import { getFinanceData } from '~/server/dataFetchers'
import { formatMoney } from '~/utils/currency'

export const Route = createFileRoute('/$companySlug/invoices')({
  loader: async ({ params }) => getFinanceData({ data: { companySlug: params.companySlug } }),
  component: InvoicesPage,
})

function InvoicesPage() {
  const { transactions } = Route.useLoaderData()
  const invoices = transactions.filter((tx: any) => tx.type === 'Income')

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-950">Factures</h1>
        <p className="mt-1 text-sm text-slate-500">Factures et encaissements generes depuis les transactions client.</p>
      </div>
      <section className="neon-surface overflow-hidden rounded">
        <div className="divide-y divide-slate-100">
          {invoices.length ? invoices.map((invoice: any) => (
            <div key={invoice.id} className="list-row flex items-center justify-between gap-4 px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded bg-slate-100 text-slate-600">
                  <ReceiptText className="size-4" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-950">{invoice.description}</p>
                  <p className="truncate text-xs text-slate-500">{invoice.reference ?? invoice.category} - {new Date(invoice.date).toLocaleDateString('fr-FR')}</p>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-bold text-slate-950">{formatMoney(invoice.amount)}</p>
                <p className="mt-1 text-[11px] font-bold uppercase text-slate-400">{invoice.status}</p>
              </div>
            </div>
          )) : <p className="px-5 py-8 text-sm text-slate-500">Aucune facture client.</p>}
        </div>
      </section>
    </main>
  )
}
