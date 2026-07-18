import { createFileRoute } from '@tanstack/react-router'
import { Banknote, CreditCard, Landmark } from 'lucide-react'
import { StatCard } from '~/components/StatCard'
import { getFinanceData } from '~/server/dataFetchers'
import { useMoney } from '~/context/CompanyContext'

export const Route = createFileRoute('/$companySlug/finance/bank-accounts')({
  loader: async ({ params }) => getFinanceData({ data: { companySlug: params.companySlug } }),
  component: BankAccountsPage,
})

function BankAccountsPage() {
  const { formatMoney } = useMoney()
  const { accounts } = Route.useLoaderData()
  const total = accounts.reduce((sum: number, account: any) => sum + account.balance, 0)

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-950">Comptes & caisse</h1>
        <p className="mt-1 text-sm text-slate-500">Comptes bancaires, caisse physique, cartes et soldes disponibles.</p>
      </div>
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3">
        <AccountStat title="Solde total" value={formatMoney(total)} />
        <AccountStat title="Comptes actifs" value={accounts.length.toString()} />
        <AccountStat title="Devises" value={new Set(accounts.map((account: any) => account.currency)).size.toString()} />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {accounts.length ? accounts.map((account: any) => <AccountCard key={account.id} account={account} />) : (
          <div className="neon-surface rounded p-6 text-sm text-slate-500">Aucun compte configure.</div>
        )}
      </div>
    </main>
  )
}

function AccountStat({ title, value }: { title: string; value: string }) {
  return <StatCard title={title} value={value} />
}

function AccountCard({ account }: { account: any }) {
  const { formatMoney } = useMoney()
  const Icon = account.type === 'Cash' ? Banknote : account.type === 'CreditCard' ? CreditCard : Landmark

  return (
    <div className="neon-surface rounded p-5">
      <div className="mb-5 flex items-center justify-between">
        <div className="flex size-10 items-center justify-center rounded bg-slate-100 text-slate-600">
          <Icon className="size-5" />
        </div>
        <span className="rounded bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">{account.status}</span>
      </div>
      <h2 className="font-bold text-slate-950">{account.name}</h2>
      <p className="mt-1 text-xs text-slate-500">{account.accountNumber ?? account.type}</p>
      <p className="mt-5 text-2xl font-bold text-slate-950">{formatMoney(account.balance)}</p>
    </div>
  )
}
