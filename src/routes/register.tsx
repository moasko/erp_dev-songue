import { Link, createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { ArrowRight, LockKeyhole, Mail, UserRound } from 'lucide-react'
import * as React from 'react'
import {
  AuthLogo,
  AuthSplitShell,
  ErrorBanner,
  Field,
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
  const [firstName, setFirstName] = React.useState('')
  const [lastName, setLastName] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [accepted, setAccepted] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!accepted) {
      setError("Vous devez accepter les conditions d'utilisation.")
      return
    }
    setIsSubmitting(true)
    setError(null)

    const name = `${firstName.trim()} ${lastName.trim()}`.trim()
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
    <AuthSplitShell
      headline="Lancez votre boutique en quelques minutes."
      subhead="Creez votre compte, ajoutez vos produits et encaissez des aujourd'hui."
    >
      <AuthLogo />
      <p className="text-xs font-bold uppercase tracking-widest text-[#048038]">Etape 1 sur 2</p>
      <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950">Creer un compte</h1>
      <p className="mt-2 text-sm text-slate-500">
        Deja un compte ?{' '}
        <Link to="/login" search={{ redirect: undefined }} className="font-semibold text-[#048038] hover:underline">
          Se connecter
        </Link>
      </p>

      <form onSubmit={handleSubmit} className="mt-8 grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field icon={UserRound} label="Prenom" value={firstName} onChange={setFirstName} placeholder="Awa" autoComplete="given-name" minLength={2} />
          <Field icon={UserRound} label="Nom" value={lastName} onChange={setLastName} placeholder="Kone" autoComplete="family-name" />
        </div>
        <Field
          icon={Mail}
          label="Adresse email"
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

        <label className="flex items-start gap-2.5 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(event) => setAccepted(event.target.checked)}
            className="mt-0.5 size-4 shrink-0 rounded border-slate-300 accent-[#0a1728]"
          />
          <span>
            J'accepte les{' '}
            <Link to="/privacy" className="font-semibold text-[#048038] hover:underline">
              conditions d'utilisation
            </Link>
            .
          </span>
        </label>

        <ErrorBanner message={error} />

        <div className="mt-1">
          <SubmitButton isSubmitting={isSubmitting} disabled={!accepted} icon={ArrowRight} variant="brand">
            {isSubmitting ? 'Creation...' : 'Creer un compte'}
          </SubmitButton>
        </div>
      </form>
    </AuthSplitShell>
  )
}
