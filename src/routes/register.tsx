import { Link, createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { ArrowRight, LockKeyhole, Mail, UserRound } from 'lucide-react'
import * as React from 'react'
import {
  AuthCard,
  AuthShell,
  BrandMark,
  ErrorBanner,
  Field,
  PageHeading,
  Stepper,
  SubmitButton,
} from '~/components/AuthShell'
import { getInstallationState, registerOwner } from '~/server/auth'

export const Route = createFileRoute('/register')({
  beforeLoad: async () => {
    const installation = await getInstallationState()
    // Accessible pour l'installation initiale, ou quand l'inscription publique est ouverte.
    if (!installation?.needsSetup && !installation?.allowRegistration) {
      throw redirect({ to: '/login', search: { redirect: undefined } })
    }
  },
  component: RegisterPage,
})

// Etape 1 sur 2 : le compte du proprietaire. La boutique est creee a l'etape 2,
// une fois l'adresse email confirmee (/verify).
function RegisterPage() {
  const navigate = useNavigate()
  const [name, setName] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setError(null)

    const result = await registerOwner({ data: { name, email, password } })

    if (!result?.ok) {
      setError(result?.message ?? 'Erreur lors de la creation du compte.')
      setIsSubmitting(false)
      return
    }

    // Sans transport email configure, le serveur renvoie le code pour ne pas
    // bloquer le dev. Il transite par sessionStorage plutot que par l'URL, ou il
    // finirait dans l'historique et les logs.
    if (result.devCode) {
      window.sessionStorage.setItem('erp-dev-verification-code', result.devCode)
    }

    navigate({ to: '/verify', search: { email: result.email ?? email } })
  }

  return (
    <AuthShell>
      <BrandMark subtitle="Creation de votre espace" />
      <AuthCard>
        <Stepper current={1} />
        <PageHeading title="Creez votre compte" description="Commencons par vous. La boutique arrive juste apres." />

        <form onSubmit={handleSubmit} className="mt-7 grid gap-4">
          <Field
            icon={UserRound}
            label="Nom complet"
            value={name}
            onChange={setName}
            placeholder="Awa Kone"
            autoComplete="name"
            minLength={2}
          />
          <Field
            icon={Mail}
            label="Email professionnel"
            value={email}
            onChange={setEmail}
            type="email"
            placeholder="nom@entreprise.com"
            autoComplete="email"
            hint="Un code de confirmation y sera envoye."
          />
          <Field
            icon={LockKeyhole}
            label="Mot de passe"
            value={password}
            onChange={setPassword}
            type="password"
            placeholder="10 caracteres minimum"
            autoComplete="new-password"
            minLength={10}
          />

          <ErrorBanner message={error} />

          <div className="mt-2">
            <SubmitButton isSubmitting={isSubmitting} icon={ArrowRight}>
              {isSubmitting ? 'Creation...' : 'Continuer'}
            </SubmitButton>
          </div>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          Vous avez deja un compte ?{' '}
          <Link to="/login" search={{ redirect: undefined }} className="font-semibold text-slate-950 hover:underline">
            Se connecter
          </Link>
        </p>
      </AuthCard>
    </AuthShell>
  )
}
