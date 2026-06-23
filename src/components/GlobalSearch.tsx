import { useNavigate } from '@tanstack/react-router'
import { FileCheck2, Package, ReceiptText, Search, Truck, Users, X } from 'lucide-react'
import * as React from 'react'
import { searchCompanyData } from '~/server/dataFetchers'

type SearchResult = {
  id: string
  type: string
  title: string
  subtitle: string
  to: string
}

const typeIcons: Record<string, any> = {
  Client: Users,
  Produit: Package,
  Service: Package,
  Facture: ReceiptText,
  Ticket: ReceiptText,
  Depense: ReceiptText,
  Devis: FileCheck2,
  Fournisseur: Truck,
}

export function GlobalSearch({ companySlug }: { companySlug: string }) {
  const navigate = useNavigate()
  const [query, setQuery] = React.useState('')
  const [results, setResults] = React.useState<SearchResult[]>([])
  const [isOpen, setIsOpen] = React.useState(false)
  const [isLoading, setIsLoading] = React.useState(false)
  const searchRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  React.useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < 2) {
      setResults([])
      setIsLoading(false)
      return
    }

    let isCurrent = true
    setIsLoading(true)
    const timeout = window.setTimeout(() => {
      searchCompanyData({ data: { companySlug, query: trimmed } })
        .then((nextResults) => {
          if (isCurrent) setResults(nextResults as SearchResult[])
        })
        .catch(() => {
          if (isCurrent) setResults([])
        })
        .finally(() => {
          if (isCurrent) setIsLoading(false)
        })
    }, 180)

    return () => {
      isCurrent = false
      window.clearTimeout(timeout)
    }
  }, [companySlug, query])

  function clearSearch() {
    setQuery('')
    setResults([])
    setIsOpen(false)
  }

  async function goToResult(result: SearchResult) {
    clearSearch()
    await navigate({ to: result.to as any })
  }

  return (
    <div ref={searchRef} className="relative w-full max-w-xl">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
      <input
        value={query}
        onFocus={() => setIsOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value)
          setIsOpen(true)
        }}
        placeholder="Rechercher client, facture, produit..."
        className="h-9 w-full rounded border border-slate-200 bg-white py-2 pl-9 pr-9 text-sm font-semibold text-slate-950 outline-none transition focus:border-slate-950"
      />
      {query ? (
        <button
          type="button"
          onClick={clearSearch}
          className="absolute right-2 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          aria-label="Effacer la recherche"
        >
          <X className="size-4" />
        </button>
      ) : null}

      {isOpen && query.trim().length >= 2 ? (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded border border-slate-200 bg-white shadow-xl">
          {isLoading ? (
            <div className="px-4 py-4 text-sm font-semibold text-slate-500">Recherche...</div>
          ) : results.length ? (
            <div className="max-h-[24rem] overflow-y-auto py-1">
              {results.map((result) => {
                const Icon = typeIcons[result.type] ?? Search
                return (
                  <button
                    key={`${result.type}-${result.id}`}
                    type="button"
                    onClick={() => void goToResult(result)}
                    className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-50"
                  >
                    <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded bg-slate-100 text-slate-600">
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-bold text-slate-950">{result.title}</span>
                        <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-500">{result.type}</span>
                      </span>
                      <span className="mt-1 block truncate text-xs font-medium text-slate-500">{result.subtitle}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="px-4 py-4 text-sm font-semibold text-slate-500">Aucun resultat trouve.</div>
          )}
        </div>
      ) : null}
    </div>
  )
}
