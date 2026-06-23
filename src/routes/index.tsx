import { createFileRoute, redirect } from '@tanstack/react-router'
import { getInstallationState } from '~/server/auth'

export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    const installation = await getInstallationState()
    if (installation.needsSetup) {
      throw redirect({ to: '/register' })
    }
    throw redirect({ to: '/login', search: { redirect: undefined } })
  },
})
