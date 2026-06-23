import type { ErpSection } from '~/domain/erpSections'

export function ErpSectionPage({ section }: { section: ErpSection }) {
  const Icon = section.icon
  const columns = Object.keys(section.records[0] ?? {})

  return (
    <section className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
      <div className="mb-4 flex flex-col justify-between gap-3 xl:flex-row xl:items-end">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{section.eyebrow}</p>
          <div className="mt-1 flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded bg-slate-950 text-white">
              <Icon className="size-4" />
            </span>
            <h1 className="text-xl font-bold text-slate-950">{section.title}</h1>
          </div>
          <p className="mt-2 max-w-3xl text-xs leading-6 text-slate-500">{section.description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {section.actions.slice(0, 3).map((action, index) => (
            <button
              key={action}
              className={`rounded px-3 py-2 text-sm font-semibold ${
                index === 0
                  ? 'bg-slate-950 text-white'
                  : 'border border-slate-300 bg-white text-slate-700'
              }`}
            >
              {action}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {section.metrics.map((metric) => (
          <div key={metric.label} className="rounded border border-slate-200 bg-white p-4">
            <p className="text-sm font-semibold text-slate-500">{metric.label}</p>
            <p className="mt-3 text-2xl font-bold text-slate-950">{metric.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_340px]">
        <div className="overflow-hidden rounded border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-3">
            <h2 className="font-bold text-slate-950">Operations recentes</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  {columns.map((column) => (
                    <th key={column} className="px-4 py-3 font-semibold">{column}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {section.records.map((record, index) => (
                  <tr key={index} className="list-row border-t border-slate-100">
                    {columns.map((column) => (
                      <td key={column} className="px-4 py-3 font-medium text-slate-700">
                        {record[column]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <aside>
          <div className="rounded border border-slate-200 bg-white p-4">
            <h2 className="font-bold text-slate-950">Actions disponibles</h2>
            <div className="mt-3 grid gap-2">
              {section.actions.map((action) => (
                <button key={action} className="rounded border border-slate-200 px-3 py-2 text-left text-sm font-medium text-slate-700 hover:border-slate-400">
                  {action}
                </button>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </section>
  )
}
