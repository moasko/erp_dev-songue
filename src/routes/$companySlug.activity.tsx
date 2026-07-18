import { createFileRoute } from '@tanstack/react-router'
import { History, Search } from 'lucide-react'
import * as React from 'react'
import { getAuditData } from '~/server/dataFetchers'
import { DateRangeFilter, matchesDatePreset, todayInputValue, type DatePreset } from '~/components/DateRangeFilter'

export const Route = createFileRoute('/$companySlug/activity')({
  loader: async ({ params }) => getAuditData({ data: { companySlug: params.companySlug } }),
  component: ActivityPage,
})

// Libelles lisibles des actions tracees. Une action inconnue affiche sa cle
// brute : mieux vaut un libelle technique qu'une ligne d'audit muette.
const actionLabels: Record<string, string> = {
  'quote.created': 'Devis cree',
  'quote.status_updated': 'Statut de devis modifie',
  'quote.emailed': 'Devis envoye par email',
  'invoice.created': 'Facture creee',
  'invoice.created_from_quote': 'Devis converti en facture',
  'invoice.status_updated': 'Statut de facture modifie',
  'invoice.payment_recorded': 'Paiement encaisse',
  'invoice.emailed': 'Facture envoyee par email',
  'invoice.reminder_sent': 'Relance envoyee',
  'catalog.created': 'Article cree',
  'catalog.status_updated': 'Statut d\'article modifie',
  'catalog.restocked': 'Article reapprovisionne',
}

const entityLabels: Record<string, string> = {
  Quote: 'Devis',
  SalesInvoice: 'Facture',
  CatalogItem: 'Article',
}

function ActivityPage() {
  const { logs } = Route.useLoaderData()
  const [searchTerm, setSearchTerm] = React.useState('')
  const [datePreset, setDatePreset] = React.useState<DatePreset>('all')
  const [startDate, setStartDate] = React.useState(todayInputValue())
  const [endDate, setEndDate] = React.useState(todayInputValue())

  const filteredLogs = React.useMemo(() => {
    const query = searchTerm.trim().toLowerCase()
    return logs.filter((log: any) => {
      if (!matchesDatePreset(log.createdAt, datePreset, startDate, endDate)) return false
      if (!query) return true
      const searchable = [
        actionLabels[log.action] ?? log.action,
        entityLabels[log.entity] ?? log.entity,
        log.actor?.name,
        log.actor?.email,
        log.metadata,
      ].filter(Boolean).join(' ').toLowerCase()
      return searchable.includes(query)
    })
  }, [logs, searchTerm, datePreset, startDate, endDate])

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Administration</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-950">Journal d'activite</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          Qui a fait quoi : creations, changements de statut, encaissements et envois. Les 300 dernieres actions sont conservees a l'ecran.
        </p>
      </div>

      <section className="overflow-hidden rounded border border-slate-200 bg-white">
        <div className="space-y-3 border-b border-slate-100 p-4">
          <label className="relative block max-w-md">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Rechercher une action, un utilisateur, une reference..."
              className="field-input pl-9"
            />
          </label>
          <DateRangeFilter
            preset={datePreset}
            startDate={startDate}
            endDate={endDate}
            onPresetChange={setDatePreset}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
          />
        </div>

        {filteredLogs.length ? (
          <div className="divide-y divide-slate-100">
            {filteredLogs.map((log: any) => (
              <div key={log.id} className="flex items-start justify-between gap-4 px-5 py-3.5">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded bg-slate-100 text-slate-500">
                    <History className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-950">
                      {actionLabels[log.action] ?? log.action}
                      <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                        {entityLabels[log.entity] ?? log.entity}
                      </span>
                    </p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {log.actor ? `${log.actor.name} (${log.actor.email})` : 'Systeme'}
                      {log.metadata ? ` — ${metadataSummary(log.metadata)}` : ''}
                    </p>
                  </div>
                </div>
                <p className="shrink-0 text-xs font-semibold text-slate-400">{formatDateTime(log.createdAt)}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="px-5 py-10 text-center text-sm text-slate-500">
            {logs.length ? 'Aucune action ne correspond a la recherche.' : 'Aucune action enregistree pour le moment.'}
          </p>
        )}
      </section>
    </main>
  )
}

// Resume compact du contexte de l'action : "reference: DEV-00012, totalCents: 45000".
function metadataSummary(raw: string): string {
  try {
    const parsed = JSON.parse(raw)
    return Object.entries(parsed)
      .map(([key, value]) => `${key}: ${String(value)}`)
      .join(', ')
  } catch {
    return raw
  }
}

function formatDateTime(value: string | Date) {
  return new Date(value).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
}
