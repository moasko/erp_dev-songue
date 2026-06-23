import { createFileRoute, Link } from '@tanstack/react-router'
import { Banknote, Boxes, Contact, ReceiptText, ShoppingCart } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { getDashboardData } from '~/server/dashboard'
import { useCompany } from '~/context/CompanyContext'
import { formatMoney } from '~/utils/currency'

export const Route = createFileRoute('/$companySlug/dashboard')({
  loader: async ({ params }) => getDashboardData({ data: { companySlug: params.companySlug } }),
  component: DashboardPage,
})

function DashboardPage() {
  const { companySlug } = Route.useParams()
  const { activeCompany } = useCompany()
  const { accounts, transactions, crmDeals, products } = Route.useLoaderData()

  const balance = accounts.reduce((sum: number, account: any) => sum + account.balance, 0)
  const monthIncome = transactions
    .filter((transaction: any) => transaction.type === 'Income')
    .reduce((sum: number, transaction: any) => sum + transaction.amount, 0)
  const unpaid = transactions.filter((transaction: any) => transaction.status === 'Pending')
  const lowStock = products.filter(
    (product: any) => product.type === 'Product' && product.stock !== null && product.stock <= (product.minStockLevel ?? 0),
  )
  const openClients = crmDeals.filter((deal: any) => deal.stageId !== 'Won' && deal.stageId !== 'Lost')

  const actions = [
    {
      title: 'Nouvelle vente',
      text: 'Ouvrir la caisse et encaisser rapidement.',
      icon: ShoppingCart,
      to: '/$companySlug/pos/register' as const,
    },
    {
      title: 'Ajouter un produit',
      text: 'Creer ou modifier un article vendu.',
      icon: Boxes,
      to: '/$companySlug/products-services' as const,
    },
    {
      title: 'Voir les factures',
      text: 'Suivre ce qui est paye ou en attente.',
      icon: ReceiptText,
      to: '/$companySlug/invoices' as const,
    },
  ]

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6">
        <p className="text-sm font-semibold text-slate-500">{activeCompany.name}</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-950">Resume du jour</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          Les chiffres utiles pour piloter les ventes, le stock et les paiements sans bruit.
        </p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard icon={Banknote} label="Argent disponible" value={formatMoney(balance)} />
        <MetricCard icon={ReceiptText} label="Ventes enregistrees" value={formatMoney(monthIncome)} />
        <MetricCard icon={Boxes} label="Stock bas" value={lowStock.length.toString()} />
        <MetricCard icon={Contact} label="Clients a suivre" value={openClients.length.toString()} />
      </section>

      <section className="mt-6 grid gap-5 lg:grid-cols-[1fr_0.8fr]">
        <div className="neon-surface rounded">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="font-bold text-slate-950">A traiter</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {lowStock.slice(0, 4).map((product: any) => (
              <ActionRow
                key={product.id}
                title={product.name}
                text={`${product.stock ?? 0} en stock, seuil ${product.minStockLevel ?? 0}`}
                to={`/${companySlug}/inventory`}
              />
            ))}
            {unpaid.slice(0, 3).map((transaction: any) => (
              <ActionRow
                key={transaction.id}
                title={transaction.description}
                text={`Paiement a verifier: ${formatMoney(transaction.amount)}`}
                to={`/${companySlug}/finance`}
              />
            ))}
            {lowStock.length === 0 && unpaid.length === 0 ? (
              <div className="px-5 py-8 text-sm text-slate-500">Rien d'urgent pour le moment.</div>
            ) : null}
          </div>
        </div>

        <div className="neon-surface rounded">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="font-bold text-slate-950">Actions rapides</h2>
          </div>
          <div className="grid gap-2 p-3">
            {actions.map((action) => {
              const Icon = action.icon
              return (
                <Link
                  key={action.title}
                  to={action.to}
                  params={{ companySlug }}
                  className="list-row flex items-start gap-3 rounded px-3 py-3"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded bg-slate-100 text-slate-700">
                    <Icon className="size-4" />
                  </span>
                  <span>
                    <span className="block text-sm font-bold text-slate-950">{action.title}</span>
                    <span className="mt-1 block text-xs leading-5 text-slate-500">{action.text}</span>
                  </span>
                </Link>
              )
            })}
          </div>
        </div>
      </section>
    </main>
  )
}

function MetricCard({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="neon-surface rounded p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-slate-500">{label}</span>
        <Icon className="size-4 text-slate-400" />
      </div>
      <p className="text-2xl font-bold text-slate-950">{value}</p>
    </div>
  )
}

function ActionRow({ title, text, to }: { title: string; text: string; to: string }) {
  return (
    <Link to={to as any} className="list-row block px-5 py-4">
      <p className="text-sm font-bold text-slate-950">{title}</p>
      <p className="mt-1 text-xs text-slate-500">{text}</p>
    </Link>
  )
}
