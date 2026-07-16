import { createFileRoute, redirect } from '@tanstack/react-router'
import { getAuthState, getInstallationState } from '~/server/auth'

export const Route = createFileRoute('/')({
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
    // Compte cree mais inscription abandonnee a l'etape 2 : on la reprend.
    if (auth.user) {
      throw redirect({ to: '/onboarding' })
    }
    throw redirect({ to: '/login', search: { redirect: undefined } })
  },
})
