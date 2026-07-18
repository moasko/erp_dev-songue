import { createFileRoute } from '@tanstack/react-router'
import { Search, ArrowRight, ArrowRightLeft } from 'lucide-react'
import { useState } from 'react'
import { getInventoryData } from '~/server/dataFetchers'
import { DateRangeFilter, matchesDatePreset, todayInputValue, type DatePreset } from '~/components/DateRangeFilter'

export const Route = createFileRoute('/$companySlug/inventory/transfers')({
  loader: async ({ params }) => getInventoryData({ data: { companySlug: params.companySlug } }),
  component: InventoryTransfers,
})

function InventoryTransfers() {
  const data = Route.useLoaderData()
  const [query, setQuery] = useState('')
  const [datePreset, setDatePreset] = useState<DatePreset>('all')
  const [startDate, setStartDate] = useState(todayInputValue())
  const [endDate, setEndDate] = useState(todayInputValue())

  const itemNames = new Map<string, string>(data.items.map((item: any) => [item.id, item.name]))
  const warehouseNames = new Map<string, string>(data.warehouses.map((warehouse: any) => [warehouse.id, warehouse.name]))

  const movements = data.movements.filter((movement: any) => {
    if (!matchesDatePreset(movement.date, datePreset, startDate, endDate)) return false
    const itemName = itemNames.get(movement.itemId) ?? ''
    return `${movement.reference} ${itemName} ${movement.reason ?? ''}`.toLowerCase().includes(query.toLowerCase())
  })

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">Mouvements & Transferts</h1>
          <p className="mt-1 text-sm text-slate-500">Historique des entrées et sorties de stock.</p>
        </div>
      </div>

      <div className="mb-6 space-y-3">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher par référence, produit..."
            className="w-full rounded border border-slate-300 pl-9 pr-4 py-2 text-sm focus:border-slate-950 outline-none"
          />
        </div>
        <DateRangeFilter
          preset={datePreset}
          startDate={startDate}
          endDate={endDate}
          onPresetChange={setDatePreset}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
        />
      </div>

      <div className="rounded border border-slate-200 bg-white overflow-hidden">
        {movements.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 font-semibold">Référence / Date</th>
                  <th className="px-4 py-3 font-semibold">Produit</th>
                  <th className="px-4 py-3 font-semibold">Type</th>
                  <th className="px-4 py-3 font-semibold">Parcours</th>
                  <th className="px-4 py-3 font-semibold text-right">Quantité</th>
                  <th className="px-4 py-3 font-semibold text-center">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {movements.map((movement: any) => {
                  const warehouse = warehouseNames.get(movement.warehouseId) ?? 'Depot'
                  const isIn = movement.type === 'In'

                  return (
                    <tr key={movement.id} className="list-row">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900">{movement.reference}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{new Date(movement.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900">{itemNames.get(movement.itemId) ?? movement.reference}</p>
                        {movement.reason ? <p className="text-xs text-slate-500 mt-0.5">{movement.reason}</p> : null}
                      </td>
                      <td className="px-4 py-3">
                        <span className={"inline-flex items-center text-xs font-semibold px-2 py-1 rounded " + (
                          isIn ? 'bg-slate-100 text-slate-800' : 'bg-slate-200 text-slate-700'
                        )}>
                          {isIn ? 'Entrée' : 'Sortie'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 text-slate-600">
                          <span className="truncate max-w-[150px] font-medium">{isIn ? 'Fournisseur' : warehouse}</span>
                          <ArrowRight className="size-3 text-slate-400 shrink-0" />
                          <span className="truncate max-w-[150px] font-medium">{isIn ? warehouse : 'Client'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-slate-900">{movement.quantity}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={"inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider " + (
                          movement.status === 'Completed' ? 'bg-slate-950 text-white' :
                          movement.status === 'Pending' ? 'bg-slate-200 text-slate-700' :
                          'bg-slate-100 text-slate-500'
                        )}>
                          {movement.status === 'Completed' ? 'Terminé' : movement.status === 'Pending' ? 'En cours' : 'Annulé'}
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
            <ArrowRightLeft className="mb-3 size-10 text-slate-300" />
            <p className="text-sm font-semibold">Aucun mouvement de stock.</p>
            <p className="mt-1 text-xs">Les ventes et réapprovisionnements apparaîtront ici.</p>
          </div>
        )}
      </div>
    </div>
  )
}
