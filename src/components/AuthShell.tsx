import * as React from 'react'
import {
  BarChart3,
  Boxes,
  CircleDollarSign,
  Contact,
  FileCheck2,
  ReceiptText,
  ShoppingCart,
  Truck,
  type LucideIcon,
} from 'lucide-react'

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

// Modules mis en avant sur le panneau de marque (facon "pilules" produit).
const modulePills: Array<{ label: string; icon: LucideIcon; color: string }> = [
  { label: 'Caisse', icon: ShoppingCart, color: 'bg-emerald-100 text-emerald-700' },
  { label: 'Ventes', icon: ReceiptText, color: 'bg-blue-100 text-blue-700' },
  { label: 'Devis', icon: FileCheck2, color: 'bg-violet-100 text-violet-700' },
  { label: 'Stock', icon: Boxes, color: 'bg-amber-100 text-amber-700' },
  { label: 'Clients', icon: Contact, color: 'bg-teal-100 text-teal-700' },
  { label: 'Achats', icon: Truck, color: 'bg-rose-100 text-rose-700' },
  { label: 'Finance', icon: CircleDollarSign, color: 'bg-indigo-100 text-indigo-700' },
  { label: 'Rapports', icon: BarChart3, color: 'bg-slate-200 text-slate-700' },
]

// Coque "split" pour la connexion et l'inscription : panneau de marque a gauche
// (masque sous lg, ou la place revient au formulaire), formulaire a droite.
export function AuthSplitShell({
  children,
  headline,
  subhead,
}: {
  children: React.ReactNode
  headline: string
  subhead: string
}) {
  return (
    <main className="auth-light min-h-screen bg-white">
      <div className="grid min-h-screen lg:grid-cols-2">
        <aside className="relative hidden overflow-hidden bg-[#00fe68] p-10 lg:flex lg:flex-col lg:justify-center xl:p-14">
          <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 size-72 rounded-full bg-white/25 blur-2xl" />
          <div aria-hidden className="pointer-events-none absolute -bottom-24 -left-10 size-80 rounded-full bg-black/5 blur-3xl" />
          <div className="relative">
            <h2 className="max-w-md text-4xl font-black leading-[1.1] tracking-tight text-[#0a1728] xl:text-5xl">
              {headline}
            </h2>
            <p className="mt-4 max-w-sm text-base font-medium text-[#0a1728]/75">{subhead}</p>
            <div className="mt-9 flex max-w-md flex-wrap gap-2.5">
              {modulePills.map(({ label, icon: Icon, color }) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-2 rounded-xl bg-white py-1.5 pl-1.5 pr-3.5 text-sm font-bold text-[#0a1728] shadow-sm"
                >
                  <span className={`grid size-7 place-items-center rounded-lg ${color}`}>
                    <Icon className="size-4" />
                  </span>
                  {label}
                </span>
              ))}
            </div>
          </div>
        </aside>

        <div className="flex items-center justify-center px-1 py-8 sm:px-6 lg:py-6">
          <div className="w-full max-w-md">{children}</div>
        </div>
      </div>
    </main>
  )
}

// Logo + nom, en haut du formulaire (visible aussi sur mobile ou le panneau de
// marque est masque).
export function AuthLogo() {
  return (
    <div className="mb-8 flex items-center gap-2.5">
      <img src="/logo.png" alt="" width={32} height={32} className="size-8 shrink-0 object-contain" />
      <span className="text-lg font-extrabold tracking-tight text-slate-950">Icomgest</span>
    </div>
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
      {/* Le logo est deja detoure et carre : aucun fond ni cadre a lui ajouter. */}
      <img src="/logo.png" alt="" width={40} height={40} className="size-10 shrink-0 object-contain" />
      <div>
        <p className="text-sm font-bold text-slate-950">Icomgest</p>
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
  variant = 'primary',
}: {
  children: React.ReactNode
  isSubmitting: boolean
  disabled?: boolean
  icon?: LucideIcon
  // 'brand' : vert Icomgest sur texte bleu nuit (pages de connexion/inscription).
  variant?: 'primary' | 'brand'
}) {
  const styles =
    variant === 'brand'
      ? 'bg-[#00fe68] text-[#0a1728] font-bold hover:bg-[#00e25d]'
      : 'bg-slate-950 text-white font-semibold hover:bg-slate-800'
  return (
    <button
      type="submit"
      disabled={disabled || isSubmitting}
      className={`inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg px-4 text-sm transition disabled:cursor-not-allowed disabled:opacity-60 ${styles}`}
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
