import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/$companySlug/users')({
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/$companySlug/settings', params })
  },
})
