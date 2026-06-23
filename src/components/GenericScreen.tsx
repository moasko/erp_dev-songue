import { FilePlus, Search, SlidersHorizontal, Download } from 'lucide-react'

export function GenericScreen({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">{title}</h1>
          {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
        </div>
        <div className="flex items-center gap-2">
          <button className="inline-flex items-center gap-2 rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <Download className="size-4" />
            Exporter
          </button>
          <button className="inline-flex items-center gap-2 rounded bg-slate-950 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800">
            <FilePlus className="size-4" />
            Nouveau
          </button>
        </div>
      </div>
      
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="Rechercher..." 
            className="w-full rounded border border-slate-300 pl-9 pr-4 py-1.5 text-sm focus:border-slate-950 outline-none"
          />
        </div>
        <button className="inline-flex items-center gap-2 rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
          <SlidersHorizontal className="size-4" />
          Filtres
        </button>
      </div>

      <div className="rounded border border-slate-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 font-semibold">Référence</th>
                <th className="px-4 py-3 font-semibold">Détail</th>
                <th className="px-4 py-3 font-semibold">Statut</th>
                <th className="px-4 py-3 font-semibold">Dernière maj</th>
                <th className="px-4 py-3 font-semibold text-right">Valeur</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <tr key={i} className="list-row">
                  <td className="px-4 py-3 font-medium text-slate-950">REF-00{i}</td>
                  <td className="px-4 py-3 text-slate-600">Donnée d'exemple liée à {title.toLowerCase()}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                      Actif
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">20/05/2026</td>
                  <td className="px-4 py-3 text-right font-medium text-slate-900">{(i * 1250).toLocaleString()} FCFA</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
