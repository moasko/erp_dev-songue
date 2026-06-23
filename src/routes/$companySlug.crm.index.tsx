import { createFileRoute, Link } from '@tanstack/react-router'
import { ListPlus, Mail, PhoneCall, Users } from 'lucide-react'
import { getCrmData } from '~/server/dataFetchers'

export const Route = createFileRoute('/$companySlug/crm/')({
  loader: async ({ params }) => getCrmData({ data: { companySlug: params.companySlug } }),
  component: CrmDashboard,
})

function CrmDashboard() {
  const { companySlug } = Route.useParams()
  const { leads, customers } = Route.useLoaderData()
  const totalContacts = customers.length || leads.length
  const newLeads = leads.filter((lead: any) => lead.status === 'New').length
  const recentLeads = leads.slice(0, 6)

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-950 dark:text-white">Clients</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Contacts clients simples pour la caisse, les devis et les relances.</p>
        </div>
        <Link to="/$companySlug/crm/leads" params={{ companySlug }} className="inline-flex items-center justify-center gap-2 rounded bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-cyan-400 dark:text-slate-950 dark:hover:bg-cyan-300">
          <ListPlus className="size-4" />
          Ajouter client
        </Link>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard title="Clients" value={totalContacts.toString()} icon={Users} detail="Contacts enregistrés" />
        <StatCard title="Nouveaux" value={newLeads.toString()} icon={ListPlus} detail="A contacter" />
        <StatCard title="Relances" value={recentLeads.length.toString()} icon={PhoneCall} detail="Suivi simple" />
      </div>

      <section className="neon-surface rounded">
        <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <h2 className="font-bold text-slate-950 dark:text-white">Derniers clients</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Les contacts les plus recents.</p>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {recentLeads.length > 0 ? recentLeads.map((lead: any) => (
            <div key={lead.id} className="list-row flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-bold text-slate-950 dark:text-white">{lead.name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{lead.company ?? lead.source ?? 'Client'}</p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                {lead.phone ? <span className="inline-flex items-center gap-1"><PhoneCall className="size-3.5" /> {lead.phone}</span> : null}
                {lead.email ? <span className="inline-flex items-center gap-1"><Mail className="size-3.5" /> {lead.email}</span> : null}
              </div>
            </div>
          )) : (
            <div className="px-5 py-10 text-center text-sm font-semibold text-slate-500 dark:text-slate-400">Aucun client enregistre.</div>
          )}
        </div>
      </section>
    </main>
  )
}

function StatCard({ title, value, icon: Icon, detail }: { title: string; value: string; icon: any; detail: string }) {
  return (
    <div className="neon-surface rounded p-5">
      <div className="mb-4 flex items-start justify-between">
        <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400">{title}</h3>
        <div className="rounded bg-slate-50 p-2 text-slate-400 dark:bg-slate-900">
          <Icon className="size-4" />
        </div>
      </div>
      <span className="text-2xl font-bold text-slate-950 dark:text-white">{value}</span>
      <div className="mt-3 text-xs font-medium text-slate-500 dark:text-slate-400">{detail}</div>
    </div>
  )
}
