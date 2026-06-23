import { createFileRoute, useRouter } from '@tanstack/react-router'
import { Check, Mail, Plus, Search, X } from 'lucide-react'
import { useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from 'react'
import { getCrmData } from '~/server/dataFetchers'
import { createCrmLead } from '~/server/operations'

export const Route = createFileRoute('/$companySlug/crm/leads')({
  loader: async ({ params }) => getCrmData({ data: { companySlug: params.companySlug } }),
  component: CrmLeads,
})

function CrmLeads() {
  const { companySlug } = Route.useParams()
  const router = useRouter()
  const data = Route.useLoaderData()
  const [leads, setLeads] = useState<any[]>(data.leads)
  const [query, setQuery] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [form, setForm] = useState({ name: '', company: '', email: '', phone: '', source: 'POS' })
  const visibleLeads = leads.filter((lead) => `${lead.name} ${lead.company ?? ''} ${lead.email ?? ''}`.toLowerCase().includes(query.toLowerCase()))

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
    setMessage(`${result.lead.name} ajoute au CRM et disponible comme client.`)
    await router.invalidate()
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-950 dark:text-white">Nouveaux clients</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Creation CRM synchronisee avec les clients utilisables en caisse.</p>
        </div>
        <button onClick={() => setIsModalOpen(true)} className="inline-flex items-center gap-2 rounded bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-cyan-400 dark:text-slate-950 dark:hover:bg-cyan-300">
          <Plus className="size-4" />
          Ajouter
        </button>
      </div>

      {message ? <div className="mb-6 rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200">{message}</div> : null}

      <div className="neon-surface mb-6 rounded p-3">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            type="text"
            placeholder="Rechercher un client..."
            className="w-full rounded border border-slate-300 bg-white py-2 pl-9 pr-4 text-sm outline-none focus:border-slate-950 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:border-cyan-400"
          />
        </div>
      </div>

      <div className="neon-surface overflow-hidden rounded">
        <div className="overflow-x-auto">
          <table className="w-full whitespace-nowrap text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
              <tr>
                <th className="px-4 py-3 font-semibold">Contact</th>
                <th className="px-4 py-3 font-semibold">Entreprise</th>
                <th className="px-4 py-3 font-semibold">Statut</th>
                <th className="px-4 py-3 text-right font-semibold">Contact</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {visibleLeads.map((lead) => (
                <tr key={lead.id} className="list-row">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex size-8 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-200">
                        {lead.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-white">{lead.name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{lead.email ?? '-'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{lead.company ?? '-'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${getLeadStatusClass(lead.status)}`}>
                      {getLeadStatusLabel(lead.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button className="inline-flex items-center gap-2 rounded border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-900">
                      <Mail className="size-4" />
                      Email
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen ? (
        <Modal title="Ajouter un client" onClose={() => setIsModalOpen(false)}>
          <form onSubmit={addLead} className="space-y-4">
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
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/40 px-4 py-8 sm:items-center" role="dialog" aria-modal="true">
      <div className="neon-surface w-full max-w-xl rounded shadow-xl">
        <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <h2 className="text-lg font-bold text-slate-950 dark:text-white">{title}</h2>
          <button type="button" onClick={onClose} className="inline-flex size-9 items-center justify-center rounded border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-800 dark:hover:bg-slate-900 dark:hover:text-white" aria-label="Fermer">
            <X className="size-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
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
  if (status === 'New') return 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200'
  if (status === 'Contacted') return 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100'
  if (status === 'Qualified') return 'bg-slate-950 text-white dark:bg-cyan-400 dark:text-slate-950'
  return 'bg-slate-50 text-slate-500 dark:bg-slate-900 dark:text-slate-400'
}
