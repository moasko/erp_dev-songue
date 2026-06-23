import { createFileRoute, useRouter } from '@tanstack/react-router'
import {
  BadgeCheck,
  Building2,
  Check,
  FileCheck2,
  Palette,
  Plus,
  Printer,
  Save,
  Search,
  Send,
  Settings,
  Trash2,
  X,
} from 'lucide-react'
import * as React from 'react'
import { getQuoteData } from '~/server/dataFetchers'
import { createQuote, saveQuoteSettings, updateQuoteStatus } from '~/server/operations'
import { formatMoney } from '~/utils/currency'

export const Route = createFileRoute('/$companySlug/quotes')({
  loader: async ({ params }) => getQuoteData({ data: { companySlug: params.companySlug } }),
  component: QuotesPage,
})

type Modal = 'quote' | 'settings' | null
type QuoteStatus = 'Draft' | 'Sent' | 'Accepted' | 'Rejected' | 'Expired'
type StatusFilter = QuoteStatus | 'All'
type QuoteSort = 'updated' | 'validUntil' | 'amountDesc' | 'amountAsc'
type QuoteLineForm = {
  itemId: string
  description: string
  quantity: string
  unitPrice: string
}

const statusLabels: Record<string, string> = {
  Draft: 'Brouillon',
  Sent: 'Envoye',
  Accepted: 'Accepte',
  Rejected: 'Refuse',
  Expired: 'Expire',
}

const statusClasses: Record<string, string> = {
  Draft: 'bg-slate-100 text-slate-600',
  Sent: 'bg-blue-50 text-blue-700',
  Accepted: 'bg-emerald-50 text-emerald-700',
  Rejected: 'bg-rose-50 text-rose-700',
  Expired: 'bg-amber-50 text-amber-700',
}

function QuotesPage() {
  const { companySlug } = Route.useParams()
  const router = useRouter()
  const data = Route.useLoaderData()

  const [quotes, setQuotes] = React.useState<any[]>(data.quotes)
  const [settings, setSettings] = React.useState<any>(data.settings)
  const [selectedQuoteId, setSelectedQuoteId] = React.useState<string>(data.quotes[0]?.id ?? '')
  const [activeModal, setActiveModal] = React.useState<Modal>(null)
  const [message, setMessage] = React.useState('')
  const [searchTerm, setSearchTerm] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>('All')
  const [sortBy, setSortBy] = React.useState<QuoteSort>('updated')

  const selectedQuote = quotes.find((quote) => quote.id === selectedQuoteId) ?? quotes[0] ?? null
  const acceptedTotal = quotes.filter((quote) => quote.status === 'Accepted').reduce((sum, quote) => sum + quote.totalCents, 0)
  const pendingTotal = quotes.filter((quote) => ['Draft', 'Sent'].includes(quote.status)).reduce((sum, quote) => sum + quote.totalCents, 0)
  const filteredQuotes = React.useMemo(() => {
    const query = searchTerm.trim().toLowerCase()
    return quotes
      .filter((quote) => {
        const matchesStatus = statusFilter === 'All' || quote.status === statusFilter
        const searchable = [
          quote.reference,
          quote.customer?.name,
          quote.customer?.email,
          quote.title,
        ].filter(Boolean).join(' ').toLowerCase()
        return matchesStatus && (!query || searchable.includes(query))
      })
      .sort((first, second) => {
        if (sortBy === 'validUntil') return new Date(first.validUntil).getTime() - new Date(second.validUntil).getTime()
        if (sortBy === 'amountDesc') return second.totalCents - first.totalCents
        if (sortBy === 'amountAsc') return first.totalCents - second.totalCents
        return new Date(second.updatedAt).getTime() - new Date(first.updatedAt).getTime()
      })
  }, [quotes, searchTerm, sortBy, statusFilter])

  async function refresh() {
    const nextData = await getQuoteData({ data: { companySlug } })
    setQuotes(nextData.quotes)
    setSettings(nextData.settings)
    setSelectedQuoteId((current) => current || nextData.quotes[0]?.id || '')
    await router.invalidate()
  }

  async function changeStatus(quoteId: string, status: QuoteStatus) {
    const quote = quotes.find((candidate) => candidate.id === quoteId)
    if (status === 'Accepted' && quote && !window.confirm(`Marquer le devis ${quote.reference} comme accepte ?`)) {
      return
    }
    const updated = await updateQuoteStatus({ data: { companySlug, quoteId, status } })
    setQuotes((current) => current.map((quote) => quote.id === updated.id ? updated : quote))
    setMessage(`Devis ${updated.reference} marque: ${statusLabels[status]}.`)
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="no-print mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Ventes</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-950">Devis</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Creation, suivi, personnalisation et impression des devis de {data.company.name}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setActiveModal('settings')} className="inline-flex items-center gap-2 rounded border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <Settings className="size-4" />
            Personnaliser
          </button>
          <button onClick={() => setActiveModal('quote')} className="inline-flex items-center gap-2 rounded bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
            <Plus className="size-4" />
            Nouveau devis
          </button>
        </div>
      </div>

      {message ? (
        <div className="no-print mb-6 rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          {message}
        </div>
      ) : null}

      <div className="no-print mb-6 grid gap-4 md:grid-cols-4">
        <Metric icon={FileCheck2} label="Devis" value={String(quotes.length)} detail="Documents crees" />
        <Metric icon={Send} label="En cours" value={formatMoney(pendingTotal)} detail="Brouillons et envoyes" />
        <Metric icon={BadgeCheck} label="Acceptes" value={formatMoney(acceptedTotal)} detail="Chiffre valide" />
        <Metric icon={Palette} label="Identite" value={settings.legalName || data.company.name} detail="Modele entreprise" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_480px]">
        <section className="no-print overflow-hidden rounded border border-slate-200 bg-white">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
            <h2 className="font-bold text-slate-950">Gestion des devis</h2>
            <span className="text-xs font-semibold text-slate-500">{filteredQuotes.length}/{quotes.length} document{quotes.length > 1 ? 's' : ''}</span>
          </div>
          {quotes.length ? (
            <div>
              <div className="grid gap-3 border-b border-slate-100 p-4 lg:grid-cols-[minmax(0,1fr)_180px_180px]">
                <label className="relative block">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Rechercher reference, client ou objet..."
                    className="field-input pl-9"
                  />
                </label>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)} className="field-input">
                  <option value="All">Tous les statuts</option>
                  {Object.entries(statusLabels).map(([status, label]) => <option key={status} value={status}>{label}</option>)}
                </select>
                <select value={sortBy} onChange={(event) => setSortBy(event.target.value as QuoteSort)} className="field-input">
                  <option value="updated">Derniere activite</option>
                  <option value="validUntil">Validite proche</option>
                  <option value="amountDesc">Montant decroissant</option>
                  <option value="amountAsc">Montant croissant</option>
                </select>
              </div>

              {filteredQuotes.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-left text-sm">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Reference</th>
                        <th className="px-4 py-3 font-semibold">Client</th>
                        <th className="px-4 py-3 font-semibold">Objet</th>
                        <th className="px-4 py-3 text-right font-semibold">Montant</th>
                        <th className="px-4 py-3 text-center font-semibold">Statut</th>
                        <th className="px-4 py-3 text-right font-semibold">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredQuotes.map((quote) => (
                        <tr key={quote.id} className={quote.id === selectedQuote?.id ? 'quote-row-selected' : 'list-row'}>
                          <td className="px-4 py-3">
                            <button onClick={() => setSelectedQuoteId(quote.id)} className="font-bold text-slate-950 hover:underline">
                              {quote.reference}
                            </button>
                            <p className="mt-0.5 text-xs text-slate-500">Valide jusqu'au {formatDate(quote.validUntil)}</p>
                          </td>
                          <td className="px-4 py-3 text-slate-700">{quote.customer?.name ?? 'Client libre'}</td>
                          <td className="px-4 py-3 text-slate-700">{quote.title}</td>
                          <td className="px-4 py-3 text-right font-bold text-slate-950">{formatMoney(quote.totalCents)}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-flex rounded px-2 py-1 text-xs font-bold ${statusClasses[quote.status] ?? statusClasses.Draft}`}>
                              {statusLabels[quote.status] ?? quote.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="inline-flex flex-wrap justify-end gap-2">
                              <button
                                onClick={() => setSelectedQuoteId(quote.id)}
                                className={`rounded px-3 py-1.5 text-xs font-bold ${
                                  quote.id === selectedQuote?.id
                                    ? 'border border-slate-950 bg-slate-950 text-white'
                                    : 'border border-slate-300 text-slate-700 hover:bg-slate-50'
                                }`}
                              >
                                {quote.id === selectedQuote?.id ? 'Ouvert' : 'Voir apercu'}
                              </button>
                              <select
                                value={quote.status}
                                onChange={(event) => void changeStatus(quote.id, event.target.value as QuoteStatus)}
                                className="rounded border border-slate-300 bg-white px-2 py-1.5 text-xs font-bold text-slate-700"
                                aria-label={`Changer le statut de ${quote.reference}`}
                              >
                                {Object.entries(statusLabels).map(([status, label]) => <option key={status} value={status}>{label}</option>)}
                              </select>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="px-5 py-10 text-center">
                  <p className="font-semibold text-slate-800">Aucun devis ne correspond aux filtres.</p>
                  <button onClick={() => { setSearchTerm(''); setStatusFilter('All') }} className="mt-3 rounded border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50">
                    Reinitialiser la recherche
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="px-5 py-12 text-center">
              <FileCheck2 className="mx-auto mb-3 size-10 text-slate-300" />
              <p className="font-semibold text-slate-800">Aucun devis cree.</p>
              <p className="mt-1 text-sm text-slate-500">Ajoute un premier devis avec produits, services et conditions.</p>
              <button onClick={() => setActiveModal('quote')} className="mt-4 inline-flex items-center gap-2 rounded bg-slate-950 px-4 py-2 text-sm font-semibold text-white">
                <Plus className="size-4" />
                Creer un devis
              </button>
            </div>
          )}
        </section>

        <aside className="rounded border border-slate-200 bg-white p-4">
          {selectedQuote ? (
            <>
              <div className="no-print mb-4 flex items-center justify-between gap-2">
                <div>
                  <h2 className="font-light text-slate-950">Apercu impression de devis</h2>
                  <p className="text-xs text-slate-500">{selectedQuote.reference}</p>
                </div>
                <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded bg-slate-950 px-3 py-2 text-sm font-semibold text-white">
                  <Printer className="size-4" />
                  Imprimer
                </button>
              </div>
              <QuotePrint quote={selectedQuote} settings={settings} companyName={data.company.name} />
            </>
          ) : (
            <div className="no-print rounded border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
              Selectionne ou cree un devis pour afficher l'apercu imprimable.
            </div>
          )}
        </aside>
      </div>

      {activeModal === 'quote' ? (
        <QuoteModal
          customers={data.customers}
          items={data.items}
          defaultTerms={settings.paymentTerms}
          onClose={() => setActiveModal(null)}
          onSubmit={async (payload) => {
            const quote = await createQuote({ data: { companySlug, ...payload } })
            setQuotes((current) => [quote, ...current])
            setSelectedQuoteId(quote.id)
            setActiveModal(null)
            setMessage(`Devis ${quote.reference} cree.`)
            await refresh()
          }}
        />
      ) : null}

      {activeModal === 'settings' ? (
        <SettingsModal
          settings={settings}
          companyName={data.company.name}
          onClose={() => setActiveModal(null)}
          onSubmit={async (payload) => {
            const nextSettings = await saveQuoteSettings({ data: { companySlug, ...payload } })
            setSettings(nextSettings)
            setActiveModal(null)
            setMessage('Modele de devis mis a jour.')
          }}
        />
      ) : null}
    </main>
  )
}

function QuoteModal({
  customers,
  items,
  defaultTerms,
  onClose,
  onSubmit,
}: {
  customers: any[]
  items: any[]
  defaultTerms: string
  onClose: () => void
  onSubmit: (payload: any) => Promise<void>
}) {
  const [customerId, setCustomerId] = React.useState('')
  const [customerName, setCustomerName] = React.useState('')
  const [customerEmail, setCustomerEmail] = React.useState('')
  const [title, setTitle] = React.useState('Proposition commerciale')
  const [validUntil, setValidUntil] = React.useState(defaultValidUntil())
  const [discountRate, setDiscountRate] = React.useState('0')
  const [taxRate, setTaxRate] = React.useState('0')
  const [notes, setNotes] = React.useState('')
  const [terms, setTerms] = React.useState(defaultTerms)
  const [lines, setLines] = React.useState<QuoteLineForm[]>([
    { itemId: items[0]?.id ?? '', description: items[0]?.name ?? '', quantity: '1', unitPrice: String(items[0]?.price ?? 0) },
  ])
  const [error, setError] = React.useState('')

  const subtotal = lines.reduce((sum, line) => sum + getNumber(line.quantity) * getNumber(line.unitPrice), 0)
  const discount = Math.round(subtotal * (getNumber(discountRate) / 100))
  const taxable = Math.max(0, subtotal - discount)
  const tax = Math.round(taxable * (getNumber(taxRate) / 100))
  const total = taxable + tax

  function selectItem(index: number, itemId: string) {
    const item = items.find((candidate) => candidate.id === itemId)
    setLines((current) => current.map((line, lineIndex) => lineIndex === index ? {
      ...line,
      itemId,
      description: item?.name ?? line.description,
      unitPrice: String(item?.price ?? line.unitPrice),
    } : line))
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const cleanLines = lines
      .map((line) => ({
        itemId: line.itemId || undefined,
        description: line.description.trim(),
        quantity: Math.max(1, Math.floor(getNumber(line.quantity))),
        unitPrice: Math.max(0, Math.round(getNumber(line.unitPrice))),
      }))
      .filter((line) => line.description)

    if (!title.trim() || !validUntil || cleanLines.length === 0) {
      setError('Renseigne un objet, une date de validite et au moins une ligne.')
      return
    }

    if (!customerId && !customerName.trim()) {
      setError('Choisis un client existant ou renseigne un nouveau client.')
      return
    }

    await onSubmit({
      customerId: customerId || undefined,
      customerName: customerId ? undefined : customerName,
      customerEmail: customerId ? undefined : customerEmail,
      title,
      validUntil,
      discountRate: getNumber(discountRate),
      taxRate: getNumber(taxRate),
      notes,
      terms,
      lines: cleanLines,
    })
  }

  return (
    <Modal title="Nouveau devis" onClose={onClose} size="wide">
      <form onSubmit={handleSubmit} className="grid gap-5 lg:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="field-label">Client existant</span>
              <select value={customerId} onChange={(event) => setCustomerId(event.target.value)} className="field-input">
                <option value="">Nouveau client ou a renseigner</option>
                {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
              </select>
            </label>
            <TextField label="Objet" value={title} onChange={setTitle} required />
            {!customerId ? (
              <>
                <TextField label="Nom client" value={customerName} onChange={setCustomerName} required />
                <TextField label="Email client" value={customerEmail} onChange={setCustomerEmail} type="email" />
              </>
            ) : null}
            <TextField label="Valide jusqu'au" value={validUntil} onChange={setValidUntil} type="date" required />
            <TextField label="Remise (%)" value={discountRate} onChange={setDiscountRate} type="number" min="0" max="100" />
            <TextField label="Taxe (%)" value={taxRate} onChange={setTaxRate} type="number" min="0" max="100" />
          </div>

          <div className="rounded border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <h3 className="font-bold text-slate-950">Lignes</h3>
              <button type="button" onClick={() => setLines((current) => [...current, { itemId: '', description: '', quantity: '1', unitPrice: '0' }])} className="inline-flex items-center gap-2 rounded border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700">
                <Plus className="size-3.5" />
                Ligne
              </button>
            </div>
            <div className="hidden grid-cols-[1fr_1.4fr_80px_110px_90px_36px] gap-2 border-b border-slate-100 px-4 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400 md:grid">
              <span>Article</span>
              <span>Description</span>
              <span className="text-right">Qte</span>
              <span className="text-right">PU</span>
              <span className="text-right">Total</span>
              <span />
            </div>
            <div className="space-y-3 p-4">
              {lines.map((line, index) => (
                <div key={index} className="grid gap-2 rounded border border-slate-100 p-3 md:grid-cols-[1fr_1.4fr_80px_110px_90px_36px]">
                  <label>
                    <span className="field-label md:hidden">Article</span>
                    <select value={line.itemId} onChange={(event) => selectItem(index, event.target.value)} className="field-input">
                      <option value="">Ligne libre</option>
                      {items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                  </label>
                  <label>
                    <span className="field-label md:hidden">Description</span>
                    <input value={line.description} onChange={(event) => setLines((current) => current.map((candidate, lineIndex) => lineIndex === index ? { ...candidate, description: event.target.value } : candidate))} placeholder="Description" className="field-input" />
                  </label>
                  <label>
                    <span className="field-label md:hidden">Qte</span>
                    <input value={line.quantity} onChange={(event) => setLines((current) => current.map((candidate, lineIndex) => lineIndex === index ? { ...candidate, quantity: event.target.value } : candidate))} type="number" min="1" className="field-input text-right" />
                  </label>
                  <label>
                    <span className="field-label md:hidden">PU</span>
                    <input value={line.unitPrice} onChange={(event) => setLines((current) => current.map((candidate, lineIndex) => lineIndex === index ? { ...candidate, unitPrice: event.target.value } : candidate))} type="number" min="0" className="field-input text-right" />
                  </label>
                  <div>
                    <span className="field-label md:hidden">Total</span>
                    <div className="flex h-10 items-center justify-end rounded border border-slate-100 px-3 text-sm font-bold text-slate-950">
                      {formatMoney(getNumber(line.quantity) * getNumber(line.unitPrice))}
                    </div>
                  </div>
                  <div className="flex items-end">
                    <button type="button" onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))} disabled={lines.length === 1} className="inline-flex size-10 items-center justify-center rounded border border-slate-200 text-slate-500 disabled:opacity-40">
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="field-label">Note client</span>
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} className="field-input" />
          </label>
          <label className="block">
            <span className="field-label">Conditions</span>
            <textarea value={terms} onChange={(event) => setTerms(event.target.value)} rows={3} className="field-input" />
          </label>
        </div>

        <aside className="self-start rounded border border-slate-200 bg-slate-50 p-4 lg:sticky lg:top-4">
          <h3 className="font-bold text-slate-950">Total</h3>
          <AmountRow label="Sous-total" value={subtotal} />
          <AmountRow label="Remise" value={-discount} />
          <AmountRow label="Taxe" value={tax} />
          <div className="mt-4 border-t border-slate-200 pt-4">
            <AmountRow label="A payer" value={total} strong />
          </div>
          {error ? <p className="mt-4 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</p> : null}
          <div className="mt-5 grid gap-2">
            <button type="submit" className="inline-flex items-center justify-center gap-2 rounded bg-slate-950 px-4 py-2 text-sm font-semibold text-white">
              <Save className="size-4" />
              Enregistrer
            </button>
            <button type="button" onClick={onClose} className="inline-flex items-center justify-center gap-2 rounded border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">
              <X className="size-4" />
              Annuler
            </button>
          </div>
        </aside>
      </form>
    </Modal>
  )
}

function SettingsModal({ settings, companyName, onClose, onSubmit }: { settings: any; companyName: string; onClose: () => void; onSubmit: (payload: any) => Promise<void> }) {
  const [form, setForm] = React.useState({
    logoUrl: settings.logoUrl ?? '',
    legalName: settings.legalName ?? companyName,
    address: settings.address ?? '',
    phone: settings.phone ?? '',
    email: settings.email ?? '',
    taxId: settings.taxId ?? '',
    footerNote: settings.footerNote ?? '',
    paymentTerms: settings.paymentTerms ?? '',
    accentColor: settings.accentColor ?? '#0f172a',
  })
  const [error, setError] = React.useState('')

  function updateField(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }))
    setError('')
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (form.logoUrl.trim() && !isHttpUrl(form.logoUrl)) {
      setError('Le logo doit etre une URL valide commençant par http:// ou https://.')
      return
    }
    if (!isHexColor(form.accentColor)) {
      setError('La couleur doit etre au format hexadecimal, par exemple #0f172a.')
      return
    }
    await onSubmit(form)
  }

  return (
    <Modal title="Personnalisation du devis" onClose={onClose}>
      <form onSubmit={(event) => { void handleSubmit(event) }} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Nom legal" value={form.legalName} onChange={(value) => updateField('legalName', value)} />
          <TextField label="Logo URL" value={form.logoUrl} onChange={(value) => updateField('logoUrl', value)} placeholder="https://..." />
          <TextField label="Telephone" value={form.phone} onChange={(value) => updateField('phone', value)} />
          <TextField label="Email" value={form.email} onChange={(value) => updateField('email', value)} type="email" />
          <TextField label="NIF / RCCM" value={form.taxId} onChange={(value) => updateField('taxId', value)} />
          <label className="block">
            <span className="field-label">Couleur</span>
            <div className="flex gap-2">
              <input value={form.accentColor} onChange={(event) => updateField('accentColor', event.target.value)} type="color" className="h-10 w-12 rounded border border-slate-300 bg-white p-1" />
              <input value={form.accentColor} onChange={(event) => updateField('accentColor', event.target.value)} pattern="^#[0-9a-fA-F]{6}$" className="field-input" />
            </div>
          </label>
        </div>
        <label className="block">
          <span className="field-label">Adresse</span>
          <textarea value={form.address} onChange={(event) => updateField('address', event.target.value)} rows={2} className="field-input" />
        </label>
        <label className="block">
          <span className="field-label">Conditions par defaut</span>
          <textarea value={form.paymentTerms} onChange={(event) => updateField('paymentTerms', event.target.value)} rows={3} className="field-input" />
        </label>
        <label className="block">
          <span className="field-label">Pied de page</span>
          <textarea value={form.footerNote} onChange={(event) => updateField('footerNote', event.target.value)} rows={2} className="field-input" />
        </label>
        {error ? <p className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</p> : null}
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <button type="button" onClick={onClose} className="inline-flex items-center gap-2 rounded border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">
            <X className="size-4" />
            Annuler
          </button>
          <button type="submit" className="inline-flex items-center gap-2 rounded bg-slate-950 px-4 py-2 text-sm font-semibold text-white">
            <Check className="size-4" />
            Enregistrer
          </button>
        </div>
      </form>
    </Modal>
  )
}

function QuotePrint({ quote, settings, companyName }: { quote: any; settings: any; companyName: string }) {
  const discount = Math.round(quote.subtotalCents * (quote.discountRate / 100))
  const taxable = Math.max(0, quote.subtotalCents - discount)
  const tax = Math.round(taxable * (quote.taxRate / 100))

  return (
    <div className="quote-print-area overflow-hidden rounded border border-slate-200 bg-white text-slate-950">
      <div className="p-6" style={{ borderTop: `6px solid ${settings.accentColor || '#0f172a'}` }}>
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            {settings.logoUrl ? <img src={settings.logoUrl} alt="" className="mb-3 h-12 max-w-36 object-contain" /> : <Building2 className="mb-3 size-10 text-slate-300" />}
            <h2 className="text-lg font-bold text-slate-950">{settings.legalName || companyName}</h2>
            <p className="mt-1 whitespace-pre-line text-xs leading-5 text-slate-500">{settings.address}</p>
            <p className="mt-2 text-xs text-slate-500">{[settings.phone, settings.email].filter(Boolean).join(' - ')}</p>
            {settings.taxId ? <p className="mt-1 text-xs text-slate-500">{settings.taxId}</p> : null}
          </div>
          <div className="text-right">
            <p className="text-2xl font-black uppercase text-slate-950">Devis</p>
            <p className="mt-1 font-mono text-sm font-bold text-slate-500">{quote.reference}</p>
            <p className="mt-4 text-xs text-slate-500">Emission: {formatDate(quote.issueDate)}</p>
            <p className="text-xs text-slate-500">Validite: {formatDate(quote.validUntil)}</p>
          </div>
        </div>

        <div className="mt-8 grid gap-4 border-y border-slate-200 py-4 sm:grid-cols-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Client</p>
            <p className="mt-1 font-bold text-slate-950">{quote.customer?.name ?? 'Client libre'}</p>
            {quote.customer?.email ? <p className="text-xs text-slate-500">{quote.customer.email}</p> : null}
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Objet</p>
            <p className="mt-1 font-bold text-slate-950">{quote.title}</p>
            <p className={`mt-2 inline-flex rounded px-2 py-1 text-xs font-bold ${statusClasses[quote.status] ?? statusClasses.Draft}`}>{statusLabels[quote.status] ?? quote.status}</p>
          </div>
        </div>

        <table className="mt-6 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
              <th className="py-2 font-bold">Description</th>
              <th className="py-2 text-right font-bold">Qte</th>
              <th className="py-2 text-right font-bold">PU</th>
              <th className="py-2 text-right font-bold">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {quote.lines.map((line: any) => (
              <tr key={line.id}>
                <td className="py-3 font-semibold text-slate-800">{line.description}</td>
                <td className="py-3 text-right text-slate-600">{line.quantity}</td>
                <td className="py-3 text-right text-slate-600">{formatMoney(line.unitPrice)}</td>
                <td className="py-3 text-right font-bold text-slate-950">{formatMoney(line.totalCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-6 flex justify-end">
          <div className="w-full max-w-xs space-y-2">
            <AmountRow label="Sous-total" value={quote.subtotalCents} />
            <AmountRow label={`Remise (${quote.discountRate}%)`} value={-discount} />
            <AmountRow label={`Taxe (${quote.taxRate}%)`} value={tax} />
            <div className="border-t border-slate-200 pt-3">
              <AmountRow label="Total" value={quote.totalCents} strong />
            </div>
          </div>
        </div>

        {quote.notes ? (
          <div className="mt-6 rounded border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Note</p>
            <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{quote.notes}</p>
          </div>
        ) : null}

        <div className="mt-6 grid gap-4 text-xs leading-5 text-slate-500 sm:grid-cols-2">
          <div>
            <p className="font-bold uppercase tracking-widest text-slate-400">Conditions</p>
            <p className="mt-1 whitespace-pre-line">{quote.terms || settings.paymentTerms}</p>
          </div>
          <div className="sm:text-right">
            <p className="font-bold uppercase tracking-widest text-slate-400">Message</p>
            <p className="mt-1 whitespace-pre-line">{settings.footerNote}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function Modal({ title, children, onClose, size = 'normal' }: { title: string; children: React.ReactNode; onClose: () => void; size?: 'normal' | 'wide' }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/40 px-4 py-8" role="dialog" aria-modal="true">
      <div className={`w-full rounded border border-slate-200 bg-white shadow-xl ${size === 'wide' ? 'max-w-5xl' : 'max-w-2xl'}`}>
        <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-bold text-slate-950">{title}</h2>
          <button type="button" onClick={onClose} className="inline-flex size-9 items-center justify-center rounded border border-slate-200 text-slate-500 hover:bg-slate-50" aria-label="Fermer">
            <X className="size-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

function Metric({ icon: Icon, label, value, detail }: { icon: any; label: string; value: string; detail: string }) {
  return (
    <div className="rounded border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p>
        <Icon className="size-4 text-slate-300" />
      </div>
      <p className="truncate text-2xl font-bold text-slate-950">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </div>
  )
}

function TextField({ label, value, onChange, ...props }: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <input {...props} value={value} onChange={(event) => onChange(event.target.value)} className="field-input" />
    </label>
  )
}

function AmountRow({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-3 ${strong ? 'text-lg font-black text-slate-950' : 'text-sm text-slate-600'}`}>
      <span>{label}</span>
      <span className="font-bold">{formatMoney(value)}</span>
    </div>
  )
}

function formatDate(value: string | Date) {
  return new Date(value).toLocaleDateString('fr-FR')
}

function getNumber(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function isHexColor(value: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value)
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol)
  } catch {
    return false
  }
}

function defaultValidUntil() {
  const date = new Date()
  date.setDate(date.getDate() + 30)
  return date.toISOString().slice(0, 10)
}
