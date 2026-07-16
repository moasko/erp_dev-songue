import { Link, createFileRoute, redirect } from '@tanstack/react-router'
import { ArrowRight, MailCheck } from 'lucide-react'
import * as React from 'react'
import { z } from 'zod'
import {
  AuthCard,
  AuthShell,
  BrandMark,
  ErrorBanner,
  PageHeading,
  Stepper,
  SubmitButton,
} from '~/components/AuthShell'
import { resendVerificationCode, verifyEmailCode } from '~/server/auth'

const searchSchema = z.object({ email: z.string().email() })

export const Route = createFileRoute('/verify')({
  validateSearch: searchSchema,
  // Sans email dans l'URL il n'y a rien a verifier : on renvoie a l'etape 1.
  onError: () => {
    throw redirect({ to: '/register' })
  },
  component: VerifyPage,
})

const codeLength = 6

// Etape 1b : confirmation de l'adresse email. La session n'est ouverte qu'ici,
// et l'etape 2 (/onboarding) en depend.
function VerifyPage() {
  const { email } = Route.useSearch()
  const [code, setCode] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [isResending, setIsResending] = React.useState(false)
  const [devCode, setDevCode] = React.useState<string | null>(null)

  React.useEffect(() => {
    const stored = window.sessionStorage.getItem('erp-dev-verification-code')
    if (stored) setDevCode(stored)
  }, [])

  async function submitCode(value: string) {
    setIsSubmitting(true)
    setError(null)
    setNotice(null)

    const result = await verifyEmailCode({ data: { email, code: value } })

    if (!result?.ok) {
      setError(result?.message ?? 'Code invalide.')
      setCode('')
      setIsSubmitting(false)
      return
    }

    window.sessionStorage.removeItem('erp-dev-verification-code')
    window.location.href = result.redirectTo
  }

  function handleCodeChange(raw: string) {
    const digits = raw.replace(/[^0-9]/g, '').slice(0, codeLength)
    setCode(digits)
    // Le code fait toujours 6 chiffres : inutile d'attendre un clic sur "Verifier".
    if (digits.length === codeLength && !isSubmitting) void submitCode(digits)
  }

  async function handleResend() {
    setIsResending(true)
    setError(null)
    setNotice(null)

    const result = await resendVerificationCode({ data: { email } })
    setIsResending(false)

    if (!result?.ok) {
      setError(result?.message ?? 'Impossible de renvoyer le code.')
      return
    }

    if (result.devCode) {
      window.sessionStorage.setItem('erp-dev-verification-code', result.devCode)
      setDevCode(result.devCode)
    }
    setNotice('Un nouveau code vient de partir.')
  }

  return (
    <AuthShell>
      <BrandMark subtitle="Creation de votre espace" />
      <AuthCard>
        <Stepper current={1} />

        <div className="mb-6 flex justify-center">
          <span className="grid size-12 place-items-center rounded-full bg-slate-100 text-slate-950">
            <MailCheck className="size-6" />
          </span>
        </div>

        <PageHeading title="Confirmez votre email" description={`Nous avons envoye un code a ${email}`} />

        <form
          onSubmit={(event) => {
            event.preventDefault()
            if (code.length === codeLength) void submitCode(code)
          }}
          className="mt-7 grid gap-4"
        >
          <label className="grid justify-items-center gap-2">
            <span className="text-sm font-semibold text-slate-700">Code a 6 chiffres</span>
            <input
              value={code}
              onChange={(event) => handleCodeChange(event.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              placeholder="000000"
              aria-label="Code de verification a 6 chiffres"
              className="h-14 w-56 rounded-lg border border-slate-300 bg-white text-center font-mono text-2xl font-bold tracking-[0.4em] text-slate-950 outline-none transition-colors focus:border-slate-950 focus:ring-2 focus:ring-slate-950/10 placeholder:text-slate-300"
            />
            <span className="text-xs text-slate-400">Le code expire dans 15 minutes.</span>
          </label>

          <ErrorBanner message={error} />

          {notice ? (
            <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
              {notice}
            </div>
          ) : null}

          {devCode ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Aucun service d envoi d email n est configure : le code est aussi affiche dans la console du serveur.
              <span className="ml-1 font-mono font-bold">{devCode}</span>
            </div>
          ) : null}

          <div className="mt-2">
            <SubmitButton isSubmitting={isSubmitting} disabled={code.length !== codeLength} icon={ArrowRight}>
              {isSubmitting ? 'Verification...' : 'Verifier'}
            </SubmitButton>
          </div>
        </form>

        <div className="mt-6 text-center text-sm text-slate-500">
          <button
            type="button"
            onClick={handleResend}
            disabled={isResending}
            className="font-semibold text-slate-950 hover:underline disabled:opacity-60"
          >
            {isResending ? 'Envoi...' : 'Renvoyer le code'}
          </button>
          <span className="mx-2 text-slate-300">|</span>
          <Link to="/register" className="font-semibold text-slate-950 hover:underline">
            Changer d adresse
          </Link>
        </div>
      </AuthCard>
    </AuthShell>
  )
}
