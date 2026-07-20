import { createFileRoute } from '@tanstack/react-router'
import {
  Activity,
  Building2,
  CheckCircle2,
  CircleDollarSign,
  Database,
  FileText,
  Gauge,
  Mail,
  Users,
} from 'lucide-react'
import { getPlatformOverview } from '~/server/platformAdmin'
import { StatCard } from '~/components/StatCard'
import { AdminCard, AdminEmpty, AdminPageHeader, formatDate } from '~/components/AdminUI'
import { formatMoney } from '~/utils/currency'

export const Route = createFileRoute('/admin/')({
  loader: async () => getPlatformOverview(),
  component: OverviewPage,
})

function OverviewPage() {
  const data = Route.useLoaderData()
  if (!data.ok) return <AdminEmpty>Donnees indisponibles.</AdminEmpty>

  const { stats, health, recentCompanies, recentUsers } = data

  return (
    <div>
      <AdminPageHeader
        title="Vue globale"
        description="Sante du systeme et chiffres cles a travers toutes les entreprises."
        icon={Gauge}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard icon={Building2} title="Entreprises" value={String(stats.companies)} detail={`${stats.workspaces} espaces`} />
        <StatCard icon={Users} title="Utilisateurs" value={String(stats.users)} detail={`${stats.verifiedUsers} verifies`} />
        <StatCard icon={CheckCircle2} title="Sessions actives" value={String(stats.activeSessions)} detail={`${stats.activeMemberships} adhesions`} />
        <StatCard icon={Activity} title="Connexions 24h" value={String(stats.logins24h)} detail={`${stats.failedLogins24h} echecs`} alert={stats.failedLogins24h > 0} />
        <StatCard icon={FileText} title="Factures" value={String(stats.invoicesCount)} detail={`${stats.quotesCount} devis`} />
        <StatCard icon={Users} title="Clients" value={String(stats.customersCount)} detail="Tous tenants" />
        <StatCard icon={CircleDollarSign} title="Facture (cumul)" value={formatMoney(stats.invoicedCents)} detail="Tous tenants" />
        <StatCard icon={CircleDollarSign} title="Encaisse (cumul)" value={formatMoney(stats.collectedCents)} detail="Tous tenants" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <AdminCard title="Sante du systeme" className="lg:col-span-1">
          <ul className="divide-y divide-slate-100 text-sm">
            <HealthRow icon={Database} label="Base de donnees" value={`${health.dbLatencyMs} ms`} ok={health.dbOnline && health.dbLatencyMs < 800} />
            <HealthRow icon={Mail} label="Envoi d'emails" value={health.mailConfigured ? 'Configure' : 'Console (dev)'} ok={health.mailConfigured} />
            <HealthRow icon={Users} label="Inscription publique" value={health.publicRegistration ? 'Ouverte' : 'Fermee'} ok={!health.publicRegistration} />
            <HealthRow icon={CheckCircle2} label="Super admins" value={String(health.superAdminCount)} ok={health.superAdminCount > 0} />
          </ul>
        </AdminCard>

        <AdminCard title="Dernieres entreprises" className="lg:col-span-1">
          {recentCompanies.length === 0 ? (
            <AdminEmpty>Aucune entreprise.</AdminEmpty>
          ) : (
            <ul className="divide-y divide-slate-100">
              {recentCompanies.map((company) => (
                <li key={company.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className="min-w-0 truncate font-semibold text-slate-950">{company.name}</span>
                  <span className="shrink-0 text-xs text-slate-400">{formatDate(company.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </AdminCard>

        <AdminCard title="Derniers utilisateurs" className="lg:col-span-1">
          {recentUsers.length === 0 ? (
            <AdminEmpty>Aucun utilisateur.</AdminEmpty>
          ) : (
            <ul className="divide-y divide-slate-100">
              {recentUsers.map((user) => (
                <li key={user.id} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-slate-950">{user.name}</span>
                    <span className="block truncate text-xs text-slate-400">{user.email}</span>
                  </span>
                  <span className={`shrink-0 text-xs font-semibold ${user.verified ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {user.verified ? 'Verifie' : 'En attente'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </AdminCard>
      </div>
    </div>
  )
}

function HealthRow({ icon: Icon, label, value, ok }: { icon: any; label: string; value: string; ok: boolean }) {
  return (
    <li className="flex items-center justify-between px-4 py-3">
      <span className="flex items-center gap-2.5 text-slate-600">
        <Icon className="size-4 text-slate-400" />
        {label}
      </span>
      <span className="flex items-center gap-2">
        <span className="text-sm font-semibold text-slate-950">{value}</span>
        <span className={`size-2 rounded-full ${ok ? 'bg-emerald-500' : 'bg-amber-500'}`} />
      </span>
    </li>
  )
}
