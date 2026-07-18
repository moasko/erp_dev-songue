import { createFileRoute, useRouter } from '@tanstack/react-router'
import {
  AlarmClock,
  BadgeCheck,
  Ban,
  Banknote,
  Eye,
  FileDown,
  Mail,
  Plus,
  Printer,
  ReceiptText,
  Save,
  Search,
  Send,
  Trash2,
  X,
} from 'lucide-react'
import * as React from 'react'
import { getInvoiceData } from '~/server/dataFetchers'
import {
  createSalesInvoice,
  recordInvoicePayment,
  runInvoiceReminders,
  sendDocumentByEmail,
  sendInvoiceReminder,
  updateSalesInvoiceStatus,
} from '~/server/operations'
import { useMoney } from '~/context/CompanyContext'
import { DocumentPrint } from '~/components/DocumentPrint'
import { computeDocumentTotals } from '~/utils/documentTotals'
import { downloadCsv } from '~/utils/csvExport'
import { DateRangeFilter, matchesDatePreset, todayInputValue, type DatePreset } from '~/components/DateRangeFilter'

export const Route = createFileRoute('/$companySlug/invoices')({
  loader: async ({ params }) => getInvoiceData({ data: { companySlug: params.companySlug } }),
  component: InvoicesPage,
})

type Modal = 'invoice' | 'payment' | 'preview' | null
type StatusFilter = 'All' | 'Draft' | 'Sent' | 'PartiallyPaid' | 'Paid' | 'Overdue' | 'Cancelled'
type InvoiceLineForm = {
  itemId: string
  description: string
  quantity: string
  unitPrice: string
  vatRate: string
}

const statusLabels: Record<string, string> = {
  Draft: 'Brouillon',
  Sent: 'Envoyee',
  PartiallyPaid: 'Partiellement payee',
  Paid: 'Payee',
  Overdue: 'En retard',
  Cancelled: 'Annulee',
}

const statusClasses: Record<string, string> = {
  Draft: 'bg-slate-100 text-slate-600',
  Sent: 'bg-blue-50 text-blue-700',
  PartiallyPaid: 'bg-amber-50 text-amber-700',
  Paid: 'bg-emerald-50 text-emerald-700',
  Overdue: 'bg-rose-50 text-rose-700',
  Cancelled: 'bg-slate-100 text-slate-400',
}

function remainingOf(invoice: any) {
  return Math.max(0, invoice.totalCents - invoice.paidCents)
}

function InvoicesPage() {
  const { formatMoney } = useMoney()
  const { companySlug } = Route.useParams()
  const router = useRouter()
  const data = Route.useLoaderData()

  const [invoices, setInvoices] = React.useState<any[]>(data.invoices)
  const [selectedInvoiceId, setSelectedInvoiceId] = React.useState<string>(data.invoices[0]?.id ?? '')
  const [activeModal, setActiveModal] = React.useState<Modal>(null)
  const [message, setMessage] = React.useState('')
  const [searchTerm, setSearchTerm] = React.useState('')
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>('All')
  const [datePreset, setDatePreset] = React.useState<DatePreset>('all')
  const [startDate, setStartDate] = React.useState(todayInputValue())
  const [endDate, setEndDate] = React.useState(todayInputValue())

  const selectedInvoice = invoices.find((invoice) => invoice.id === selectedInvoiceId) ?? invoices[0] ?? null

  const activeInvoices = invoices.filter((invoice) => invoice.status !== 'Cancelled')
  const collectedTotal = activeInvoices.reduce((sum, invoice) => sum + invoice.paidCents, 0)
  const outstandingTotal = activeInvoices.reduce((sum, invoice) => sum + remainingOf(invoice), 0)
  const overdueTotal = activeInvoices
    .filter((invoice) => invoice.status === 'Overdue')
    .reduce((sum, invoice) => sum + remainingOf(invoice), 0)

  const filteredInvoices = React.useMemo(() => {
    const query = searchTerm.trim().toLowerCase()
    return invoices.filter((invoice) => {
      const matchesStatus = statusFilter === 'All' || invoice.status === statusFilter
      const matchesDate = matchesDatePreset(invoice.issueDate, datePreset, startDate, endDate)
      const searchable = [
        invoice.number,
        invoice.customer?.name,
        invoice.customer?.email,
        invoice.title,
        invoice.quote?.reference,
      ].filter(Boolean).join(' ').toLowerCase()
      return matchesStatus && matchesDate && (!query || searchable.includes(query))
    })
  }, [invoices, searchTerm, statusFilter, datePreset, startDate, endDate])

  async function refresh() {
    const nextData = await getInvoiceData({ data: { companySlug } })
    setInvoices(nextData.invoices)
    setSelectedInvoiceId((current) => current || nextData.invoices[0]?.id || '')
    await router.invalidate()
  }

  function applyUpdate(updated: any) {
    setInvoices((current) => current.map((invoice) => invoice.id === updated.id ? updated : invoice))
  }

  async function changeStatus(invoiceId: string, status: 'Draft' | 'Sent' | 'Cancelled') {
    const invoice = invoices.find((candidate) => candidate.id === invoiceId)
    if (!invoice) return
    if (status === 'Cancelled' && !window.confirm(`Annuler la facture ${invoice.number} ?`)) return
    try {
      const updated = await updateSalesInvoiceStatus({ data: { companySlug, invoiceId, status } })
      applyUpdate(updated)
      setMessage(`Facture ${updated.number} marquee : ${statusLabels[status]}.`)
    } catch (error: any) {
      setMessage(error?.message || 'Impossible de changer le statut.')
    }
  }

  async function emailInvoice(invoiceId: string) {
    const invoice = invoices.find((candidate) => candidate.id === invoiceId)
    if (!invoice) return
    const to = window.prompt('Envoyer la facture a :', invoice.customer?.email ?? '')
    if (to === null) return
    try {
      const result = await sendDocumentByEmail({ data: { companySlug, kind: 'invoice', documentId: invoiceId, to: to.trim() || undefined } })
      applyUpdate(result.document)
      setMessage(result.delivered
        ? `Facture ${invoice.number} envoyee par email.`
        : `Aucun transport email configure : le message est visible dans la console du serveur. Renseigne RESEND_API_KEY pour envoyer reellement.`)
    } catch (error: any) {
      setMessage(error?.message || 'Impossible d\'envoyer la facture.')
    } finally {
      // Le resultat (banniere de confirmation ou d'erreur) s'affiche sur la
      // page : on referme l'apercu pour qu'il soit visible.
      setActiveModal((current) => current === 'preview' ? null : current)
    }
  }

  async function remindInvoice(invoiceId: string) {
    try {
      const updated = await sendInvoiceReminder({ data: { companySlug, invoiceId } })
      applyUpdate(updated)
      setMessage(`Rappel envoye pour la facture ${updated.number}.`)
    } catch (error: any) {
      setMessage(error?.message || 'Impossible d\'envoyer le rappel.')
    }
  }

  async function remindAllOverdue() {
    if (!window.confirm('Envoyer un rappel par email a tous les clients ayant une facture en retard ?')) return
    try {
      const result = await runInvoiceReminders({ data: { companySlug } })
      await refresh()
      const parts = [
        result.markedOverdue ? `${result.markedOverdue} facture(s) passee(s) en retard` : null,
        `${result.reminded} rappel(s) envoye(s)`,
        result.missingEmail ? `${result.missingEmail} client(s) sans email` : null,
      ].filter(Boolean)
      setMessage(`Relance terminee : ${parts.join(', ')}.`)
    } catch (error: any) {
      setMessage(error?.message || 'La relance a echoue.')
    }
  }

  function exportInvoicesCsv() {
    downloadCsv(`factures-${companySlug}.csv`, filteredInvoices, [
      { header: 'Numero', value: (invoice: any) => invoice.number },
      { header: 'Client', value: (invoice: any) => invoice.customer?.name ?? 'Client comptant' },
      { header: 'Objet', value: (invoice: any) => invoice.title ?? '' },
      { header: 'Devis source', value: (invoice: any) => invoice.quote?.reference ?? '' },
      { header: 'Statut', value: (invoice: any) => statusLabels[invoice.status] ?? invoice.status },
      { header: 'Emission', value: (invoice: any) => formatDate(invoice.issueDate) },
      { header: 'Echeance', value: (invoice: any) => invoice.dueDate ? formatDate(invoice.dueDate) : '' },
      { header: 'Total HT', value: (invoice: any) => invoice.subtotalCents },
      { header: 'TVA', value: (invoice: any) => invoice.taxCents },
      { header: 'Total TTC', value: (invoice: any) => invoice.totalCents },
      { header: 'Encaisse', value: (invoice: any) => invoice.paidCents },
      { header: 'Reste a payer', value: (invoice: any) => remainingOf(invoice) },
      { header: 'Devise', value: (invoice: any) => invoice.currency },
    ])
  }

  // Boutons d'action d'une facture. En `compact` (table desktop), chaque action
  // devient une icone avec infobulle : la colonne Actions reste etroite meme
  // quand une facture cumule 4 actions possibles. Les cartes mobile gardent les
  // libelles complets (pas de survol pour lire une infobulle au doigt).
  function invoiceActions(invoice: any, compact = false) {
    const remaining = remainingOf(invoice)
    const actions = [
      {
        key: 'preview',
        label: 'Apercu',
        icon: Eye,
        show: true,
        className: 'border-slate-300 text-slate-700 hover:bg-slate-50',
        onClick: () => { setSelectedInvoiceId(invoice.id); setActiveModal('preview') },
      },
      {
        key: 'send',
        label: 'Marquer envoyee',
        icon: Send,
        show: invoice.status === 'Draft',
        className: 'border-slate-300 text-slate-700 hover:bg-slate-50',
        onClick: () => void changeStatus(invoice.id, 'Sent'),
      },
      {
        key: 'pay',
        label: 'Encaisser',
        icon: Banknote,
        show: remaining > 0 && invoice.status !== 'Cancelled',
        className: 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
        onClick: () => { setSelectedInvoiceId(invoice.id); setActiveModal('payment') },
      },
      {
        key: 'remind',
        label: 'Relancer',
        icon: AlarmClock,
        show: invoice.status === 'Overdue' && remaining > 0,
        className: 'border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100',
        onClick: () => void remindInvoice(invoice.id),
      },
      {
        key: 'cancel',
        label: 'Annuler',
        icon: Ban,
        show: invoice.paidCents === 0 && invoice.status !== 'Cancelled',
        className: 'border-slate-300 text-slate-500 hover:bg-slate-50',
        onClick: () => void changeStatus(invoice.id, 'Cancelled'),
      },
    ].filter((action) => action.show)

    return (
      <>
        {actions.map(({ key, label, icon: Icon, className, onClick }) => (
          <button
            key={key}
            onClick={onClick}
            title={label}
            aria-label={label}
            className={compact
              ? `inline-flex size-8 items-center justify-center rounded border ${className}`
              : `inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs font-bold ${className}`}
          >
            <Icon className={compact ? 'size-4' : 'size-3.5'} />
            {compact ? null : label}
          </button>
        ))}
      </>
    )
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="no-print mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Ventes</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-950">Factures</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Factures de vente de {data.company.name} : creation, encaissement, envoi et relances.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => void remindAllOverdue()} className="inline-flex items-center gap-2 rounded border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <AlarmClock className="size-4" />
            Relancer les impayes
          </button>
          <button onClick={() => setActiveModal('invoice')} className="inline-flex items-center gap-2 rounded bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
            <Plus className="size-4" />
            Nouvelle facture
          </button>
        </div>
      </div>

      {message ? (
        <div className="no-print mb-6 rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          {message}
        </div>
      ) : null}

      <div className="no-print mb-6 grid gap-4 md:grid-cols-4">
        <Metric icon={ReceiptText} label="Factures" value={String(invoices.length)} detail="Documents emis" />
        <Metric icon={BadgeCheck} label="Encaisse" value={formatMoney(collectedTotal)} detail="Paiements recus" />
        <Metric icon={Banknote} label="En attente" value={formatMoney(outstandingTotal)} detail="Reste a encaisser" />
        <Metric icon={AlarmClock} label="En retard" value={formatMoney(overdueTotal)} detail="Echeance depassee" />
      </div>

      <section className="no-print min-w-0 overflow-hidden rounded border border-slate-200 bg-white">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
            <h2 className="font-bold text-slate-950">Gestion des factures</h2>
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-slate-500">{filteredInvoices.length}/{invoices.length} document{invoices.length > 1 ? 's' : ''}</span>
              {invoices.length ? (
                <button onClick={exportInvoicesCsv} className="inline-flex items-center gap-1.5 rounded border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50">
                  <FileDown className="size-3.5" />
                  CSV
                </button>
              ) : null}
            </div>
          </div>
          {invoices.length ? (
            <div>
              <div className="space-y-3 border-b border-slate-100 p-4">
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_200px]">
                  <label className="relative block">
                    <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                    <input
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                      placeholder="Rechercher numero, client ou objet..."
                      className="field-input pl-9"
                    />
                  </label>
                  <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)} className="field-input">
                    <option value="All">Tous les statuts</option>
                    {Object.entries(statusLabels).map(([status, label]) => <option key={status} value={status}>{label}</option>)}
                  </select>
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

              {filteredInvoices.length ? (
                <>
                {/* Mobile : cartes empilees, tout est visible sans scroll lateral. */}
                <div className="divide-y divide-slate-100 md:hidden">
                  {filteredInvoices.map((invoice) => {
                    const remaining = remainingOf(invoice)
                    return (
                      <div key={invoice.id} className="space-y-2.5 px-4 py-3.5">
                        <div className="flex items-center justify-between gap-2">
                          <button onClick={() => { setSelectedInvoiceId(invoice.id); setActiveModal('preview') }} className="font-bold text-slate-950">
                            {invoice.number}
                          </button>
                          <span className={`inline-flex rounded px-2 py-1 text-xs font-bold ${statusClasses[invoice.status] ?? statusClasses.Draft}`}>
                            {statusLabels[invoice.status] ?? invoice.status}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500">
                          {invoice.customer?.name ?? 'Client comptant'}
                          {invoice.quote?.reference ? ` · Devis ${invoice.quote.reference}` : ''}
                          {invoice.dueDate ? ` · Echeance ${formatDate(invoice.dueDate)}` : ''}
                        </p>
                        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                          <span className="font-bold text-slate-950">{formatMoney(invoice.totalCents)}</span>
                          {invoice.status !== 'Cancelled' && remaining > 0 ? (
                            <span className="font-bold text-rose-700">Reste {formatMoney(remaining)}</span>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap gap-2">{invoiceActions(invoice)}</div>
                      </div>
                    )
                  })}
                </div>
                {/* Desktop : table complete. */}
                <div className="hidden overflow-x-auto md:block">
                  {/* Actions en icones : la table tient sans scroll des 760px. */}
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Numero</th>
                        <th className="px-4 py-3 font-semibold">Client</th>
                        <th className="px-4 py-3 font-semibold">Echeance</th>
                        <th className="px-4 py-3 text-right font-semibold">Total TTC</th>
                        <th className="px-4 py-3 text-right font-semibold">Reste</th>
                        <th className="px-4 py-3 text-center font-semibold">Statut</th>
                        <th className="px-4 py-3 text-right font-semibold">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredInvoices.map((invoice) => {
                        const remaining = remainingOf(invoice)
                        return (
                          <tr key={invoice.id} className="list-row">
                            <td className="px-4 py-3">
                              <button onClick={() => { setSelectedInvoiceId(invoice.id); setActiveModal('preview') }} className="font-bold text-slate-950 hover:underline">
                                {invoice.number}
                              </button>
                              <p className="mt-0.5 text-xs text-slate-500">
                                {invoice.quote?.reference ? `Devis ${invoice.quote.reference} - ` : ''}{formatDate(invoice.issueDate)}
                              </p>
                            </td>
                            <td className="px-4 py-3 text-slate-700">{invoice.customer?.name ?? 'Client comptant'}</td>
                            <td className="px-4 py-3 text-slate-700">{invoice.dueDate ? formatDate(invoice.dueDate) : '-'}</td>
                            <td className="px-4 py-3 text-right font-bold text-slate-950">{formatMoney(invoice.totalCents)}</td>
                            <td className={`px-4 py-3 text-right font-bold ${remaining > 0 && invoice.status !== 'Cancelled' ? 'text-rose-700' : 'text-slate-400'}`}>
                              {invoice.status === 'Cancelled' ? '-' : formatMoney(remaining)}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={`inline-flex rounded px-2 py-1 text-xs font-bold ${statusClasses[invoice.status] ?? statusClasses.Draft}`}>
                                {statusLabels[invoice.status] ?? invoice.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="inline-flex justify-end gap-1.5">{invoiceActions(invoice, true)}</div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                </>
              ) : (
                <div className="px-5 py-10 text-center">
                  <p className="font-semibold text-slate-800">Aucune facture ne correspond aux filtres.</p>
                  <button onClick={() => { setSearchTerm(''); setStatusFilter('All'); setDatePreset('all') }} className="mt-3 rounded border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50">
                    Reinitialiser la recherche
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="px-5 py-12 text-center">
              <ReceiptText className="mx-auto mb-3 size-10 text-slate-300" />
              <p className="font-semibold text-slate-800">Aucune facture emise.</p>
              <p className="mt-1 text-sm text-slate-500">Cree une facture directement, ou convertis un devis accepte depuis la page Devis.</p>
              <button onClick={() => setActiveModal('invoice')} className="mt-4 inline-flex items-center gap-2 rounded bg-slate-950 px-4 py-2 text-sm font-semibold text-white">
                <Plus className="size-4" />
                Creer une facture
              </button>
            </div>
          )}
        </section>

      {/* L'apercu s'ouvre dans un modal plutot que dans une colonne fixe :
          la liste garde toute la largeur et le document se consulte a la demande. */}
      {activeModal === 'preview' && selectedInvoice ? (
        <div className="print-modal fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/40 px-3 py-6 sm:px-4 sm:py-8" role="dialog" aria-modal="true">
          <div className="w-full max-w-3xl rounded border border-slate-200 bg-white shadow-xl">
            <div className="no-print flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-5">
              <div>
                <h2 className="text-lg font-bold text-slate-950">Apercu de la facture</h2>
                <p className="text-xs text-slate-500">
                  {selectedInvoice.number} · {statusLabels[selectedInvoice.status] ?? selectedInvoice.status}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => void emailInvoice(selectedInvoice.id)} className="inline-flex items-center gap-2 rounded border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" title="Envoyer la facture par email au client">
                  <Mail className="size-4" />
                  Email
                </button>
                {remainingOf(selectedInvoice) > 0 && selectedInvoice.status !== 'Cancelled' ? (
                  <button onClick={() => setActiveModal('payment')} className="inline-flex items-center gap-2 rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100">
                    <Banknote className="size-4" />
                    Encaisser
                  </button>
                ) : null}
                <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded bg-slate-950 px-3 py-2 text-sm font-semibold text-white">
                  <Printer className="size-4" />
                  Imprimer
                </button>
                <button type="button" onClick={() => setActiveModal(null)} className="inline-flex size-9 items-center justify-center rounded border border-slate-200 text-slate-500 hover:bg-slate-50" aria-label="Fermer">
                  <X className="size-4" />
                </button>
              </div>
            </div>
            <div className="p-4 sm:p-5">
              <DocumentPrint
                kind="invoice"
                doc={{
                  reference: selectedInvoice.number,
                  title: selectedInvoice.title,
                  issueDate: selectedInvoice.issueDate,
                  deadline: selectedInvoice.dueDate,
                  customer: selectedInvoice.customer,
                  lines: selectedInvoice.lines,
                  discountRate: selectedInvoice.discountRate,
                  taxRate: selectedInvoice.taxRate,
                  notes: selectedInvoice.notes,
                  terms: selectedInvoice.terms,
                  paidCents: selectedInvoice.paidCents,
                }}
                settings={data.settings}
                companyName={data.company.name}
              />
            </div>
          </div>
        </div>
      ) : null}

      {activeModal === 'invoice' ? (
        <InvoiceModal
          customers={data.customers}
          items={data.items}
          defaultTerms={data.settings.paymentTerms}
          onClose={() => setActiveModal(null)}
          onSubmit={async (payload) => {
            const invoice = await createSalesInvoice({ data: { companySlug, ...payload } })
            setInvoices((current) => [invoice, ...current])
            setSelectedInvoiceId(invoice.id)
            setActiveModal(null)
            setMessage(`Facture ${invoice.number} creee.`)
            await refresh()
          }}
        />
      ) : null}

      {activeModal === 'payment' && selectedInvoice ? (
        <PaymentModal
          invoice={selectedInvoice}
          accounts={data.accounts}
          onClose={() => setActiveModal(null)}
          onSubmit={async (payload) => {
            const updated = await recordInvoicePayment({ data: { companySlug, invoiceId: selectedInvoice.id, ...payload } })
            applyUpdate(updated)
            setActiveModal(null)
            setMessage(`Paiement enregistre sur la facture ${updated.number}.`)
            await refresh()
          }}
        />
      ) : null}
    </main>
  )
}

function InvoiceModal({
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
  const { formatMoney } = useMoney()
  const [customerId, setCustomerId] = React.useState('')
  const [customerName, setCustomerName] = React.useState('')
  const [customerEmail, setCustomerEmail] = React.useState('')
  const [title, setTitle] = React.useState('Facture de vente')
  const [dueDate, setDueDate] = React.useState(defaultDueDate())
  const [discountRate, setDiscountRate] = React.useState('0')
  const [taxRate, setTaxRate] = React.useState('0')
  const [notes, setNotes] = React.useState('')
  const [terms, setTerms] = React.useState(defaultTerms)
  const [lines, setLines] = React.useState<InvoiceLineForm[]>([
    { itemId: items[0]?.id ?? '', description: items[0]?.name ?? '', quantity: '1', unitPrice: String(items[0]?.price ?? 0), vatRate: itemVatRate(items[0]) },
  ])
  const [error, setError] = React.useState('')
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  const totals = computeDocumentTotals(
    lines.map((line) => ({
      quantity: getNumber(line.quantity),
      unitPrice: getNumber(line.unitPrice),
      vatRate: line.vatRate === '' ? null : getNumber(line.vatRate),
    })),
    getNumber(discountRate),
    getNumber(taxRate),
  )

  function selectItem(index: number, itemId: string) {
    const item = items.find((candidate) => candidate.id === itemId)
    setLines((current) => current.map((line, lineIndex) => lineIndex === index ? {
      ...line,
      itemId,
      description: item?.name ?? line.description,
      unitPrice: String(item?.price ?? line.unitPrice),
      vatRate: item ? itemVatRate(item) : line.vatRate,
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
        vatRate: line.vatRate === '' ? null : Math.min(100, Math.max(0, Math.round(getNumber(line.vatRate)))),
      }))
      .filter((line) => line.description)

    if (!title.trim() || cleanLines.length === 0) {
      setError('Renseigne un objet et au moins une ligne.')
      return
    }
    if (!customerId && !customerName.trim()) {
      setError('Choisis un client existant ou renseigne un nouveau client.')
      return
    }

    if (isSubmitting) return
    setError('')
    setIsSubmitting(true)
    try {
      await onSubmit({
        customerId: customerId || undefined,
        customerName: customerId ? undefined : customerName,
        customerEmail: customerId ? undefined : customerEmail,
        title,
        dueDate: dueDate || undefined,
        discountRate: getNumber(discountRate),
        taxRate: getNumber(taxRate),
        notes,
        terms,
        lines: cleanLines,
      })
    } catch (submitError: any) {
      setError(submitError?.message || 'Impossible de creer la facture.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal title="Nouvelle facture" onClose={onClose} size="wide">
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
            <TextField label="Echeance" value={dueDate} onChange={setDueDate} type="date" />
            <TextField label="Remise (%)" value={discountRate} onChange={setDiscountRate} type="number" min="0" max="100" />
            <TextField label="TVA par defaut (%)" value={taxRate} onChange={setTaxRate} type="number" min="0" max="100" />
          </div>

          <div className="rounded border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <h3 className="font-bold text-slate-950">Lignes</h3>
              <button type="button" onClick={() => setLines((current) => [...current, { itemId: '', description: '', quantity: '1', unitPrice: '0', vatRate: '' }])} className="inline-flex items-center gap-2 rounded border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700">
                <Plus className="size-3.5" />
                Ligne
              </button>
            </div>
            <div className="hidden grid-cols-[1fr_1.3fr_70px_100px_70px_90px_36px] gap-2 border-b border-slate-100 px-4 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400 md:grid">
              <span>Article</span>
              <span>Description</span>
              <span className="text-right">Qte</span>
              <span className="text-right">PU</span>
              <span className="text-right">TVA %</span>
              <span className="text-right">Total</span>
              <span />
            </div>
            <div className="space-y-3 p-4">
              {lines.map((line, index) => (
                <div key={index} className="grid gap-2 rounded border border-slate-100 p-3 md:grid-cols-[1fr_1.3fr_70px_100px_70px_90px_36px]">
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
                  <label>
                    <span className="field-label md:hidden">TVA %</span>
                    <input value={line.vatRate} onChange={(event) => setLines((current) => current.map((candidate, lineIndex) => lineIndex === index ? { ...candidate, vatRate: event.target.value } : candidate))} type="number" min="0" max="100" placeholder="defaut" className="field-input text-right" title="Laisse vide pour appliquer la TVA par defaut de la facture" />
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
          <AmountRow label="Total HT" value={totals.subtotal} />
          <AmountRow label="Remise" value={-totals.discount} />
          {totals.vatGroups.length > 1 ? (
            totals.vatGroups.map((group) => <AmountRow key={group.rate} label={`TVA ${group.rate}%`} value={group.tax} />)
          ) : (
            <AmountRow label={totals.vatGroups.length === 1 ? `TVA ${totals.vatGroups[0].rate}%` : 'TVA'} value={totals.taxTotal} />
          )}
          <div className="mt-4 border-t border-slate-200 pt-4">
            <AmountRow label="Total TTC" value={totals.total} strong />
          </div>
          {error ? <p className="mt-4 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</p> : null}
          <div className="mt-5 grid gap-2">
            <button type="submit" disabled={isSubmitting} className="inline-flex items-center justify-center gap-2 rounded bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">
              <Save className="size-4" />
              {isSubmitting ? 'Enregistrement...' : 'Enregistrer'}
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

function PaymentModal({
  invoice,
  accounts,
  onClose,
  onSubmit,
}: {
  invoice: any
  accounts: any[]
  onClose: () => void
  onSubmit: (payload: { accountId?: string; amount: number; method?: string }) => Promise<void>
}) {
  const { formatMoney } = useMoney()
  const remaining = remainingOf(invoice)
  const [amount, setAmount] = React.useState(String(remaining))
  const [accountId, setAccountId] = React.useState(accounts[0]?.id ?? '')
  const [method, setMethod] = React.useState('Cash')
  const [error, setError] = React.useState('')
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = Math.round(getNumber(amount))
    if (parsed <= 0) {
      setError('Le montant doit etre positif.')
      return
    }
    if (parsed > remaining) {
      setError(`Le paiement depasse le reste a payer (${formatMoney(remaining)}).`)
      return
    }
    if (isSubmitting) return
    setError('')
    setIsSubmitting(true)
    try {
      await onSubmit({ accountId: accountId || undefined, amount: parsed, method })
    } catch (submitError: any) {
      setError(submitError?.message || 'Impossible d\'enregistrer le paiement.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal title={`Encaisser la facture ${invoice.number}`} onClose={onClose}>
      <form onSubmit={(event) => { void handleSubmit(event) }} className="space-y-4">
        <div className="rounded border border-slate-200 bg-slate-50 p-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-slate-600">Total TTC</span>
            <span className="font-bold text-slate-950">{formatMoney(invoice.totalCents)}</span>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-slate-600">Deja encaisse</span>
            <span className="font-bold text-slate-950">{formatMoney(invoice.paidCents)}</span>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-slate-600">Reste a payer</span>
            <span className="font-black text-rose-700">{formatMoney(remaining)}</span>
          </div>
        </div>
        <TextField label="Montant encaisse" value={amount} onChange={setAmount} type="number" min="1" required />
        <label className="block">
          <span className="field-label">Compte credite</span>
          <select value={accountId} onChange={(event) => setAccountId(event.target.value)} className="field-input">
            {accounts.length === 0 ? <option value="">Caisse boutique (creee automatiquement)</option> : null}
            {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="field-label">Mode de paiement</span>
          <select value={method} onChange={(event) => setMethod(event.target.value)} className="field-input">
            <option value="Cash">Especes</option>
            <option value="Mobile">Mobile money</option>
            <option value="Card">Carte</option>
            <option value="Transfer">Virement</option>
            <option value="Check">Cheque</option>
          </select>
        </label>
        {error ? <p className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</p> : null}
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <button type="button" onClick={onClose} className="inline-flex items-center gap-2 rounded border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">
            <X className="size-4" />
            Annuler
          </button>
          <button type="submit" disabled={isSubmitting} className="inline-flex items-center gap-2 rounded bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">
            <Send className="size-4" />
            {isSubmitting ? 'Enregistrement...' : 'Encaisser'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function Modal({ title, children, onClose, size = 'normal' }: { title: string; children: React.ReactNode; onClose: () => void; size?: 'normal' | 'wide' }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/40 px-3 py-6 sm:px-4 sm:py-8" role="dialog" aria-modal="true">
      <div className={`w-full rounded border border-slate-200 bg-white shadow-xl ${size === 'wide' ? 'max-w-5xl' : 'max-w-2xl'}`}>
        <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-4 py-4 sm:px-5">
          <h2 className="text-lg font-bold text-slate-950">{title}</h2>
          <button type="button" onClick={onClose} className="inline-flex size-9 items-center justify-center rounded border border-slate-200 text-slate-500 hover:bg-slate-50" aria-label="Fermer">
            <X className="size-4" />
          </button>
        </div>
        <div className="p-4 sm:p-5">{children}</div>
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
      {/* Pas de truncate : un montant coupe est un montant faux a l'ecran. */}
      <p className="break-words text-xl font-bold text-slate-950 sm:text-2xl">{value}</p>
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
  const { formatMoney } = useMoney()
  return (
    <div className={`flex items-center justify-between gap-3 ${strong ? 'text-lg font-black text-slate-950' : 'text-sm text-slate-600'}`}>
      <span>{label}</span>
      <span className="font-bold">{formatMoney(value)}</span>
    </div>
  )
}

// Taux de TVA propose quand on choisit un article : celui de l'article s'il en
// a un, sinon vide (= taux par defaut de la facture).
function itemVatRate(item: any): string {
  return item?.vatRate === null || item?.vatRate === undefined ? '' : String(item.vatRate)
}

function formatDate(value: string | Date) {
  return new Date(value).toLocaleDateString('fr-FR')
}

function getNumber(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function defaultDueDate() {
  const date = new Date()
  date.setDate(date.getDate() + 30)
  return date.toISOString().slice(0, 10)
}
