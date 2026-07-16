import * as React from 'react'
import type { LucideIcon } from 'lucide-react'

// Coque commune aux pages d'inscription, de verification et de creation de
// boutique. `auth-light` force les tokens clairs : ces pages sont hors du layout
// d'entreprise, qui est le seul endroit ou l'utilisateur choisit son theme.
export function AuthShell({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <main className="auth-light grid min-h-screen place-items-center px-4 py-10">
      <section className={`w-full ${wide ? 'max-w-xl' : 'max-w-md'}`}>{children}</section>
    </main>
  )
}

export function AuthCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">{children}</div>
  )
}

export function BrandMark({ subtitle }: { subtitle: string }) {
  return (
    <div className="mb-8 flex items-center justify-center gap-3">
      <span className="grid size-10 place-items-center rounded-lg bg-slate-950 text-sm font-bold text-white">
        GP
      </span>
      <div>
        <p className="text-sm font-bold text-slate-950">Gestion PME</p>
        <p className="text-xs text-slate-500">{subtitle}</p>
      </div>
    </div>
  )
}

export function Stepper({ current }: { current: 1 | 2 }) {
  const steps = [
    { number: 1 as const, label: 'Votre compte' },
    { number: 2 as const, label: 'Votre boutique' },
  ]

  return (
    <ol className="mb-8 flex items-center justify-center gap-2">
      {steps.map((step, index) => {
        const done = current > step.number
        const active = current === step.number
        return (
          <React.Fragment key={step.number}>
            {index > 0 ? <span aria-hidden className={`h-px w-8 ${done ? 'bg-slate-950' : 'bg-slate-200'}`} /> : null}
            <li className="flex items-center gap-2">
              <span
                className={`grid size-6 place-items-center rounded-full text-xs font-bold ${
                  active || done ? 'bg-slate-950 text-white' : 'bg-slate-100 text-slate-400'
                }`}
              >
                {step.number}
              </span>
              <span
                aria-current={active ? 'step' : undefined}
                className={`text-xs font-semibold ${active ? 'text-slate-950' : 'text-slate-400'}`}
              >
                {step.label}
              </span>
            </li>
          </React.Fragment>
        )
      })}
    </ol>
  )
}

export function PageHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="text-center">
      <h1 className="text-2xl font-bold text-slate-950">{title}</h1>
      <p className="mt-2 text-sm text-slate-500">{description}</p>
    </div>
  )
}

export function Field({
  icon: Icon,
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  hint,
  autoComplete,
  required = true,
  minLength,
}: {
  icon?: LucideIcon
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  placeholder?: string
  hint?: string
  autoComplete?: string
  required?: boolean
  minLength?: number
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <span className="flex h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 transition-colors focus-within:border-slate-950 focus-within:ring-2 focus-within:ring-slate-950/10">
        {Icon ? <Icon className="size-4 shrink-0 text-slate-400" /> : null}
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full bg-transparent text-sm text-slate-950 outline-none placeholder:text-slate-400"
          type={type}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required={required}
          minLength={minLength}
        />
      </span>
      {hint ? <span className="text-xs text-slate-400">{hint}</span> : null}
    </label>
  )
}

export function SubmitButton({
  children,
  isSubmitting,
  disabled = false,
  icon: Icon,
}: {
  children: React.ReactNode
  isSubmitting: boolean
  disabled?: boolean
  icon?: LucideIcon
}) {
  return (
    <button
      type="submit"
      disabled={disabled || isSubmitting}
      className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {children}
      {Icon && !isSubmitting ? <Icon className="size-4" /> : null}
    </button>
  )
}

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
      {message}
    </div>
  )
}
