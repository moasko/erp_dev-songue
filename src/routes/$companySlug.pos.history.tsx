import { createFileRoute } from '@tanstack/react-router'
import { Clock, Eye, Pencil, Printer, ReceiptText, Save, Search, X } from 'lucide-react'
import { useState } from 'react'
import { DateRangeFilter, matchesDatePreset, todayInputValue, type DatePreset } from '~/components/DateRangeFilter'
import { useCompany, useMoney } from '~/context/CompanyContext'
import { getPosData } from '~/server/dataFetchers'
import { updatePosTicket } from '~/server/operations'

export const Route = createFileRoute('/$companySlug/pos/history')({
  loader: async ({ params }) => getPosData({ data: { companySlug: params.companySlug } }),
  component: PosHistory,
})

function PosHistory() {
  const { formatMoney } = useMoney()
  const data = Route.useLoaderData()
  const { companySlug } = Route.useParams()
  const [tickets, setTickets] = useState<any[]>(data.tickets)
  const { activeCompany } = useCompany()
  const [query, setQuery] = useState('')
  const [datePreset, setDatePreset] = useState<DatePreset>('today')
  const [startDate, setStartDate] = useState(todayInputValue())
  const [endDate, setEndDate] = useState(todayInputValue())
  const [selectedTicket, setSelectedTicket] = useState<any | null>(null)
  const [editing, setEditing] = useState(false)
  const [editLines, setEditLines] = useState<Array<{ lineId: string; quantity: number }>>([])
  const [editPayment, setEditPayment] = useState<'cash' | 'mobile' | 'card'>('cash')
  const [editCustomer, setEditCustomer] = useState('')
  const periodTickets = tickets.filter((ticket: any) => matchesDatePreset(ticket.date, datePreset, startDate, endDate))
  const visibleTickets = periodTickets.filter((ticket: any) => `${ticket.reference} ${ticket.description}`.toLowerCase().includes(query.toLowerCase()))
  const paidTickets = periodTickets.filter((ticket: any) => ticket.status === 'Completed')
  const issueTickets = periodTickets.filter((ticket: any) => ticket.status !== 'Completed')
  const total = paidTickets.reduce((sum: number, ticket: any) => sum + ticket.amount, 0)

  function printTicket(ticket = selectedTicket) {
    if (!ticket || typeof window === 'undefined') return
    setSelectedTicket(ticket)
    window.setTimeout(() => window.print(), 250)
  }

  function startEditing() {
    if (!selectedTicket) return
    setEditLines(selectedTicket.lines.map((line: any) => ({ lineId: line.id, quantity: line.quantity })))
    setEditPayment(selectedTicket.paymentMethod)
    setEditCustomer(selectedTicket.customerId ?? '')
    setEditing(true)
  }

  async function saveCorrection() {
    if (!selectedTicket) return
    const updated = await updatePosTicket({ data: { companySlug, ticketId: selectedTicket.id, customerId: editCustomer || undefined, paymentMethod: editPayment, lines: editLines } })
    const display = { ...updated, date: updated.createdAt, amount: updated.totalCents, description: updated.customer?.name ?? 'Client comptoir', account: updated.transaction?.account ?? null }
    setTickets((current) => current.map((ticket) => ticket.id === display.id ? display : ticket))
    setSelectedTicket(display); setEditing(false)
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-cyan-500">Caisse</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-950 dark:text-white">Tickets</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Un historique lisible pour retrouver un ticket, verifier un statut ou preparer un retour.</p>
        </div>
        <div className="neon-surface grid grid-cols-3 rounded text-center">
          <TicketStat label="Tickets" value={periodTickets.length.toString()} />
          <TicketStat label="Valides" value={paidTickets.length.toString()} />
          <TicketStat label="Total" value={formatMoney(total)} />
        </div>
      </div>

      <div className="mb-5 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-start">
        <div className="neon-surface rounded p-3">
          <label className="relative block">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher un ticket ou un client"
              className="h-11 w-full rounded border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm font-semibold text-slate-950 outline-none focus:border-slate-950 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:border-cyan-400"
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

      {visibleTickets.length > 0 ? (
        <section className="neon-surface overflow-hidden rounded">
          <div className="hidden grid-cols-[1.2fr_1fr_.8fr_.8fr_auto] gap-4 border-b border-slate-200 px-5 py-3 text-xs font-bold uppercase tracking-wide text-slate-400 dark:border-slate-800 lg:grid">
            <span>Ticket</span>
            <span>Client</span>
            <span>Statut</span>
            <span className="text-right">Total</span>
            <span className="text-right">Action</span>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {visibleTickets.map((ticket) => (
              <article key={ticket.id} className="list-row grid gap-3 px-5 py-4 lg:grid-cols-[1.2fr_1fr_.8fr_.8fr_auto] lg:items-center">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-bold text-slate-950 dark:text-white">
                    <ReceiptText className="size-4 text-slate-400" />
                    {ticket.reference}
                  </div>
                  <div className="mt-1 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                    <Clock className="size-3" />
                    {new Date(ticket.date).toLocaleString('fr-FR')}
                  </div>
                </div>
                <div className="truncate text-sm font-semibold text-slate-700 dark:text-slate-200">{ticket.description}</div>
                <div>
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${ticketStatusClass(ticket.status)}`}>{ticketStatus(ticket.status)}</span>
                </div>
                <div className="font-bold text-slate-950 dark:text-white lg:text-right">{formatMoney(ticket.amount)}</div>
                <div className="flex justify-start gap-2 lg:justify-end">
                  <button
                    type="button"
                    onClick={() => setSelectedTicket(ticket)}
                    className="inline-flex size-9 items-center justify-center rounded border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-950 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-white"
                    aria-label={`Voir le ticket ${ticket.reference}`}
                    title="Voir le ticket"
                  >
                    <Eye className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => printTicket(ticket)}
                    className="inline-flex size-9 items-center justify-center rounded border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-950 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-white"
                    aria-label={`Imprimer le ticket ${ticket.reference}`}
                    title="Imprimer"
                  >
                    <Printer className="size-4" />
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : (
        <section className="neon-surface rounded p-10 text-center">
          <ReceiptText className="mx-auto size-10 text-slate-300 dark:text-slate-700" />
          <h2 className="mt-3 text-base font-bold text-slate-950 dark:text-white">{tickets.length === 0 ? 'Aucun ticket pour le moment' : 'Aucun resultat'}</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{tickets.length === 0 ? 'Les ventes encaissees apparaitront ici.' : 'Modifie la recherche ou la periode pour retrouver un ticket.'}</p>
        </section>
      )}

      {issueTickets.length > 0 ? (
        <p className="mt-4 text-xs font-semibold text-slate-500 dark:text-slate-400">{issueTickets.length} ticket(s) avec annulation, remboursement ou avoir.</p>
      ) : null}

      {selectedTicket ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 px-3 py-6 sm:items-center sm:px-4 sm:py-8">
          <div className="w-full max-w-md rounded border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-950">
            <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
              <h2 className="text-lg font-bold text-slate-950 dark:text-white">Ticket de caisse</h2>
              <button
                type="button"
                onClick={() => setSelectedTicket(null)}
                className="inline-flex size-9 items-center justify-center rounded border border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900"
                aria-label="Fermer"
                title="Fermer"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="p-5">
              <div className="ticket-print-area rounded border border-slate-200 bg-white p-5 text-slate-950">
                <div className="border-b border-dashed border-slate-300 pb-4 text-center">
                  <p className="text-base font-bold">{activeCompany.name}</p>
                  <p className="mt-1 text-xs text-slate-500">Ticket / facture caisse</p>
                </div>
                <div className="space-y-2 border-b border-dashed border-slate-300 py-4 text-sm">
                  <TicketInfo label="Reference" value={selectedTicket.reference ?? '-'} />
                  <TicketInfo label="Date" value={new Date(selectedTicket.date).toLocaleString('fr-FR')} />
                  <TicketInfo label="Libelle" value={selectedTicket.description} />
                  <TicketInfo label="Paiement" value={paymentLabel(selectedTicket.account?.name)} />
                  <TicketInfo label="Statut" value={ticketStatus(selectedTicket.status)} />
                </div>
                <div className="space-y-2 border-b border-dashed border-slate-300 py-4 text-sm">
                  {selectedTicket.lines?.map((line: any) => (
                    <div key={line.id} className="flex items-center justify-between gap-3"><span className="flex items-center gap-2">{editing ? <input type="number" min="1" value={editLines.find((item) => item.lineId === line.id)?.quantity ?? line.quantity} onChange={(event) => setEditLines((current) => current.map((item) => item.lineId === line.id ? { ...item, quantity: Math.max(1, Number(event.target.value)) } : item))} className="w-16 rounded border px-2 py-1" /> : line.quantity} × {line.name}</span><span className="font-semibold">{formatMoney(line.unitPrice * (editLines.find((item) => item.lineId === line.id)?.quantity ?? line.quantity))}</span></div>
                  ))}
                </div>
                {editing ? <div className="grid gap-2 border-b border-dashed py-4 text-sm"><select value={editCustomer} onChange={(event) => setEditCustomer(event.target.value)} className="rounded border px-3 py-2"><option value="">Client comptoir</option>{data.customers.map((customer: any) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select><select value={editPayment} onChange={(event) => setEditPayment(event.target.value as any)} className="rounded border px-3 py-2"><option value="cash">Especes</option><option value="mobile">Mobile money</option><option value="card">Carte</option></select></div> : null}
                <div className="flex items-center justify-between pt-4 text-base font-bold">
                  <span>Total</span>
                  <span>{formatMoney(selectedTicket.amount)}</span>
                </div>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                {editing ? <button type="button" onClick={() => void saveCorrection()} className="inline-flex h-10 items-center gap-2 rounded bg-emerald-600 px-4 text-sm font-bold text-white"><Save className="size-4" />Enregistrer</button> : <button type="button" onClick={startEditing} className="inline-flex h-10 items-center gap-2 rounded border border-slate-300 px-4 text-sm font-bold"><Pencil className="size-4" />Corriger</button>}
                <button type="button" onClick={() => setSelectedTicket(null)} className="inline-flex h-10 items-center justify-center rounded border border-slate-300 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900">
                  Fermer
                </button>
                <button type="button" onClick={() => printTicket()} className="inline-flex h-10 items-center justify-center gap-2 rounded bg-slate-950 px-4 text-sm font-bold text-white hover:bg-slate-800 dark:bg-cyan-500 dark:text-slate-950 dark:hover:bg-cyan-400">
                  <Printer className="size-4" />
                  Imprimer
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}

function TicketInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-semibold text-slate-950">{value}</span>
    </div>
  )
}

function paymentLabel(accountName?: string) {
  if (accountName === 'Mobile money') return 'Mobile money'
  if (accountName === 'Paiement carte') return 'Carte'
  if (accountName === 'Caisse boutique') return 'Especes'
  return accountName ?? 'Non renseigne'
}

function TicketStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</p>
      <p className="truncate text-sm font-bold text-slate-950 dark:text-white">{value}</p>
    </div>
  )
}

function ticketStatus(status: string) {
  if (status === 'Completed') return 'Paye'
  if (status === 'Pending') return 'A verifier'
  if (status === 'Failed') return 'Echec'
  return status
}

function ticketStatusClass(status: string) {
  if (status === 'Completed') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
  if (status === 'Pending') return 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
  if (status === 'Failed') return 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'
  return 'bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300'
}
