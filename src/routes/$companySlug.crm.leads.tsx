import { createFileRoute, redirect } from '@tanstack/react-router'

// L'ajout et la liste des clients vivent desormais sur la page unique /crm :
// les anciens liens vers /crm/leads continuent de fonctionner.
export const Route = createFileRoute('/$companySlug/crm/leads')({
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/$companySlug/crm', params })
  },
})
