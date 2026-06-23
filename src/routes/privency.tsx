import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/privency')({
  beforeLoad: () => {
    throw redirect({ to: '/privacy' })
  },
})
