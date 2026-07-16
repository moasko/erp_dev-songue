import { createFileRoute, redirect } from '@tanstack/react-router'
import { ArrowRight, Check, Loader2, X } from 'lucide-react'
import * as React from 'react'
import {
  AuthCard,
  AuthShell,
  BrandMark,
  ErrorBanner,
  PageHeading,
  Stepper,
  SubmitButton,
} from '~/components/AuthShell'
import { checkSubdomainAvailability, completeOnboarding, getOnboardingState } from '~/server/auth'
import {
  countries,
  currencies,
  defaultCountry,
  locales,
  slugifySubdomain,
  validateSubdomain,
} from '~/utils/onboarding'

export const Route = createFileRoute('/onboarding')({
  beforeLoad: async () => {
    const state = await getOnboardingState()
    if (!state.user) {
      throw redirect({ to: '/login', search: { redirect: '/onboarding' } })
    }
    // Le compte a deja une boutique : l'etape 2 est derriere lui.
    if (state.firstCompanySlug) {
      throw redirect({ to: '/$companySlug/dashboard', params: { companySlug: state.firstCompanySlug } })
    }
    return { rootDomain: state.rootDomain }
  },
  component: OnboardingPage,
})

type Availability =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available'; subdomain: string }
  | { status: 'taken'; message: string }

// Etape 2 sur 2 : la boutique. Le compte proprietaire existe deja et son email
// est verifie, sinon `beforeLoad` nous aurait renvoye ailleurs.
function OnboardingPage() {
  const { rootDomain } = Route.useRouteContext()
  const [name, setName] = React.useState('')
  const [subdomain, setSubdomain] = React.useState('')
  // Tant que l'utilisateur n'a pas touche au sous-domaine, il suit le nom.
  const [subdomainTouched, setSubdomainTouched] = React.useState(false)
  const [country, setCountry] = React.useState(defaultCountry)
  const [currency, setCurrency] = React.useState(
    () => countries.find((item) => item.code === defaultCountry)?.currency ?? 'XOF',
  )
  const [locale, setLocale] = React.useState(
    () => countries.find((item) => item.code === defaultCountry)?.locale ?? 'fr',
  )
  const [availability, setAvailability] = React.useState<Availability>({ status: 'idle' })
  const [error, setError] = React.useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  const effectiveSubdomain = subdomainTouched ? subdomain : slugifySubdomain(name)

  function handleNameChange(value: string) {
    setName(value)
    if (!subdomainTouched) setSubdomain(slugifySubdomain(value))
  }

  function handleCountryChange(code: string) {
    setCountry(code)
    // La devise et la langue suivent le pays, mais restent modifiables ensuite.
    const match = countries.find((item) => item.code === code)
    if (match) {
      setCurrency(match.currency)
      setLocale(match.locale)
    }
  }

  // Verification de disponibilite en direct, avec un delai pour ne pas interroger
  // le serveur a chaque frappe.
  React.useEffect(() => {
    const value = effectiveSubdomain
    if (!value) {
      setAvailability({ status: 'idle' })
      return
    }

    const local = validateSubdomain(value)
    if (!local.ok) {
      setAvailability({ status: 'taken', message: local.message })
      return
    }

    setAvailability({ status: 'checking' })
    let cancelled = false
    const timer = window.setTimeout(async () => {
      const result = await checkSubdomainAvailability({ data: { subdomain: value } }).catch(() => null)
      // La reponse d'une frappe precedente ne doit pas ecraser l'etat courant.
      if (cancelled) return
      if (!result?.ok) {
        setAvailability({ status: 'taken', message: result?.message ?? 'Verification impossible.' })
        return
      }
      setAvailability(
        result.available
          ? { status: 'available', subdomain: value }
          : { status: 'taken', message: result.message ?? 'Ce sous-domaine est deja pris.' },
      )
    }, 400)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [effectiveSubdomain])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setError(null)

    const result = await completeOnboarding({
      data: { companyName: name, subdomain: effectiveSubdomain, country, currency, locale },
    })

    if (!result?.ok) {
      setError(result?.message ?? 'Impossible de creer la boutique.')
      setIsSubmitting(false)
      return
    }

    window.location.href = result.redirectTo
  }

  const canSubmit = name.trim().length >= 2 && availability.status === 'available'

  return (
    <AuthShell wide>
      <BrandMark subtitle="Creation de votre espace" />
      <AuthCard>
        <Stepper current={2} />
        <PageHeading title="Creez votre boutique" description="Quelques informations et votre boutique est prete" />

        <form onSubmit={handleSubmit} className="mt-7 grid gap-5">
          <label className="grid gap-1.5">
            <span className="text-sm font-semibold text-slate-700">Nom de la boutique</span>
            <input
              value={name}
              onChange={(event) => handleNameChange(event.target.value)}
              placeholder="Ma boutique"
              autoFocus
              required
              minLength={2}
              className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition-colors focus:border-slate-950 focus:ring-2 focus:ring-slate-950/10 placeholder:text-slate-400"
            />
          </label>

          <div className="grid gap-1.5">
            <label className="grid gap-1.5">
              <span className="text-sm font-semibold text-slate-700">Sous-domaine</span>
              <span className="flex h-11 items-stretch rounded-lg border border-slate-300 bg-white transition-colors focus-within:border-slate-950 focus-within:ring-2 focus-within:ring-slate-950/10">
                <input
                  value={effectiveSubdomain}
                  onChange={(event) => {
                    setSubdomainTouched(true)
                    setSubdomain(slugifySubdomain(event.target.value))
                  }}
                  placeholder="ma-boutique"
                  required
                  aria-describedby="subdomain-status"
                  className="w-full rounded-l-lg bg-transparent px-3 text-sm text-slate-950 outline-none placeholder:text-slate-400"
                />
                <span className="grid shrink-0 place-items-center rounded-r-lg border-l border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-500">
                  .{rootDomain}
                </span>
              </span>
            </label>
            <SubdomainStatus id="subdomain-status" availability={availability} rootDomain={rootDomain} />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Select label="Pays" value={country} onChange={handleCountryChange}>
              {countries.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.name}
                </option>
              ))}
            </Select>
            <Select label="Devise" value={currency} onChange={setCurrency}>
              {currencies.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.label}
                </option>
              ))}
            </Select>
            <Select label="Langue par defaut" value={locale} onChange={setLocale}>
              {locales.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.label}
                </option>
              ))}
            </Select>
          </div>

          <ErrorBanner message={error} />

          <div className="mt-1">
            <SubmitButton isSubmitting={isSubmitting} disabled={!canSubmit} icon={ArrowRight}>
              {isSubmitting ? 'Creation...' : 'Continuer'}
            </SubmitButton>
          </div>
        </form>
      </AuthCard>
    </AuthShell>
  )
}

function SubdomainStatus({
  id,
  availability,
  rootDomain,
}: {
  id: string
  availability: Availability
  rootDomain: string
}) {
  if (availability.status === 'idle') {
    return (
      <p id={id} className="text-xs text-slate-400">
        L adresse de votre boutique en ligne.
      </p>
    )
  }

  if (availability.status === 'checking') {
    return (
      <p id={id} className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
        <Loader2 className="size-3.5 animate-spin" />
        Verification...
      </p>
    )
  }

  if (availability.status === 'taken') {
    return (
      <p id={id} role="alert" className="flex items-center gap-1.5 text-xs font-semibold text-red-600">
        <X className="size-3.5" />
        {availability.message}
      </p>
    )
  }

  return (
    <p id={id} role="status" className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
      <Check className="size-3.5" />
      Disponible: {availability.subdomain}.{rootDomain}
    </p>
  )
}

function Select({
  label,
  value,
  onChange,
  children,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  children: React.ReactNode
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition-colors focus:border-slate-950 focus:ring-2 focus:ring-slate-950/10"
      >
        {children}
      </select>
    </label>
  )
}
