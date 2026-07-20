import { createFileRoute, useRouter } from '@tanstack/react-router'
import { Building2, Trash2 } from 'lucide-react'
import * as React from 'react'
import { deletePlatformCompany, listPlatformCompanies } from '~/server/platformAdmin'
import { AdminBadge, AdminCard, AdminEmpty, AdminPageHeader, AdminTable, formatDate } from '~/components/AdminUI'

export const Route = createFileRoute('/admin/companies')({
  loader: async () => listPlatformCompanies(),
  component: CompaniesPage,
})

type CompanyRow = Awaited<ReturnType<typeof listPlatformCompanies>>['companies'][number]

function CompaniesPage() {
  const data = Route.useLoaderData()
  const router = useRouter()
  const [target, setTarget] = React.useState<CompanyRow | null>(null)
  const [message, setMessage] = React.useState<string | null>(null)

  if (!data.ok) return <AdminEmpty>Donnees indisponibles.</AdminEmpty>

  return (
    <div>
      <AdminPageHeader
        title="Entreprises"
        description={`${data.companies.length} tenant(s) sur la plateforme, tous espaces confondus.`}
        icon={Building2}
      />

      {message ? (
        <div className="mb-4 rounded border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700">
          {message}
        </div>
      ) : null}

      <AdminCard>
        {data.companies.length === 0 ? (
          <AdminEmpty>Aucune entreprise.</AdminEmpty>
        ) : (
          <AdminTable
            head={
              <>
                <th className="px-4 py-2.5">Entreprise</th>
                <th className="px-4 py-2.5">Proprietaire</th>
                <th className="px-4 py-2.5">Membres</th>
                <th className="px-4 py-2.5">Factures</th>
                <th className="px-4 py-2.5">Clients</th>
                <th className="px-4 py-2.5">Creee</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </>
            }
          >
            {data.companies.map((company) => (
              <tr key={company.id} className="list-row">
                <td className="px-4 py-3">
                  <span className="block font-semibold text-slate-950">{company.name}</span>
                  <span className="block text-xs text-slate-400">
                    /{company.slug}
                    {company.currency ? ` · ${company.currency}` : ''}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {company.ownerEmail ? (
                    <>
                      <span className="block text-slate-700">{company.ownerName}</span>
                      <span className="block text-xs text-slate-400">{company.ownerEmail}</span>
                    </>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="px-4 py-3"><AdminBadge>{company.members}</AdminBadge></td>
                <td className="px-4 py-3 text-slate-700">{company.invoices}</td>
                <td className="px-4 py-3 text-slate-700">{company.customers}</td>
                <td className="px-4 py-3 text-xs text-slate-400">{formatDate(company.createdAt)}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => { setTarget(company); setMessage(null) }}
                    className="inline-flex items-center gap-1.5 rounded border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100"
                  >
                    <Trash2 className="size-3.5" />
                    Supprimer
                  </button>
                </td>
              </tr>
            ))}
          </AdminTable>
        )}
      </AdminCard>

      {target ? (
        <DeleteCompanyModal
          company={target}
          onClose={() => setTarget(null)}
          onDeleted={async (slug) => {
            setTarget(null)
            setMessage(`Entreprise « ${slug} » supprimee.`)
            await router.invalidate()
          }}
        />
      ) : null}
    </div>
  )
}

function DeleteCompanyModal({
  company,
  onClose,
  onDeleted,
}: {
  company: CompanyRow
  onClose: () => void
  onDeleted: (slug: string) => void
}) {
  const [confirm, setConfirm] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)
  const matches = confirm.trim() === company.slug

  async function handleDelete() {
    if (!matches) return
    setSubmitting(true)
    setError(null)
    const result = await deletePlatformCompany({ data: { companyId: company.id, confirmSlug: confirm.trim() } })
    setSubmitting(false)
    if (result.ok) onDeleted(result.deleted)
    else setError(result.message)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded bg-red-50 text-red-600">
            <Trash2 className="size-4" />
          </span>
          <h2 className="text-base font-bold text-slate-950">Supprimer cette entreprise ?</h2>
        </div>
        <p className="mt-3 text-sm text-slate-600">
          Cette action est <strong className="text-red-600">irreversible</strong>. Toutes les donnees de
          {' '}<strong>{company.name}</strong> (factures, clients, stock, utilisateurs lies, roles…) seront
          definitivement supprimees.
        </p>
        <label className="mt-4 block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">
            Tapez le slug « {company.slug} » pour confirmer
          </span>
          <input
            type="text"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            placeholder={company.slug}
            autoFocus
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-red-500"
          />
        </label>
        {error ? <p className="mt-2 text-xs font-semibold text-red-600">{error}</p> : null}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Annuler
          </button>
          <button
            type="button"
            disabled={!matches || submitting}
            onClick={handleDelete}
            className="rounded bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {submitting ? 'Suppression…' : 'Supprimer definitivement'}
          </button>
        </div>
      </div>
    </div>
  )
}
