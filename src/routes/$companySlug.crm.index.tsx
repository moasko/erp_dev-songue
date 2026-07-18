import { createFileRoute, useRouter } from '@tanstack/react-router'
import { Check, ListPlus, Mail, PhoneCall, Plus, Search, Star, Users, X } from 'lucide-react'
import { useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from 'react'
import { getCrmData } from '~/server/dataFetchers'
import { createCrmLead } from '~/server/operations'
import { DateRangeFilter, matchesDatePreset, todayInputValue, type DatePreset } from '~/components/DateRangeFilter'

export const Route = createFileRoute('/$companySlug/crm/')({
  loader: async ({ params }) => getCrmData({ data: { companySlug: params.companySlug } }),
  component: CrmPage,
})

// Page unique du CRM : compteurs compacts, recherche, ajout et liste au meme
// endroit. L'ancien parcours en deux pages (resume puis page d'ajout) obligeait
// a naviguer pour la moindre action.
function CrmPage() {
  const { companySlug } = Route.useParams()
  const router = useRouter()
  const data = Route.useLoaderData()
  const [leads, setLeads] = useState<any[]>(data.leads)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [datePreset, setDatePreset] = useState<DatePreset>('all')
  const [startDate, setStartDate] = useState(todayInputValue())
  const [endDate, setEndDate] = useState(todayInputValue())
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [form, setForm] = useState({ name: '', company: '', email: '', phone: '', source: 'POS' })

  const newCount = leads.filter((lead) => lead.status === 'New').length
  const qualifiedCount = leads.filter((lead) => lead.status === 'Qualified').length

  const visibleLeads = leads.filter((lead) => {
    const matchesStatus = statusFilter === 'All' || lead.status === statusFilter
    const matchesDate = matchesDatePreset(lead.createdAt, datePreset, startDate, endDate)
    const searchable = `${lead.name} ${lead.company ?? ''} ${lead.email ?? ''} ${lead.phone ?? ''}`.toLowerCase()
    return matchesStatus && matchesDate && searchable.includes(query.toLowerCase())
  })

  async function addLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = form.name.trim()
    if (!name) {
      setMessage('Renseigne au minimum le nom du client.')
      return
    }
    const result = await createCrmLead({ data: { companySlug, ...form, name } })
    setLeads((current) => [result.lead, ...current])
    setIsModalOpen(false)
    setForm({ name: '', company: '', email: '', phone: '', source: 'POS' })
    setMessage(`${result.lead.name} ajoute et disponible comme client en caisse et sur les devis.`)
    await router.invalidate()
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-950 dark:text-white">Clients</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Contacts utilisables en caisse, sur les devis et les factures.</p>
        </div>
        <button onClick={() => setIsModalOpen(true)} className="inline-flex items-center justify-center gap-2 rounded bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-cyan-400 dark:text-slate-950 dark:hover:bg-cyan-300">
          <Plus className="size-4" />
          Ajouter un client
        </button>
      </div>

      {message ? <div className="mb-5 rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200">{message}</div> : null}

      {/* Compteurs compacts : une bande discrete, la place est pour la liste. */}
      <div className="neon-surface mb-5 grid grid-cols-3 divide-x divide-slate-100 rounded dark:divide-slate-800">
        <CompactStat icon={Users} value={leads.length} label="Contacts" />
        <CompactStat icon={ListPlus} value={newCount} label="A contacter" highlight={newCount > 0} />
        <CompactStat icon={Star} value={qualifiedCount} label="Qualifies" />
      </div>

      <section className="neon-surface overflow-hidden rounded">
        <div className="space-y-3 border-b border-slate-100 p-4 dark:border-slate-800">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_170px]">
            <label className="relative block">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                type="text"
                placeholder="Rechercher nom, entreprise, email, telephone..."
                className="w-full rounded border border-slate-300 bg-white py-2 pl-9 pr-4 text-sm outline-none focus:border-slate-950 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:border-cyan-400"
              />
            </label>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-slate-950 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            >
              <option value="All">Tous les statuts</option>
              <option value="New">Nouveau</option>
              <option value="Contacted">Contacte</option>
              <option value="Qualified">Qualifie</option>
              <option value="Lost">Perdu</option>
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

        {visibleLeads.length ? (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {visibleLeads.map((lead) => (
              <div key={lead.id} className="list-row flex flex-col gap-2.5 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-200">
                    {lead.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-bold text-slate-950 dark:text-white">{lead.name}</p>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">{lead.company ?? lead.source ?? 'Client'}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  {/* Appel et email en un clic : c'est l'action principale d'un CRM. */}
                  {lead.phone ? (
                    <a href={`tel:${lead.phone.replace(/\s+/g, '')}`} className="inline-flex items-center gap-1.5 rounded border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-900">
                      <PhoneCall className="size-3.5" />
                      {lead.phone}
                    </a>
                  ) : null}
                  {lead.email ? (
                    <a href={`mailto:${lead.email}`} className="inline-flex items-center gap-1.5 rounded border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-900">
                      <Mail className="size-3.5" />
                      <span className="hidden sm:inline">{lead.email}</span>
                      <span className="sm:hidden">Email</span>
                    </a>
                  ) : null}
                  <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${getLeadStatusClass(lead.status)}`}>
                    {getLeadStatusLabel(lead.status)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-5 py-12 text-center">
            <Users className="mx-auto mb-3 size-10 text-slate-300" />
            <p className="font-semibold text-slate-800 dark:text-slate-200">
              {leads.length ? 'Aucun client ne correspond a la recherche.' : 'Aucun client enregistre.'}
            </p>
            {leads.length ? (
              <button onClick={() => { setQuery(''); setStatusFilter('All') }} className="mt-3 rounded border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200">
                Reinitialiser la recherche
              </button>
            ) : (
              <button onClick={() => setIsModalOpen(true)} className="mt-3 inline-flex items-center gap-2 rounded bg-slate-950 px-4 py-2 text-sm font-semibold text-white dark:bg-cyan-400 dark:text-slate-950">
                <Plus className="size-4" />
                Ajouter le premier client
              </button>
            )}
          </div>
        )}
      </section>

      {isModalOpen ? (
        <Modal title="Ajouter un client" onClose={() => setIsModalOpen(false)}>
          <form onSubmit={(event) => { void addLead(event) }} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="Nom" value={form.name} onChange={(value) => setForm((current) => ({ ...current, name: value }))} required />
              <TextField label="Entreprise" value={form.company} onChange={(value) => setForm((current) => ({ ...current, company: value }))} />
              <TextField label="Email" value={form.email} onChange={(value) => setForm((current) => ({ ...current, email: value }))} type="email" />
              <TextField label="Telephone" value={form.phone} onChange={(value) => setForm((current) => ({ ...current, phone: value }))} />
            </div>
            <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end dark:border-slate-800">
              <button type="button" onClick={() => setIsModalOpen(false)} className="inline-flex items-center justify-center gap-2 rounded border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900">
                <X className="size-4" />
                Annuler
              </button>
              <button type="submit" className="inline-flex items-center justify-center gap-2 rounded bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 dark:bg-cyan-400 dark:text-slate-950 dark:hover:bg-cyan-300">
                <Check className="size-4" />
                Enregistrer
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </main>
  )
}

function CompactStat({ icon: Icon, value, label, highlight = false }: { icon: any; value: number; label: string; highlight?: boolean }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Icon className={`size-4 shrink-0 ${highlight ? 'text-amber-500' : 'text-slate-400'}`} />
      <div className="min-w-0">
        <p className="text-lg font-bold leading-tight text-slate-950 dark:text-white">{value}</p>
        <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      </div>
    </div>
  )
}

function TextField({ label, value, onChange, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-400">{label}</span>
      <input {...props} value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-slate-950 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:border-cyan-400" />
    </label>
  )
}

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/40 px-3 py-6 sm:items-center sm:px-4 sm:py-8" role="dialog" aria-modal="true">
      <div className="neon-surface w-full max-w-xl rounded shadow-xl">
        <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-4 py-4 sm:px-5 dark:border-slate-800">
          <h2 className="text-lg font-bold text-slate-950 dark:text-white">{title}</h2>
          <button type="button" onClick={onClose} className="inline-flex size-9 items-center justify-center rounded border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-800 dark:hover:bg-slate-900 dark:hover:text-white" aria-label="Fermer">
            <X className="size-4" />
          </button>
        </div>
        <div className="p-4 sm:p-5">{children}</div>
      </div>
    </div>
  )
}

function getLeadStatusLabel(status: string) {
  if (status === 'New') return 'Nouveau'
  if (status === 'Contacted') return 'Contacte'
  if (status === 'Qualified') return 'Qualifie'
  return 'Perdu'
}

function getLeadStatusClass(status: string) {
  if (status === 'New') return 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300'
  if (status === 'Contacted') return 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300'
  if (status === 'Qualified') return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
  return 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
}
