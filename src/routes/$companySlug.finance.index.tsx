import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { Activity, ArrowDownRight, ArrowUpRight, Banknote, Check, CreditCard, Landmark, Plus, ReceiptText, X } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { DateRangeFilter, matchesDatePreset, todayInputValue, type DatePreset } from '~/components/DateRangeFilter'
import { getFinanceData } from '~/server/dataFetchers'
import { createFinanceTransaction } from '~/server/operations'
import { useCompany } from '~/context/CompanyContext'
import { formatMoney, formatSignedMoney } from '~/utils/currency'

export const Route = createFileRoute('/$companySlug/finance/')({
  loader: async ({ params }) => getFinanceData({ data: { companySlug: params.companySlug } }),
  component: FinanceDashboard,
})

function FinanceDashboard() {
  const { companySlug } = Route.useParams()
  const router = useRouter()
  const { accounts, transactions } = Route.useLoaderData()
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [expenseForm, setExpenseForm] = useState({ description: '', amount: '', category: 'Charges', accountId: accounts[0]?.id ?? '' })
  const [datePreset, setDatePreset] = useState<DatePreset>('month')
  const [startDate, setStartDate] = useState(todayInputValue())
  const [endDate, setEndDate] = useState(todayInputValue())

  const totalBalance = accounts.reduce((sum: number, acc: any) => sum + acc.balance, 0)
  const periodTransactions = transactions.filter((tx: any) => matchesDatePreset(tx.date, datePreset, startDate, endDate))
  const totalIncome = periodTransactions.filter((tx: any) => tx.type === 'Income').reduce((sum: number, tx: any) => sum + tx.amount, 0)
  const totalExpense = periodTransactions.filter((tx: any) => tx.type === 'Expense').reduce((sum: number, tx: any) => sum + tx.amount, 0)
  const profit = totalIncome - totalExpense
  const pending = periodTransactions.filter((tx: any) => tx.status === 'Pending')

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">Argent</h1>
          <p className="mt-1 text-sm text-slate-500">Cash, mobile money, carte, depenses et benefice estime.</p>
        </div>
        <button onClick={() => setIsExpenseModalOpen(true)} className="inline-flex items-center gap-2 rounded bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
          <Plus className="size-4" />
          Ajouter depense
        </button>
      </div>

      {message ? <div className="mb-6 rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{message}</div> : null}

      <div className="mb-6">
        <DateRangeFilter
          preset={datePreset}
          startDate={startDate}
          endDate={endDate}
          onPresetChange={setDatePreset}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
        />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
        <StatCard title="Solde disponible" value={formatMoney(totalBalance)} icon={Banknote} detail="Caisse + comptes" />
        <StatCard title="Entrees periode" value={formatMoney(totalIncome)} icon={ArrowUpRight} detail="Ventes et paiements" />
        <StatCard title="Depenses periode" value={formatMoney(totalExpense)} icon={ArrowDownRight} detail="Achats et charges" alert={totalExpense > totalIncome} />
        <StatCard title="Benefice estime" value={formatSignedMoney(Math.abs(profit), profit >= 0 ? '+' : '-')} icon={Activity} detail={`${pending.length} a verifier`} alert={profit < 0} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="rounded border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-bold text-slate-950">Comptes & caisse</h2>
            <p className="text-xs text-slate-500">Ou se trouve l argent disponible.</p>
          </div>
          <div className="divide-y divide-slate-100">
            {accounts.map((account: any) => (
              <div key={account.id} className="list-row flex items-center justify-between gap-4 px-5 py-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded bg-slate-50 text-slate-600">
                    {account.type === 'Checking' || account.type === 'Savings' ? <Landmark className="size-5" /> : account.type === 'Cash' ? <Banknote className="size-5" /> : <CreditCard className="size-5" />}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-bold text-slate-950">{account.type === 'Cash' ? 'Caisse boutique' : account.name}</p>
                    <p className="truncate text-xs text-slate-500">{account.accountNumber ?? ''}</p>
                  </div>
                </div>
                <p className="shrink-0 text-sm font-bold text-slate-950">{formatMoney(account.balance)}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="font-bold text-slate-950">Derniers mouvements</h2>
              <p className="text-xs text-slate-500">Entrees, depenses et validations recentes.</p>
            </div>
            <Link to="/$companySlug/finance/revenues" params={{ companySlug }} className="text-xs font-bold text-slate-500 hover:text-slate-950">
              Historique
            </Link>
          </div>
          <div className="divide-y divide-slate-100">
            {periodTransactions.slice(0, 6).map((tx: any) => (
              <div key={tx.id} className="list-row flex items-center justify-between gap-4 px-5 py-3.5">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded bg-slate-50 text-slate-600">
                    {tx.type === 'Income' ? <ArrowUpRight className="size-4" /> : <ArrowDownRight className="size-4" />}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-950">{tx.description}</p>
                    <p className="truncate text-xs text-slate-500">{new Date(tx.date).toLocaleDateString('fr-FR')} - {tx.category}</p>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold text-slate-950">{formatSignedMoney(tx.amount, tx.type === 'Income' ? '+' : '-')}</p>
                  {tx.status === 'Pending' ? <p className="mt-1 text-[11px] font-bold text-amber-700">A verifier</p> : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <QuickAction to={`/${companySlug}/pos/register`} title="Encaisser" text="Ouvrir la caisse POS." icon={ReceiptText} />
        <QuickAction to={`/${companySlug}/finance/expenses`} title="Depense" text="Noter achat, loyer ou charge." icon={ArrowDownRight} />
        <QuickAction to={`/${companySlug}/invoices`} title="Facture" text="Suivre facture et paiement." icon={Landmark} />
      </section>

      {isExpenseModalOpen ? (
        <Modal title="Ajouter une depense" onClose={() => setIsExpenseModalOpen(false)}>
          <form onSubmit={addExpense} className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-400">Libelle</span>
              <input value={expenseForm.description} onChange={(event) => setExpenseForm((current) => ({ ...current, description: event.target.value }))} className="w-full rounded border border-slate-300 px-3 py-2 text-sm font-semibold outline-none focus:border-slate-950" required />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-400">Montant</span>
                <input value={expenseForm.amount} onChange={(event) => setExpenseForm((current) => ({ ...current, amount: event.target.value }))} type="number" min="1" className="w-full rounded border border-slate-300 px-3 py-2 text-sm font-semibold outline-none focus:border-slate-950" required />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-400">Categorie</span>
                <select value={expenseForm.category} onChange={(event) => setExpenseForm((current) => ({ ...current, category: event.target.value }))} className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-slate-950">
                  <option>Charges</option>
                  <option>Achat stock</option>
                  <option>Loyer</option>
                  <option>Transport</option>
                  <option>Marketing</option>
                </select>
              </label>
            </div>
            <label className="block">
              <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-400">Compte</span>
              <select value={expenseForm.accountId} onChange={(event) => setExpenseForm((current) => ({ ...current, accountId: event.target.value }))} className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-slate-950">
                {accounts.map((account: any) => <option key={account.id} value={account.id}>{account.name}</option>)}
              </select>
            </label>
            <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setIsExpenseModalOpen(false)} className="inline-flex items-center justify-center gap-2 rounded border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><X className="size-4" /> Annuler</button>
              <button type="submit" className="inline-flex items-center justify-center gap-2 rounded bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"><Check className="size-4" /> Enregistrer</button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  )

  async function addExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const amount = Number(expenseForm.amount)
    if (!expenseForm.description.trim() || !Number.isFinite(amount) || amount <= 0) {
      setMessage('Renseigne un libelle et un montant valide.')
      return
    }
    await createFinanceTransaction({
      data: {
        companySlug,
        accountId: expenseForm.accountId || undefined,
        description: expenseForm.description,
        amount,
        type: 'Expense',
        category: expenseForm.category,
      },
    })
    setIsExpenseModalOpen(false)
    setExpenseForm({ description: '', amount: '', category: 'Charges', accountId: accounts[0]?.id ?? '' })
    setMessage('Depense enregistree et solde du compte mis a jour.')
    await router.invalidate()
  }
}

function StatCard({ title, value, icon: Icon, detail, alert = false }: { title: string; value: string; icon: any; detail: string; alert?: boolean }) {
  return (
    <div className="rounded border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">{title}</h3>
        <Icon className={`size-4 ${alert ? 'text-rose-500' : 'text-slate-300'}`} />
      </div>
      <p className="text-2xl font-bold text-slate-950">{value}</p>
      <p className="mt-2 text-xs font-medium text-slate-500">{detail}</p>
    </div>
  )
}

function QuickAction({ to, title, text, icon: Icon }: { to: string; title: string; text: string; icon: any }) {
  return (
    <Link to={to as any} className="rounded border border-slate-200 bg-white p-5 transition hover:border-slate-300">
      <Icon className="mb-4 size-5 text-slate-400" />
      <h3 className="font-bold text-slate-950">{title}</h3>
      <p className="mt-2 text-sm text-slate-500">{text}</p>
    </Link>
  )
}

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/40 px-4 py-8 sm:items-center" role="dialog" aria-modal="true">
      <div className="w-full max-w-xl rounded border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-bold text-slate-950">{title}</h2>
          <button type="button" onClick={onClose} className="inline-flex size-9 items-center justify-center rounded border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900" aria-label="Fermer"><X className="size-4" /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}
