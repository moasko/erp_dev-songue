import { createFileRoute, Link } from '@tanstack/react-router'
import { AlertTriangle, ArrowRight, FileText, Handshake, PackageCheck, ReceiptText, Truck } from 'lucide-react'
import { DateRangeFilter, matchesDatePreset, todayInputValue, type DatePreset } from '~/components/DateRangeFilter'
import { getPurchasesData } from '~/server/dataFetchers'
import { formatMoney } from '~/utils/currency'
import { useState } from 'react'

export const Route = createFileRoute('/$companySlug/purchases/')({
  loader: async ({ params }) => getPurchasesData({ data: { companySlug: params.companySlug } }),
  component: PurchasesDashboard,
})

function PurchasesDashboard() {
  const { companySlug } = Route.useParams()
  const { vendors, purchaseInvoices, stockAlerts } = Route.useLoaderData()
  const [datePreset, setDatePreset] = useState<DatePreset>('month')
  const [startDate, setStartDate] = useState(todayInputValue())
  const [endDate, setEndDate] = useState(todayInputValue())

  const periodInvoices = purchaseInvoices.filter((invoice: any) => matchesDatePreset(invoice.date, datePreset, startDate, endDate))
  const totalPurchases = periodInvoices.reduce((sum: number, invoice: any) => sum + invoice.amount, 0)
  const pendingInvoices = periodInvoices.filter((invoice: any) => invoice.status === 'Pending')
  const activeVendors = vendors.filter((vendor: any) => vendor.status !== 'Suspendu')
  const riskVendors = vendors.filter((vendor: any) => vendor.risk === 'Eleve' || vendor.status === 'A surveiller')
  const topCategories = Array.from(
    periodInvoices.reduce((map: Map<string, number>, invoice: any) => {
      map.set(invoice.category, (map.get(invoice.category) ?? 0) + invoice.amount)
      return map
    }, new Map<string, number>()),
  ).sort((a, b) => b[1] - a[1]).slice(0, 4)

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Achats</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-950">Resume achats</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">Suivi des depenses fournisseurs, factures achats, risques et besoins de reapprovisionnement.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/$companySlug/purchases/invoices" params={{ companySlug }} className="inline-flex h-10 items-center gap-2 rounded border border-slate-300 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50">
            <ReceiptText className="size-4" />
            Factures achats
          </Link>
          <Link to="/$companySlug/purchases/vendors" params={{ companySlug }} className="inline-flex h-10 items-center gap-2 rounded bg-slate-950 px-4 text-sm font-bold text-white hover:bg-slate-800">
            <Handshake className="size-4" />
            Fournisseurs
          </Link>
        </div>
      </div>

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

      <section className="mb-6 grid gap-4 md:grid-cols-4">
        <Metric title="Achats periode" value={formatMoney(totalPurchases)} detail={`${periodInvoices.length} facture(s)`} icon={FileText} />
        <Metric title="A verifier" value={pendingInvoices.length.toString()} detail="Factures en attente" icon={AlertTriangle} alert={pendingInvoices.length > 0} />
        <Metric title="Fournisseurs actifs" value={activeVendors.length.toString()} detail={`${riskVendors.length} a surveiller`} icon={Truck} alert={riskVendors.length > 0} />
        <Metric title="Stock a commander" value={stockAlerts.length.toString()} detail="Produits sous seuil" icon={PackageCheck} alert={stockAlerts.length > 0} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="neon-surface overflow-hidden rounded">
          <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
            <div>
              <h2 className="font-bold text-slate-950">Dernieres factures achats</h2>
              <p className="text-xs text-slate-500">Depenses et paiements fournisseurs sur la periode.</p>
            </div>
            <Link to="/$companySlug/purchases/invoices" params={{ companySlug }} className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-950">
              Voir tout <ArrowRight className="size-3" />
            </Link>
          </div>
          <div className="divide-y divide-slate-100">
            {periodInvoices.length ? periodInvoices.slice(0, 8).map((invoice: any) => (
              <div key={invoice.id} className="list-row flex items-center justify-between gap-4 px-5 py-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-950">{invoice.description}</p>
                  <p className="mt-1 truncate text-xs text-slate-500">{invoice.reference ?? invoice.category} - {new Date(invoice.date).toLocaleDateString('fr-FR')}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold text-slate-950">{formatMoney(invoice.amount)}</p>
                  <p className="mt-1 text-[11px] font-bold uppercase text-slate-400">{invoice.status}</p>
                </div>
              </div>
            )) : (
              <p className="px-5 py-8 text-sm text-slate-500">Aucune facture achat sur cette periode.</p>
            )}
          </div>
        </div>

        <aside className="space-y-6">
          <section className="neon-surface rounded">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="font-bold text-slate-950">Categories achats</h2>
              <p className="text-xs text-slate-500">Repartition des depenses filtrees.</p>
            </div>
            <div className="space-y-3 p-5">
              {topCategories.length ? topCategories.map(([category, amount]) => (
                <div key={category} className="flex items-center justify-between gap-3">
                  <span className="truncate text-sm font-semibold text-slate-600">{category}</span>
                  <span className="shrink-0 text-sm font-bold text-slate-950">{formatMoney(amount)}</span>
                </div>
              )) : (
                <p className="text-sm text-slate-500">Pas encore de categorie sur cette periode.</p>
              )}
            </div>
          </section>

          <section className="neon-surface rounded">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="font-bold text-slate-950">Priorites</h2>
              <p className="text-xs text-slate-500">Actions achats a traiter en premier.</p>
            </div>
            <div className="divide-y divide-slate-100">
              {stockAlerts.slice(0, 4).map((item: any) => (
                <Link key={item.id} to={`/${companySlug}/inventory` as any} className="list-row block px-5 py-4">
                  <p className="text-sm font-bold text-slate-950">{item.name}</p>
                  <p className="mt-1 text-xs text-slate-500">Stock {item.stock ?? 0}, seuil {item.minStockLevel ?? 0}</p>
                </Link>
              ))}
              {riskVendors.slice(0, 3).map((vendor: any) => (
                <Link key={vendor.id} to={`/${companySlug}/purchases/vendors` as any} className="list-row block px-5 py-4">
                  <p className="text-sm font-bold text-slate-950">{vendor.name}</p>
                  <p className="mt-1 text-xs text-slate-500">Risque {vendor.risk} - {vendor.status}</p>
                </Link>
              ))}
              {stockAlerts.length === 0 && riskVendors.length === 0 ? (
                <p className="px-5 py-8 text-sm text-slate-500">Aucune priorite achat.</p>
              ) : null}
            </div>
          </section>
        </aside>
      </section>
    </main>
  )
}

function Metric({ title, value, detail, icon: Icon, alert = false }: { title: string; value: string; detail: string; icon: any; alert?: boolean }) {
  return (
    <div className="neon-surface rounded p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{title}</p>
        <Icon className={`size-4 ${alert ? 'text-rose-500' : 'text-slate-300'}`} />
      </div>
      <p className="text-2xl font-bold text-slate-950">{value}</p>
      <p className="mt-2 text-xs font-medium text-slate-500">{detail}</p>
    </div>
  )
}
