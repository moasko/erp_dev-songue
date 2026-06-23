import { createFileRoute, Link } from '@tanstack/react-router'
import { AlertTriangle, ArrowRight, ArrowRightLeft, Boxes, Package, PackageCheck, PackagePlus, Truck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { type CatalogItem } from '~/domain/catalogData'
import { posPurchaseOrders } from '~/domain/posData'
import { getCompanyFactor, useCompany } from '~/context/CompanyContext'
import { getInventoryData } from '~/server/dataFetchers'
import { formatMoney } from '~/utils/currency'

export const Route = createFileRoute('/$companySlug/inventory/')({
  loader: async ({ params }) => getInventoryData({ data: { companySlug: params.companySlug } }),
  component: InventoryDashboard,
})

function InventoryDashboard() {
  const { companySlug } = Route.useParams()
  const data = Route.useLoaderData()
  const { activeCompanyId } = useCompany()
  const factor = getCompanyFactor(activeCompanyId)
  const products = data.items.map(toCatalogItem).filter((item: CatalogItem) => item.type === 'Product')
  const movements = data.movements
  const [stockView, setStockView] = useState<'priority' | 'all'>('priority')
  const [message, setMessage] = useState('')

  const outOfStock = products.filter((item) => item.stock === 0)
  const lowStockProducts = products.filter((item) => item.stock !== null && item.minStockLevel !== undefined && item.stock > 0 && item.stock <= item.minStockLevel)
  const priorityProducts = [...outOfStock, ...lowStockProducts]
  const displayedProducts = stockView === 'priority' ? priorityProducts : products
  const totalStockItems = products.reduce((sum, item) => sum + (item.stock || 0), 0)
  const stockValue = products.reduce((sum, item) => sum + (item.stock ?? 0) * item.cost * factor, 0)
  const reorderEstimate = priorityProducts.reduce((sum, item) => sum + getSuggestedOrder(item) * item.cost * factor, 0)
  const suppliers = Array.from(new Set(products.map((item) => item.supplier).filter(Boolean)))

  const supplierText = useMemo(() => {
    if (suppliers.length === 0) return 'Aucun fournisseur'
    return `${suppliers.length} fournisseurs`
  }, [suppliers.length])

  function createPurchaseList() {
    if (priorityProducts.length === 0) {
      setMessage('Aucun produit prioritaire a commander pour le moment.')
      return
    }
    setMessage(`${priorityProducts.length} produits ajoutes a la liste de commande fournisseur.`)
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">Stock</h1>
          <p className="mt-1 text-sm text-slate-500">Voir les ruptures, preparer les commandes fournisseur et suivre les mouvements.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/$companySlug/products-services" params={{ companySlug }} className="inline-flex items-center gap-2 rounded border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <Package className="size-4" />
            Produits
          </Link>
          <button onClick={createPurchaseList} className="inline-flex items-center gap-2 rounded bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
            <Truck className="size-4" />
            Commander stock
          </button>
        </div>
      </div>

      {message ? (
        <div className="mb-6 rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          {message}
        </div>
      ) : null}

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
        <StatCard title="Articles en stock" value={Math.floor(totalStockItems * factor).toString()} icon={Boxes} detail="Quantite disponible" />
        <StatCard title="Valeur stock" value={formatMoney(stockValue)} icon={PackageCheck} detail="Cout d'achat estime" />
        <StatCard title="Alertes" value={priorityProducts.length.toString()} icon={AlertTriangle} detail={`${outOfStock.length} ruptures`} alert={priorityProducts.length > 0} />
        <StatCard title="A commander" value={formatMoney(reorderEstimate)} icon={Truck} detail={supplierText} alert={reorderEstimate > 0} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_380px]">
        <section className="rounded border border-slate-200 bg-white">
          <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-bold text-slate-950">Priorites stock</h2>
              <p className="text-xs text-slate-500">Les produits a traiter avant la prochaine grosse journee de vente.</p>
            </div>
            <div className="flex rounded border border-slate-200 bg-slate-50 p-1">
              <button onClick={() => setStockView('priority')} className={`rounded px-3 py-1.5 text-xs font-bold ${stockView === 'priority' ? 'bg-white text-slate-950 border border-slate-200' : 'text-slate-500'}`}>Priorites</button>
              <button onClick={() => setStockView('all')} className={`rounded px-3 py-1.5 text-xs font-bold ${stockView === 'all' ? 'bg-white text-slate-950 border border-slate-200' : 'text-slate-500'}`}>Tous</button>
            </div>
          </div>

          {displayedProducts.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full whitespace-nowrap text-left text-sm">
                <thead className="border-b border-slate-100 bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Produit</th>
                    <th className="px-5 py-3 text-right font-semibold">Stock</th>
                    <th className="px-5 py-3 text-right font-semibold">Seuil</th>
                    <th className="px-5 py-3 text-right font-semibold">A commander</th>
                    <th className="px-5 py-3 text-right font-semibold">Etat</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {displayedProducts.map((product) => {
                    const suggested = getSuggestedOrder(product)
                    const isOut = product.stock === 0
                    const isLow = product.stock !== null && product.minStockLevel !== undefined && product.stock <= product.minStockLevel

                    return (
                      <tr key={product.id} className="list-row">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded border border-slate-200 bg-slate-50">
                              {product.imageUrl ? <img src={product.imageUrl} alt="" className="size-full object-cover" /> : <Package className="size-4 text-slate-300" />}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate font-bold text-slate-950">{product.name}</p>
                              <p className="font-mono text-xs text-slate-400">{product.sku}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-right font-bold text-slate-950">{product.stock ?? 0}</td>
                        <td className="px-5 py-3 text-right text-slate-500">{product.minStockLevel ?? 0}</td>
                        <td className="px-5 py-3 text-right font-bold text-slate-950">{suggested}</td>
                        <td className="px-5 py-3 text-right">
                          <span className={`rounded px-2 py-1 text-xs font-bold ${isOut ? 'bg-rose-50 text-rose-700' : isLow ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                            {isOut ? 'Rupture' : isLow ? 'Faible' : 'OK'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-slate-500">
              <PackageCheck className="mb-3 size-12 text-slate-300" />
              <p className="text-sm font-semibold">Aucune alerte stock.</p>
              <p className="mt-1 text-xs">Les niveaux sont corrects pour le moment.</p>
            </div>
          )}
        </section>

        <aside className="space-y-6">
          <section className="rounded border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="font-bold text-slate-950">Commandes fournisseur</h2>
              <p className="text-xs text-slate-500">Les derniers bons de commande lies au stock.</p>
            </div>
            <div className="divide-y divide-slate-100">
              {posPurchaseOrders.map((order) => (
                <div key={order.id} className="list-row px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-slate-950">{order.reference}</p>
                      <p className="mt-1 truncate text-xs text-slate-500">{order.supplier} - ETA {order.eta}</p>
                    </div>
                    <span className="rounded bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600">{order.status}</span>
                  </div>
                  <p className="mt-3 text-sm font-bold text-slate-950">{formatMoney(order.amount * factor)}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="font-bold text-slate-950">Mouvements recents</h2>
              <Link to="/$companySlug/inventory/transfers" params={{ companySlug }} className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-slate-950">
                Voir <ArrowRight className="size-3" />
              </Link>
            </div>
            <div className="divide-y divide-slate-100">
              {movements.slice(0, 5).map((movement: any) => (
                <div key={movement.id} className="list-row flex items-center justify-between gap-4 px-5 py-3.5">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded bg-slate-50 text-slate-500">
                      <ArrowRightLeft className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-950">{products.find((item: CatalogItem) => item.id === movement.itemId)?.name ?? movement.reference}</p>
                      <p className="text-xs text-slate-500">{movement.type === 'In' ? 'Entree' : movement.type === 'Out' ? 'Sortie' : 'Transfert'}</p>
                    </div>
                  </div>
                  <span className="text-sm font-bold text-slate-950">{Math.ceil(movement.quantity * factor)}</span>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}

function getSuggestedOrder(product: CatalogItem) {
  if (product.type !== 'Product') return 0
  const stock = product.stock ?? 0
  const min = product.minStockLevel ?? 0
  if (stock > min) return 0
  return Math.max(min * 2 - stock, min)
}

function StatCard({ title, value, icon: Icon, detail, alert = false }: { title: string; value: string; icon: any; detail: string; alert?: boolean }) {
  return (
    <div className="rounded border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{title}</p>
        <Icon className={`size-4 ${alert ? 'text-rose-500' : 'text-slate-300'}`} />
      </div>
      <p className="text-2xl font-bold text-slate-950">{value}</p>
      <p className="mt-2 text-xs font-medium text-slate-500">{detail}</p>
    </div>
  )
}

function toCatalogItem(item: any): CatalogItem {
  return {
    id: item.id,
    name: item.name,
    sku: item.sku,
    type: item.type,
    categoryId: item.categoryId ?? '',
    description: item.description ?? undefined,
    supplier: item.supplier ?? undefined,
    price: item.price,
    wholesalePrice: item.wholesalePrice ?? 0,
    cost: item.cost ?? 0,
    currency: 'FCFA',
    stock: item.stock,
    minStockLevel: item.minStockLevel ?? undefined,
    status: item.status,
    createdAt: typeof item.createdAt === 'string' ? item.createdAt : item.createdAt.toISOString(),
    imageUrl: item.imageUrl ?? undefined,
  }
}
