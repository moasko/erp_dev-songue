import { createFileRoute } from '@tanstack/react-router'
import { Sliders } from 'lucide-react'
import type { ReactNode } from 'react'
import { getPlatformSettings } from '~/server/platformAdmin'
import { AdminBadge, AdminCard, AdminEmpty, AdminPageHeader } from '~/components/AdminUI'

export const Route = createFileRoute('/admin/settings')({
  loader: async () => getPlatformSettings(),
  component: SettingsPage,
})

function SettingsPage() {
  const data = Route.useLoaderData()
  if (!data.ok) return <AdminEmpty>Donnees indisponibles.</AdminEmpty>

  return (
    <div>
      <AdminPageHeader
        title="Parametres globaux"
        description="Configuration de la plateforme, runtime et super administrateurs."
        icon={Sliders}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <AdminCard title="Application">
          <dl className="divide-y divide-slate-100 text-sm">
            <Row label="Nom" value={data.app.name} />
            <Row label="Version" value={data.app.version} />
            <Row label="Node" value={data.runtime.node} />
            <Row label="React" value={data.runtime.react} />
            <Row label="Vite" value={data.runtime.vite} />
            <Row label="Prisma" value={data.runtime.prisma} />
            <Row label="TanStack Start" value={data.runtime.tanstackStart} />
          </dl>
        </AdminCard>

        <AdminCard title="Indicateurs">
          <dl className="divide-y divide-slate-100 text-sm">
            <Row
              label="Inscription publique"
              value={<AdminBadge tone={data.flags.publicRegistration ? 'warn' : 'good'}>{data.flags.publicRegistration ? 'Ouverte' : 'Fermee'}</AdminBadge>}
            />
            <Row
              label="Envoi d'emails"
              value={<AdminBadge tone={data.flags.mailConfigured ? 'good' : 'muted'}>{data.flags.mailConfigured ? 'Configure' : 'Console (dev)'}</AdminBadge>}
            />
            <Row label="URL de base" value={data.flags.appBaseUrl} />
            <Row label="Domaine racine" value={data.flags.rootDomain} />
          </dl>
        </AdminCard>

        <AdminCard title={`Super administrateurs (${data.superAdmins.length})`} className="lg:col-span-2">
          <div className="p-4">
            {data.superAdmins.length === 0 ? (
              <p className="text-sm text-amber-600">
                Aucun super admin configure. Definir la variable d'environnement <code>SUPER_ADMIN_EMAILS</code>.
              </p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {data.superAdmins.map((email) => (
                  <li key={email}>
                    <AdminBadge tone="risk">{email}</AdminBadge>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-slate-500">
              L'appartenance au groupe super admin est controlee par la variable d'environnement
              {' '}<code>SUPER_ADMIN_EMAILS</code> (emails separes par des virgules), puis redemarrage du serveur.
              Aucun secret n'est stocke dans le code ni modifiable depuis cette interface.
            </p>
          </div>
        </AdminCard>

        {data.plans.length > 0 ? (
          <AdminCard title="Plans" className="lg:col-span-2">
            <ul className="divide-y divide-slate-100 text-sm">
              {data.plans.map((plan) => (
                <li key={plan.key} className="flex items-center justify-between px-4 py-2.5">
                  <span className="font-semibold text-slate-950">{plan.name}</span>
                  <span className="text-xs text-slate-500">
                    {plan.maxCompanies} entreprises · {plan.maxUsers} utilisateurs
                  </span>
                </li>
              ))}
            </ul>
          </AdminCard>
        ) : null}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <dt className="text-slate-500">{label}</dt>
      <dd className="min-w-0 truncate text-right font-semibold text-slate-950">{value || '—'}</dd>
    </div>
  )
}
