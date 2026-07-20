import { createFileRoute, useRouter } from '@tanstack/react-router'
import {
  Ban,
  Building2,
  CircleCheck,
  Eye,
  ShieldCheck,
  ShieldOff,
  Trash2,
  X,
} from 'lucide-react'
import * as React from 'react'
import {
  deletePlatformCompany,
  getPlatformCompanyDetail,
  listPlatformCompanies,
  setCompanySuspended,
  setOwnerVerified,
} from '~/server/platformAdmin'
import { AdminBadge, AdminCard, AdminEmpty, AdminPageHeader, AdminTable, formatDate, formatDateTime } from '~/components/AdminUI'

export const Route = createFileRoute('/admin/companies')({
  loader: async () => listPlatformCompanies(),
  component: CompaniesPage,
})

type CompanyRow = Awaited<ReturnType<typeof listPlatformCompanies>>['companies'][number]
type StatusFilter = 'all' | 'active' | 'suspended' | 'unverified'

const statusFilters: Array<{ key: StatusFilter; label: string }> = [
  { key: 'all', label: 'Toutes' },
  { key: 'active', label: 'Actives' },
  { key: 'suspended', label: 'Suspendues' },
  { key: 'unverified', label: 'Proprietaire non verifie' },
]

function CompaniesPage() {
  const data = Route.useLoaderData()
  const router = useRouter()
  const [deleteTarget, setDeleteTarget] = React.useState<CompanyRow | null>(null)
  const [suspendTarget, setSuspendTarget] = React.useState<CompanyRow | null>(null)
  const [detailId, setDetailId] = React.useState<string | null>(null)
  const [message, setMessage] = React.useState<string | null>(null)
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState('')
  const [filter, setFilter] = React.useState<StatusFilter>('all')

  if (!data.ok) return <AdminEmpty>Donnees indisponibles.</AdminEmpty>

  const companies = data.companies.filter((company) => {
    const query = search.trim().toLowerCase()
    if (query && !`${company.name} ${company.slug} ${company.ownerEmail ?? ''}`.toLowerCase().includes(query)) return false
    if (filter === 'active') return company.status === 'ACTIVE'
    if (filter === 'suspended') return company.status === 'SUSPENDED'
    if (filter === 'unverified') return !company.ownerVerified
    return true
  })

  const counts = {
    total: data.companies.length,
    suspended: data.companies.filter((company) => company.status === 'SUSPENDED').length,
    unverified: data.companies.filter((company) => !company.ownerVerified).length,
  }

  async function refresh() {
    await router.invalidate()
  }

  async function handleVerify(company: CompanyRow, verified: boolean) {
    if (!verified && !window.confirm(`Marquer « ${company.name} » comme NON verifiee ? Le proprietaire sera deconnecte et devra reverifier son email pour se reconnecter.`)) {
      return
    }
    setBusyId(company.id)
    const result = await setOwnerVerified({ data: { companyId: company.id, verified } })
    setBusyId(null)
    setMessage(result.ok ? `Proprietaire de « ${company.name} » ${verified ? 'verifie' : 'devalide'}.` : result.message)
    if (result.ok) await refresh()
  }

  async function handleReactivate(company: CompanyRow) {
    if (!window.confirm(`Reactiver « ${company.name} » ? Les membres retrouveront l'acces.`)) return
    setBusyId(company.id)
    const result = await setCompanySuspended({ data: { companyId: company.id, suspend: false } })
    setBusyId(null)
    setMessage(result.ok ? `« ${company.name} » reactivee (${result.affected} membre(s)).` : result.message)
    if (result.ok) await refresh()
  }

  return (
    <div>
      <AdminPageHeader
        title="Entreprises"
        description={`${counts.total} tenant(s) · ${counts.suspended} suspendue(s) · ${counts.unverified} proprietaire(s) non verifie(s).`}
        icon={Building2}
      />

      {message ? (
        <div className="mb-4 rounded border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700">
          {message}
        </div>
      ) : null}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {statusFilters.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setFilter(item.key)}
              className={`rounded border px-3 py-1.5 text-xs font-semibold transition-colors ${
                filter === item.key
                  ? 'border-slate-950 bg-slate-950 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Rechercher (nom, slug, email)…"
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-950 sm:max-w-xs"
        />
      </div>

      <AdminCard>
        {companies.length === 0 ? (
          <AdminEmpty>Aucune entreprise ne correspond.</AdminEmpty>
        ) : (
          <AdminTable
            head={
              <>
                <th className="px-4 py-2.5">Entreprise</th>
                <th className="px-4 py-2.5">Proprietaire</th>
                <th className="px-4 py-2.5">Statut</th>
                <th className="px-4 py-2.5">Membres</th>
                <th className="px-4 py-2.5">Creee</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </>
            }
          >
            {companies.map((company) => (
              <tr key={company.id} className="list-row align-top">
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
                <td className="px-4 py-3">
                  <div className="flex flex-col items-start gap-1">
                    {company.status === 'SUSPENDED' ? (
                      <AdminBadge tone="risk">Suspendue</AdminBadge>
                    ) : company.status === 'EMPTY' ? (
                      <AdminBadge tone="muted">Vide</AdminBadge>
                    ) : (
                      <AdminBadge tone="good">Active</AdminBadge>
                    )}
                    {company.ownerVerified ? (
                      <AdminBadge tone="info">Verifie</AdminBadge>
                    ) : (
                      <AdminBadge tone="warn">Non verifie</AdminBadge>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <AdminBadge>{company.activeMembers}/{company.members}</AdminBadge>
                </td>
                <td className="px-4 py-3 text-xs text-slate-400">{formatDate(company.createdAt)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <IconButton title="Details" onClick={() => setDetailId(company.id)}>
                      <Eye className="size-3.5" />
                    </IconButton>
                    {company.ownerVerified ? (
                      <IconButton title="Marquer non verifie" disabled={busyId === company.id} onClick={() => handleVerify(company, false)}>
                        <ShieldOff className="size-3.5" />
                      </IconButton>
                    ) : (
                      <IconButton title="Marquer verifie" tone="good" disabled={busyId === company.id} onClick={() => handleVerify(company, true)}>
                        <ShieldCheck className="size-3.5" />
                      </IconButton>
                    )}
                    {company.status === 'SUSPENDED' ? (
                      <IconButton title="Reactiver" tone="good" disabled={busyId === company.id} onClick={() => handleReactivate(company)}>
                        <CircleCheck className="size-3.5" />
                      </IconButton>
                    ) : (
                      <IconButton title="Suspendre" tone="warn" disabled={busyId === company.id} onClick={() => { setSuspendTarget(company); setMessage(null) }}>
                        <Ban className="size-3.5" />
                      </IconButton>
                    )}
                    <IconButton title="Supprimer" tone="risk" onClick={() => { setDeleteTarget(company); setMessage(null) }}>
                      <Trash2 className="size-3.5" />
                    </IconButton>
                  </div>
                </td>
              </tr>
            ))}
          </AdminTable>
        )}
      </AdminCard>

      {detailId ? <DetailModal companyId={detailId} onClose={() => setDetailId(null)} /> : null}

      {suspendTarget ? (
        <SuspendModal
          company={suspendTarget}
          onClose={() => setSuspendTarget(null)}
          onDone={async (name, affected) => {
            setSuspendTarget(null)
            setMessage(`« ${name} » suspendue (${affected} membre(s) deconnecte(s)).`)
            await refresh()
          }}
        />
      ) : null}

      {deleteTarget ? (
        <DeleteCompanyModal
          company={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={async (slug) => {
            setDeleteTarget(null)
            setMessage(`Entreprise « ${slug} » supprimee.`)
            await refresh()
          }}
        />
      ) : null}
    </div>
  )
}

function IconButton({
  children,
  title,
  onClick,
  disabled,
  tone = 'muted',
}: {
  children: React.ReactNode
  title: string
  onClick: () => void
  disabled?: boolean
  tone?: 'muted' | 'good' | 'warn' | 'risk'
}) {
  const tones: Record<string, string> = {
    muted: 'border-slate-200 text-slate-600 hover:bg-slate-50',
    good: 'border-emerald-200 text-emerald-700 hover:bg-emerald-50',
    warn: 'border-amber-200 text-amber-700 hover:bg-amber-50',
    risk: 'border-red-200 text-red-700 hover:bg-red-50',
  }
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex size-8 items-center justify-center rounded border bg-white transition-colors disabled:opacity-40 ${tones[tone]}`}
    >
      {children}
    </button>
  )
}

function ModalShell({ children, onClose, wide = false }: { children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative max-h-[90vh] w-full overflow-y-auto rounded border border-slate-200 bg-white p-5 ${wide ? 'max-w-2xl' : 'max-w-md'}`}>
        {children}
      </div>
    </div>
  )
}

function SuspendModal({
  company,
  onClose,
  onDone,
}: {
  company: CompanyRow
  onClose: () => void
  onDone: (name: string, affected: number) => void
}) {
  const [reason, setReason] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)

  async function handleSuspend() {
    if (!reason.trim()) {
      setError('Un motif est requis.')
      return
    }
    setSubmitting(true)
    setError(null)
    const result = await setCompanySuspended({ data: { companyId: company.id, suspend: true, reason: reason.trim() } })
    setSubmitting(false)
    if (result.ok) onDone(company.name, result.affected)
    else setError(result.message)
  }

  return (
    <ModalShell onClose={onClose}>
      <div className="flex items-center gap-2.5">
        <span className="flex size-9 items-center justify-center rounded bg-amber-50 text-amber-600">
          <Ban className="size-4" />
        </span>
        <h2 className="text-base font-bold text-slate-950">Suspendre cette entreprise ?</h2>
      </div>
      <p className="mt-3 text-sm text-slate-600">
        Tous les membres de <strong>{company.name}</strong> perdront immediatement l'acces (leurs sessions
        cessent d'ouvrir cette entreprise). L'action est reversible via « Reactiver ».
      </p>
      <label className="mt-4 block">
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-400">Motif (obligatoire)</span>
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={3}
          autoFocus
          placeholder="Ex: impayes, fraude suspectee, demande du client…"
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-amber-500"
        />
      </label>
      {error ? <p className="mt-2 text-xs font-semibold text-red-600">{error}</p> : null}
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onClose} className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          Annuler
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={handleSuspend}
          className="rounded bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {submitting ? 'Suspension…' : 'Suspendre'}
        </button>
      </div>
    </ModalShell>
  )
}

function DetailModal({ companyId, onClose }: { companyId: string; onClose: () => void }) {
  const [detail, setDetail] = React.useState<Awaited<ReturnType<typeof getPlatformCompanyDetail>> | null>(null)

  React.useEffect(() => {
    let alive = true
    void getPlatformCompanyDetail({ data: { companyId } }).then((result) => {
      if (alive) setDetail(result)
    })
    return () => {
      alive = false
    }
  }, [companyId])

  return (
    <ModalShell onClose={onClose} wide>
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-base font-bold text-slate-950">Detail de l'entreprise</h2>
        <button type="button" onClick={onClose} aria-label="Fermer" className="flex size-8 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-950">
          <X className="size-4" />
        </button>
      </div>

      {!detail ? (
        <p className="py-10 text-center text-sm text-slate-500">Chargement…</p>
      ) : !detail.ok ? (
        <p className="py-10 text-center text-sm text-red-600">{detail.message}</p>
      ) : (
        <div className="mt-4 space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-bold text-slate-950">{detail.company.name}</span>
            <span className="text-xs text-slate-400">/{detail.company.slug}</span>
            {detail.company.status === 'SUSPENDED' ? (
              <AdminBadge tone="risk">Suspendue</AdminBadge>
            ) : detail.company.status === 'EMPTY' ? (
              <AdminBadge tone="muted">Vide</AdminBadge>
            ) : (
              <AdminBadge tone="good">Active</AdminBadge>
            )}
          </div>

          {detail.company.suspendReason ? (
            <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <strong>Motif de suspension :</strong> {detail.company.suspendReason}
            </div>
          ) : null}

          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            <Metric label="Membres" value={detail.counts.members} />
            <Metric label="Factures" value={detail.counts.invoices} />
            <Metric label="Devis" value={detail.counts.quotes} />
            <Metric label="Clients" value={detail.counts.customers} />
            <Metric label="Articles" value={detail.counts.items} />
            <Metric label="Employes" value={detail.counts.employees} />
            <Metric label="Entrepots" value={detail.counts.warehouses} />
            <Metric label="Fournisseurs" value={detail.counts.vendors} />
            <Metric label="Achats" value={detail.counts.purchases} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded border border-slate-100 p-3">
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Proprietaire</h3>
              {detail.company.owner ? (
                <>
                  <p className="text-sm font-semibold text-slate-950">{detail.company.owner.name}</p>
                  <p className="text-xs text-slate-500">{detail.company.owner.email}</p>
                  <p className="mt-1">
                    {detail.company.owner.verified ? <AdminBadge tone="good">Verifie</AdminBadge> : <AdminBadge tone="warn">Non verifie</AdminBadge>}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">Derniere connexion : {formatDateTime(detail.company.owner.lastLoginAt)}</p>
                </>
              ) : (
                <p className="text-sm text-slate-400">—</p>
              )}
            </div>
            <div className="rounded border border-slate-100 p-3">
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Profil</h3>
              <dl className="space-y-1 text-xs text-slate-600">
                <Line label="Espace" value={detail.company.workspaceName} />
                <Line label="Email" value={detail.company.email} />
                <Line label="Telephone" value={detail.company.phone} />
                <Line label="Devise" value={detail.company.currency} />
                <Line label="NIF/RCCM" value={detail.company.taxId || detail.company.rccm} />
                <Line label="Creee" value={formatDate(detail.company.createdAt)} />
              </dl>
            </div>
          </div>

          <div className="rounded border border-slate-100">
            <h3 className="border-b border-slate-100 px-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-400">
              Membres ({detail.members.length})
            </h3>
            <ul className="divide-y divide-slate-100">
              {detail.members.map((member) => (
                <li key={member.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-slate-800">{member.name}</span>
                    <span className="block truncate text-xs text-slate-400">
                      {member.email}
                      {member.roles.length ? ` · ${member.roles.join(', ')}` : ''}
                    </span>
                  </span>
                  {member.status === 'ACTIVE' ? <AdminBadge tone="good">Actif</AdminBadge> : <AdminBadge tone="risk">{member.status}</AdminBadge>}
                </li>
              ))}
            </ul>
          </div>

          {detail.recentActivity.length ? (
            <div className="rounded border border-slate-100">
              <h3 className="border-b border-slate-100 px-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-400">Activite recente</h3>
              <ul className="divide-y divide-slate-100">
                {detail.recentActivity.map((log) => (
                  <li key={log.id} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                    <span className="font-mono font-semibold text-slate-700">{log.action}</span>
                    <span className="text-slate-400">{formatDateTime(log.createdAt)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </ModalShell>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-slate-100 px-2 py-2 text-center">
      <div className="text-base font-bold text-slate-950">{value}</div>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</div>
    </div>
  )
}

function Line({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-slate-400">{label}</dt>
      <dd className="min-w-0 truncate text-right font-semibold text-slate-700">{value || '—'}</dd>
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
    <ModalShell onClose={onClose}>
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
        <button type="button" onClick={onClose} className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
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
    </ModalShell>
  )
}
