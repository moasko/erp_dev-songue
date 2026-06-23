import { createFileRoute, useRouter } from '@tanstack/react-router'
import { Check, Download, FilePlus, ReceiptText, Search, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { DateRangeFilter, matchesDatePreset, todayInputValue, type DatePreset } from '~/components/DateRangeFilter'
import { getPurchasesData } from '~/server/dataFetchers'
import { createPurchaseInvoice } from '~/server/operations'
import { downloadCsv } from '~/utils/csvExport'
import { formatMoney } from '~/utils/currency'

export const Route = createFileRoute('/$companySlug/purchases/invoices')({
  loader: async ({ params }) => getPurchasesData({ data: { companySlug: params.companySlug } }),
  component: PurchaseInvoicesPage,
})

function PurchaseInvoicesPage() {
  const { companySlug } = Route.useParams()
  const router = useRouter()
  const { accounts, vendors, purchaseInvoices } = Route.useLoaderData()
  const [query, setQuery] = useState('')
  const [datePreset, setDatePreset] = useState<DatePreset>('month')
  const [startDate, setStartDate] = useState(todayInputValue())
  const [endDate, setEndDate] = useState(todayInputValue())
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [form, setForm] = useState({
    vendor: vendors[0]?.name ?? '',
    description: '',
    reference: '',
    category: 'Achat stock',
    amount: '',
    accountId: accounts[0]?.id ?? '',
  })

  const filteredInvoices = purchaseInvoices.filter((invoice: any) => {
    const text = `${invoice.description} ${invoice.reference ?? ''} ${invoice.category}`.toLowerCase()
    return matchesDatePreset(invoice.date, datePreset, startDate, endDate) && text.includes(query.toLowerCase())
  })
  const total = filteredInvoices.reduce((sum: number, invoice: any) => sum + invoice.amount, 0)
  const pending = filteredInvoices.filter((invoice: any) => invoice.status === 'Pending').length
  const categories = new Set(filteredInvoices.map((invoice: any) => invoice.category)).size

  async function addInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const amount = Number(form.amount)
    if (!form.description.trim() || !Number.isFinite(amount) || amount <= 0) {
      setMessage('Renseigne un libelle et un montant valide.')
      return
    }

    await createPurchaseInvoice({
      data: {
        companySlug,
        accountId: form.accountId || undefined,
        vendorName: form.vendor || 'Fournisseur libre',
        amount,
        category: form.category,
        reference: form.reference || undefined,
        notes: form.description,
        status: 'Paid',
      },
    })
    setIsModalOpen(false)
    setForm({ vendor: vendors[0]?.name ?? '', description: '', reference: '', category: 'Achat stock', amount: '', accountId: accounts[0]?.id ?? '' })
    setMessage('Facture achat enregistree.')
    await router.invalidate()
  }

  function exportInvoices() {
    downloadCsv('factures-achats.csv', filteredInvoices, [
      { header: 'Date', value: (invoice: any) => new Date(invoice.date).toLocaleDateString('fr-FR') },
      { header: 'Reference', value: (invoice: any) => invoice.reference ?? '' },
      { header: 'Description', value: (invoice: any) => invoice.description },
      { header: 'Categorie', value: (invoice: any) => invoice.category },
      { header: 'Statut', value: (invoice: any) => invoice.status },
      { header: 'Montant', value: (invoice: any) => invoice.amount },
    ])
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Achats</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-950">Factures achats</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">Enregistre et suis les factures fournisseurs, achats stock, charges et paiements.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={exportInvoices}
            disabled={!filteredInvoices.length}
            className="inline-flex h-10 items-center gap-2 rounded border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="size-4" />
            Export CSV
          </button>
          <button onClick={() => setIsModalOpen(true)} className="inline-flex h-10 items-center gap-2 rounded bg-slate-950 px-4 text-sm font-bold text-white hover:bg-slate-800">
            <FilePlus className="size-4" />
            Nouvelle facture
          </button>
        </div>
      </div>

      {message ? <div className="mb-6 rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{message}</div> : null}

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <Stat title="Total achats" value={formatMoney(total)} />
        <Stat title="Factures" value={filteredInvoices.length.toString()} />
        <Stat title="Categories" value={categories.toString()} detail={`${pending} a verifier`} />
      </div>

      <div className="mb-5 grid gap-3 xl:grid-cols-[1fr_auto] xl:items-start">
        <div className="neon-surface rounded p-3">
          <label className="relative block">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher fournisseur, reference, categorie"
              className="h-11 w-full rounded border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm font-semibold text-slate-950 outline-none focus:border-slate-950"
            />
          </label>
        </div>
        <DateRangeFilter
          preset={datePreset}
          startDate={startDate}
          endDate={endDate}
          onPresetChange={setDatePreset}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
        />
      </div>

      <section className="neon-surface overflow-hidden rounded">
        <div className="hidden grid-cols-[1.2fr_.8fr_.8fr_.7fr_auto] gap-4 border-b border-slate-200 px-5 py-3 text-xs font-bold uppercase tracking-wide text-slate-400 lg:grid">
          <span>Facture</span>
          <span>Date</span>
          <span>Categorie</span>
          <span>Statut</span>
          <span className="text-right">Montant</span>
        </div>
        <div className="divide-y divide-slate-100">
          {filteredInvoices.length ? filteredInvoices.map((invoice: any) => (
            <article key={invoice.id} className="list-row grid gap-3 px-5 py-4 lg:grid-cols-[1.2fr_.8fr_.8fr_.7fr_auto] lg:items-center">
              <div className="min-w-0">
                <div className="flex items-center gap-2 font-bold text-slate-950">
                  <ReceiptText className="size-4 text-slate-400" />
                  <span className="truncate">{invoice.description}</span>
                </div>
                <p className="mt-1 truncate text-xs text-slate-500">{invoice.reference ?? 'Sans reference'}</p>
              </div>
              <div className="text-sm font-semibold text-slate-600">{new Date(invoice.date).toLocaleDateString('fr-FR')}</div>
              <div className="text-sm font-semibold text-slate-700">{invoice.category}</div>
              <div>
                <span className={`inline-flex rounded px-2.5 py-1 text-xs font-bold ${invoice.status === 'Pending' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                  {invoice.status === 'Pending' ? 'A verifier' : 'Paye'}
                </span>
              </div>
              <div className="font-bold text-slate-950 lg:text-right">{formatMoney(invoice.amount)}</div>
            </article>
          )) : (
            <p className="px-5 py-10 text-center text-sm font-semibold text-slate-500">Aucune facture achat trouvee.</p>
          )}
        </div>
      </section>

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/40 px-4 py-8 sm:items-center">
          <div className="w-full max-w-2xl rounded border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4">
              <h2 className="text-lg font-bold text-slate-950">Nouvelle facture achat</h2>
              <button type="button" onClick={() => setIsModalOpen(false)} className="inline-flex size-9 items-center justify-center rounded border border-slate-200 text-slate-500 hover:bg-slate-50" aria-label="Fermer">
                <X className="size-4" />
              </button>
            </div>
            <form onSubmit={addInvoice} className="space-y-4 p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-400">Fournisseur</span>
                  <input list="purchase-vendors" value={form.vendor} onChange={(event) => setForm((current) => ({ ...current, vendor: event.target.value }))} className="field-input" placeholder="Nom fournisseur" />
                  <datalist id="purchase-vendors">
                    {vendors.map((vendor: any) => <option key={vendor.id} value={vendor.name} />)}
                  </datalist>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-400">Reference</span>
                  <input value={form.reference} onChange={(event) => setForm((current) => ({ ...current, reference: event.target.value }))} className="field-input" placeholder="FAC-0001" />
                </label>
              </div>
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-400">Libelle</span>
                <input value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} className="field-input" required />
              </label>
              <div className="grid gap-4 sm:grid-cols-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-400">Montant</span>
                  <input value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} type="number" min="1" className="field-input" required />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-400">Categorie</span>
                  <select value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))} className="field-input">
                    <option>Achat stock</option>
                    <option>Fournisseur</option>
                    <option>Charges</option>
                    <option>Loyer</option>
                    <option>Transport</option>
                    <option>Marketing</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-400">Compte</span>
                  <select value={form.accountId} onChange={(event) => setForm((current) => ({ ...current, accountId: event.target.value }))} className="field-input">
                    {accounts.map((account: any) => <option key={account.id} value={account.id}>{account.name}</option>)}
                  </select>
                </label>
              </div>
              <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => setIsModalOpen(false)} className="inline-flex items-center justify-center gap-2 rounded border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><X className="size-4" /> Annuler</button>
                <button type="submit" className="inline-flex items-center justify-center gap-2 rounded bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"><Check className="size-4" /> Enregistrer</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </main>
  )
}

function Stat({ title, value, detail }: { title: string; value: string; detail?: string }) {
  return (
    <div className="neon-surface rounded p-5">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{title}</p>
      <p className="mt-4 text-2xl font-bold text-slate-950">{value}</p>
      {detail ? <p className="mt-2 text-xs font-medium text-slate-500">{detail}</p> : null}
    </div>
  )
}
