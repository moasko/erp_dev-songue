import * as React from 'react'

// Primitives partagees par les pages de l'espace super admin. Elles reprennent le
// langage visuel de l'application (surfaces neon, bordures slate) pour rester
// coherentes avec le reste de l'ERP.

export function AdminPageHeader({
  title,
  description,
  icon: Icon,
  actions,
}: {
  title: string
  description?: string
  icon?: any
  actions?: React.ReactNode
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        {Icon ? (
          <span className="flex size-10 shrink-0 items-center justify-center rounded bg-slate-950 text-white">
            <Icon className="size-5" />
          </span>
        ) : null}
        <div>
          <h1 className="text-lg font-bold text-slate-950 sm:text-xl">{title}</h1>
          {description ? <p className="mt-0.5 text-sm text-slate-500">{description}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  )
}

export function AdminCard({
  title,
  children,
  className = '',
}: {
  title?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={`neon-surface rounded ${className}`}>
      {title ? (
        <h2 className="border-b border-slate-100 px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-400">
          {title}
        </h2>
      ) : null}
      {children}
    </section>
  )
}

// Enveloppe de tableau : defilement horizontal sur mobile, jamais de debordement
// de la page elle-meme.
export function AdminTable({ head, children }: { head: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] text-left text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-[11px] font-bold uppercase tracking-wide text-slate-400">
            {head}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  )
}

export function AdminBadge({
  children,
  tone = 'muted',
}: {
  children: React.ReactNode
  tone?: 'good' | 'warn' | 'risk' | 'info' | 'muted'
}) {
  const tones: Record<string, string> = {
    good: 'bg-emerald-100 text-emerald-700',
    warn: 'bg-amber-100 text-amber-700',
    risk: 'bg-red-100 text-red-700',
    info: 'bg-blue-100 text-blue-700',
    muted: 'bg-slate-100 text-slate-600',
  }
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-bold ${tones[tone]}`}>
      {children}
    </span>
  )
}

export function AdminEmpty({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-10 text-center text-sm text-slate-500">{children}</div>
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
