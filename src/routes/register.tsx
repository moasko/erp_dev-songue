import { Link, createFileRoute, redirect } from '@tanstack/react-router'
import { Building2, LockKeyhole, Mail, UserRound } from 'lucide-react'
import * as React from 'react'
import { getInstallationState, setupOwnerAccount } from '~/server/auth'

export const Route = createFileRoute('/register')({
  beforeLoad: async () => {
    const installation = await getInstallationState()
    if (!installation?.needsSetup) {
      throw redirect({ to: '/login', search: { redirect: undefined } })
    }
  },
  component: RegisterPage,
})

function RegisterPage() {
  const [companyName, setCompanyName] = React.useState('')
  const [ownerName, setOwnerName] = React.useState('')
  const [ownerEmail, setOwnerEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setError(null)

    const result = await setupOwnerAccount({
      data: {
        ownerName,
        ownerEmail,
        password,
        workspaceName: companyName,
        companyName,
        companySlug: slugify(companyName),
      },
    })
    setIsSubmitting(false)

    if (!result || !result.ok) {
      setError(result?.message ?? 'Erreur lors de la creation du compte.')
      return
    }

    window.location.href = result.redirectTo
  }

  return (
    <AuthFrame>
      <form onSubmit={handleSubmit} className="w-full">
        <BrandMark />

        <div className="mt-8">
          <h1 className="text-2xl font-bold text-slate-950 dark:text-slate-50">Creer l'espace</h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Renseignez les informations de base.</p>
        </div>

        <div className="mt-7 grid gap-4">
          <Field icon={Building2} label="Entreprise" value={companyName} onChange={setCompanyName} placeholder="Nom de l'entreprise" />
          <Field icon={UserRound} label="Responsable" value={ownerName} onChange={setOwnerName} placeholder="Nom complet" />
          <Field icon={Mail} label="Email" value={ownerEmail} onChange={setOwnerEmail} type="email" placeholder="nom@entreprise.com" />
          <Field icon={LockKeyhole} label="Mot de passe" value={password} onChange={setPassword} type="password" placeholder="8 caracteres minimum" />
        </div>

        {error ? (
          <div className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-6 inline-flex h-11 w-full items-center justify-center rounded bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-emerald-400 dark:text-slate-950 dark:hover:bg-emerald-300"
        >
          {isSubmitting ? 'Creation...' : "Creer l'espace"}
        </button>

        <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
          Vous avez deja un compte ?{' '}
          <Link to="/login" search={{ redirect: undefined }} className="font-semibold text-slate-950 hover:underline dark:text-emerald-300">
            Se connecter
          </Link>
        </p>
      </form>
    </AuthFrame>
  )
}

function AuthFrame({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4 py-8 text-slate-950 dark:bg-slate-950 dark:text-slate-50">
      <section className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-8">
        {children}
      </section>
    </main>
  )
}

function BrandMark() {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-10 place-items-center rounded bg-slate-950 text-sm font-bold text-white dark:bg-emerald-400 dark:text-slate-950">
        GP
      </span>
      <div>
        <p className="text-sm font-bold text-slate-950 dark:text-slate-50">Gestion PME</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">Installation de votre espace</p>
      </div>
    </div>
  )
}

function Field({
  icon: Icon,
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  icon: typeof UserRound
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  placeholder: string
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{label}</span>
      <span className="flex h-11 items-center gap-2 rounded border border-slate-300 bg-white px-3 focus-within:border-slate-950 dark:border-slate-700 dark:bg-slate-950 dark:focus-within:border-emerald-300">
        <Icon className="size-4 text-slate-500 dark:text-slate-400" />
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full bg-transparent text-sm text-slate-950 outline-none placeholder:text-slate-400 dark:text-slate-50 dark:placeholder:text-slate-500"
          type={type}
          placeholder={placeholder}
          required
        />
      </span>
    </label>
  )
}

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'entreprise'
  )
}
