import { Link, createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { LockKeyhole, Mail } from 'lucide-react'
import * as React from 'react'
import {
  AuthLogo,
  AuthSplitShell,
  ErrorBanner,
  Field,
  SubmitButton,
} from '~/components/AuthShell'
import { getAuthState, getInstallationState, login } from '~/server/auth'

// N'accepte que les chemins internes ("/...") pour eviter une redirection
// ouverte vers un site externe apres connexion.
function sanitizeRedirect(value: unknown) {
  if (typeof value !== 'string') return undefined
  if (!value.startsWith('/') || value.startsWith('//')) return undefined
  return value
}

export const Route = createFileRoute('/login')({
  validateSearch: (search) => ({
    redirect: sanitizeRedirect(search.redirect),
  }),
  beforeLoad: async () => {
    const installation = await getInstallationState()
    if (installation?.needsSetup) {
      throw redirect({ to: '/register' })
    }
    const auth = await getAuthState()
    const firstCompany = auth.companies[0]
    if (auth.user && firstCompany) {
      throw redirect({
        to: '/$companySlug/dashboard',
        params: { companySlug: firstCompany.slug },
      })
    }
    // Deja connecte mais inscription abandonnee a l'etape 2 : on la reprend.
    if (auth.user) {
      throw redirect({ to: '/onboarding' })
    }
  },
  component: LoginPage,
})

function LoginPage() {
  const navigate = useNavigate()
  const search = Route.useSearch()
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [totpCode, setTotpCode] = React.useState('')
  const [needsTotp, setNeedsTotp] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setError(null)

    const result = await login({ data: { email, password, totpCode: totpCode || undefined } })
    setIsSubmitting(false)

    if (result?.needsSetup) {
      await navigate({ to: '/register' })
      return
    }

    // Compte cree mais email jamais confirme : le serveur a renvoye un code neuf.
    if (result?.needsVerification && result.email) {
      await navigate({ to: '/verify', search: { email: result.email } })
      return
    }

    if (result?.needsTotp) {
      // Le mot de passe est bon mais un code 2FA est attendu.
      if (needsTotp) setError(result.message)
      setNeedsTotp(true)
      return
    }

    if (!result || !result.ok) {
      setError(result?.message ?? 'Erreur de connexion au serveur.')
      return
    }

    window.location.href = search.redirect ?? result.redirectTo
  }

  return (
    <AuthSplitShell
      headline="Pilotez toute votre boutique."
      subhead="Caisse, ventes, stock, factures et clients reunis dans un seul espace de travail."
    >
      <AuthLogo />
      <h1 className="text-3xl font-black tracking-tight text-slate-950">Connexion</h1>
      <p className="mt-2 text-sm text-slate-500">
        Pas encore de compte ?{' '}
        <Link to="/register" className="font-semibold text-[#048038] hover:underline">
          Creez votre espace
        </Link>
      </p>

      <form onSubmit={handleSubmit} className="mt-8 grid gap-4">
        <Field
          icon={Mail}
          label="Email"
          value={email}
          onChange={setEmail}
          type="email"
          autoComplete="email"
          placeholder="nom@entreprise.com"
        />
        <Field
          icon={LockKeyhole}
          label="Mot de passe"
          value={password}
          onChange={setPassword}
          type="password"
          autoComplete="current-password"
          placeholder="Votre mot de passe"
        />

        {needsTotp ? (
          <Field
            icon={LockKeyhole}
            label="Code de verification (2FA)"
            value={totpCode}
            onChange={setTotpCode}
            autoComplete="one-time-code"
            placeholder="Code a 6 chiffres"
          />
        ) : null}

        <ErrorBanner message={error} />

        <div className="mt-2">
          <SubmitButton isSubmitting={isSubmitting} variant="brand">
            {isSubmitting ? 'Connexion...' : 'Se connecter'}
          </SubmitButton>
        </div>
      </form>
    </AuthSplitShell>
  )
}
