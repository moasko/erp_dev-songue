import { createFileRoute } from '@tanstack/react-router'
import { Search, SlidersHorizontal, ArrowRight, Download } from 'lucide-react'
import { inventoryMovements, inventoryWarehouses } from '~/domain/inventoryData'

export const Route = createFileRoute('/$companySlug/inventory/transfers')({
  component: InventoryTransfers,
})

function InventoryTransfers() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">Mouvements & Transferts</h1>
          <p className="mt-1 text-sm text-slate-500">Historique des entrées, sorties et transferts inter-entrepôts.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="inline-flex items-center gap-2 rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <Download className="size-4" />
            Exporter
          </button>
          <button className="inline-flex items-center gap-2 rounded bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
            Nouveau Transfert
          </button>
        </div>
      </div>
      
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
          <input type="text" placeholder="Rechercher par référence, produit..." className="w-full rounded border border-slate-300 pl-9 pr-4 py-2 text-sm focus:border-slate-950 outline-none" />
        </div>
        <button className="inline-flex items-center gap-2 rounded border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          <SlidersHorizontal className="size-4" />
          Filtres
        </button>
      </div>

      <div className="rounded border border-slate-200 bg-white overflow-hidden">
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
              {inventoryMovements.map((mov) => {
                const source = inventoryWarehouses.find(w => w.id === mov.sourceWarehouseId)?.name || 'Fournisseur'
                const dest = inventoryWarehouses.find(w => w.id === mov.destinationWarehouseId)?.name || 'Client'
                
                return (
                  <tr key={mov.id} className="list-row">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{mov.reference}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{new Date(mov.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{mov.itemName}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={"inline-flex items-center text-xs font-semibold px-2 py-1 rounded " + (
                        mov.type === 'In' ? 'bg-slate-100 text-slate-800' :
                        mov.type === 'Out' ? 'bg-slate-200 text-slate-700' :
                        'bg-slate-950 text-white'
                      )}>
                        {mov.type === 'In' ? 'Entrée' : mov.type === 'Out' ? 'Sortie' : 'Transfert'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 text-slate-600">
                        <span className="truncate max-w-[150px] font-medium">{mov.type === 'In' ? 'Fournisseur' : source}</span>
                        <ArrowRight className="size-3 text-slate-400 shrink-0" />
                        <span className="truncate max-w-[150px] font-medium">{mov.type === 'Out' ? 'Client' : dest}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900">{mov.quantity}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={"inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider " + (
                        mov.status === 'Completed' ? 'bg-slate-950 text-white' :
                        mov.status === 'Pending' ? 'bg-slate-200 text-slate-700' :
                        'bg-slate-100 text-slate-500'
                      )}>
                        {mov.status === 'Completed' ? 'Terminé' : mov.status === 'Pending' ? 'En cours' : 'Annulé'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
