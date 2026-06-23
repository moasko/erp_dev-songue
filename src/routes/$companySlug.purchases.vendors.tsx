import { createFileRoute, useRouter } from '@tanstack/react-router'
import { getVendorData } from '~/server/dataFetchers'
import { createVendor, deleteVendor, updateVendor } from '~/server/operations'
import { useState, type FormEvent } from 'react'
import {
  AlertTriangle,
  BadgeCheck,
  BarChart3,
  Boxes,
  CalendarClock,
  Download,
  FileCheck2,
  FilePlus,
  Filter,
  Handshake,
  Mail,
  MoreHorizontal,
  Phone,
  Search,
  ShieldCheck,
  Star,
  Truck,
  X,
  Check,
  Trash2,
  Pause,
  Play,
} from 'lucide-react'

type VendorStatus = 'Strategique' | 'Actif' | 'A surveiller' | 'Suspendu'
type VendorRisk = 'Faible' | 'Moyen' | 'Eleve'

type Vendor = {
  name: string
  category: string
  owner: string
  city: string
  spend: string
  orders: number
  onTime: number
  quality: number
  risk: VendorRisk
  status: VendorStatus
  nextReview: string
  contract: string
  paymentTerms: string
  email: string
  phone: string
}



function parseFrenchDate(dateStr: string) {
  if (!dateStr) return 0
  const parts = dateStr.split('/')
  if (parts.length === 3) {
    return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`).getTime()
  }
  return 0
}



function statusClass(status: VendorStatus) {
  if (status === 'Strategique') return 'bg-emerald-100 text-emerald-700'
  if (status === 'Actif') return 'bg-sky-100 text-sky-700'
  if (status === 'A surveiller') return 'bg-amber-100 text-amber-700'
  return 'bg-rose-100 text-rose-700'
}

function riskClass(risk: VendorRisk) {
  if (risk === 'Faible') return 'bg-emerald-100 text-emerald-700'
  if (risk === 'Moyen') return 'bg-amber-100 text-amber-700'
  return 'bg-rose-100 text-rose-700'
}

function ScoreBar({ value }: { value: number }) {
  return (
    <div className="flex min-w-28 items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded bg-slate-100">
        <div className="h-full rounded bg-slate-950" style={{ width: `${value}%` }} />
      </div>
      <span className="w-9 text-right text-xs font-bold text-slate-700">{value}%</span>
    </div>
  )
}

function VendorsPage() {
  const { vendors: initialVendors } = Route.useLoaderData()
  const { companySlug } = Route.useParams()
  const router = useRouter()

  const [vendors, setVendors] = useState<any[]>(initialVendors)
  const [selectedVendor, setSelectedVendor] = useState<any | null>(initialVendors[0] || null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    owner: '',
    city: '',
    email: '',
    phone: '',
    contract: '',
    paymentTerms: '30 jours'
  })

  // Statistiques dynamiques
  const strategicCount = vendors.filter(v => v.status === 'Strategique').length
  const strategicPercent = vendors.length ? Math.round((strategicCount / vendors.length) * 100) : 0
  const withContractCount = vendors.filter(v => v.contract && v.contract.toLowerCase() !== 'aucun').length
  const highRiskCount = vendors.filter(v => v.risk === 'Eleve').length
  const avgOtif = vendors.length ? Math.round(vendors.reduce((sum, v) => sum + (v.onTime || 0), 0) / vendors.length) : 0

  const dynamicSegments = [
    { label: 'Strategiques', value: strategicCount.toString(), detail: `${strategicPercent}% du total`, icon: Star },
    { label: 'Sous contrat', value: withContractCount.toString(), detail: 'Partenaires actifs', icon: FileCheck2 },
    { label: 'Risque eleve', value: highRiskCount.toString(), detail: 'A surveiller', icon: AlertTriangle },
    { label: 'Livraison OTIF', value: `${avgOtif}%`, detail: 'Moyenne globale', icon: Truck },
  ]

  // Revue prioritaire dynamique
  const dynamicReviewQueue = [...vendors]
    .filter(v => v.status === 'A surveiller' || v.risk === 'Eleve' || v.risk === 'Moyen')
    .sort((a, b) => parseFrenchDate(a.nextReview) - parseFrenchDate(b.nextReview))
    .slice(0, 3)
    .map(v => ({
      vendor: v.name,
      action: v.risk === 'Eleve' ? 'Gerer le risque eleve' : 'Revue de performance',
      due: v.nextReview.substring(0, 5), // DD/MM
      priority: v.risk === 'Eleve' ? 'Urgent' : (v.risk === 'Moyen' ? 'Haute' : 'Normale')
    }))

  // Contrats dynamiques
  const renewContracts = vendors.filter(v => v.contract?.toLowerCase().includes('renouveler')).length
  const noContracts = vendors.filter(v => !v.contract || v.contract.toLowerCase() === 'aucun').length
  const validContracts = vendors.length - renewContracts - noContracts

  const dynamicContracts = [
    { label: 'Contrats actifs', value: validContracts, tone: 'bg-emerald-100 text-emerald-700' },
    { label: 'A renouveler', value: renewContracts, tone: 'bg-amber-100 text-amber-700' },
    { label: 'Sans accord cadre', value: noContracts, tone: 'bg-sky-100 text-sky-700' },
  ]

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    try {
      const newVendor = await createVendor({
        data: {
          companySlug,
          ...formData
        }
      })
      setVendors(v => [newVendor as any, ...v])
      setIsModalOpen(false)
      setFormData({ name: '', category: '', owner: '', city: '', email: '', phone: '', contract: '', paymentTerms: '30 jours' })
      router.invalidate()
    } catch (err) {
      console.error(err)
      alert("Erreur lors de la creation du fournisseur")
    }
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!window.confirm("Supprimer ce fournisseur ?")) return
    try {
      await deleteVendor({ data: { companySlug, id } })
      setVendors(v => v.filter(vendor => vendor.id !== id))
      if (selectedVendor?.id === id) setSelectedVendor(null)
      router.invalidate()
    } catch (err) {
      console.error(err)
      alert("Erreur lors de la suppression")
    }
  }

  async function handleToggleStatus(vendor: any, e: React.MouseEvent) {
    e.stopPropagation()
    const newStatus = vendor.status === 'Actif' ? 'Suspendu' : 'Actif'
    try {
      const updated = await updateVendor({ data: { companySlug, id: vendor.id, status: newStatus } })
      setVendors(v => v.map(item => item.id === vendor.id ? updated : item))
      if (selectedVendor?.id === vendor.id) setSelectedVendor(updated)
      router.invalidate()
    } catch (err) {
      console.error(err)
      alert("Erreur lors de la mise a jour")
    }
  }

  return (
    <section className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
      <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-4 xl:flex-row xl:items-end">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Achats</p>
          <div className="mt-1 flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded bg-slate-950 text-white">
              <Handshake className="size-4" />
            </span>
            <h1 className="text-xl font-bold text-slate-950">Gestion fournisseurs avancee</h1>
          </div>
          <p className="mt-2 max-w-3xl text-xs leading-6 text-slate-500">
            Pilotage des fournisseurs, scoring performance, contrats, risques et plans d'action achats.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button className="inline-flex items-center gap-2 rounded border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <Download className="size-4" />
            Exporter
          </button>
          <button onClick={() => setIsModalOpen(true)} className="inline-flex items-center gap-2 rounded bg-slate-950 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800">
            <FilePlus className="size-4" />
            Nouveau fournisseur
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {dynamicSegments.map((segment) => {
          const Icon = segment.icon
          return (
            <div key={segment.label} className="rounded border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-500">{segment.label}</p>
                  <p className="mt-3 text-2xl font-bold text-slate-950">{segment.value}</p>
                </div>
                <span className="grid size-9 place-items-center rounded bg-slate-100 text-slate-700">
                  <Icon className="size-4" />
                </span>
              </div>
              <p className="mt-3 text-xs font-medium text-slate-500">{segment.detail}</p>
            </div>
          )
        })}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <div className="min-w-0 rounded border border-slate-200 bg-white">
          <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="font-bold text-slate-950">Portefeuille fournisseurs</h2>
              <p className="mt-1 text-xs text-slate-500">Vue consolidee achats, performance et exposition risque</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <input
                  className="h-9 w-full rounded border border-slate-300 bg-white pl-9 pr-3 text-sm font-medium outline-none focus:border-slate-950 sm:w-64"
                  placeholder="Rechercher fournisseur"
                  type="search"
                />
              </div>
              <button className="inline-flex h-9 items-center justify-center gap-2 rounded border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                <Filter className="size-4" />
                Filtres
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Fournisseur</th>
                  <th className="px-4 py-3 font-semibold">Categorie</th>
                  <th className="px-4 py-3 font-semibold">Depense</th>
                  <th className="px-4 py-3 font-semibold">Livraison</th>
                  <th className="px-4 py-3 font-semibold">Qualite</th>
                  <th className="px-4 py-3 font-semibold">Risque</th>
                  <th className="px-4 py-3 font-semibold">Statut</th>
                  <th className="px-4 py-3 font-semibold">Revue</th>
                  <th className="px-4 py-3 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {vendors.map((vendor) => (
                  <tr key={vendor.name} onClick={() => setSelectedVendor(vendor)} className="list-row cursor-pointer">
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-950">{vendor.name}</div>
                      <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                        <span>{vendor.city}</span>
                        <span>{vendor.owner}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-700">{vendor.category}</td>
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-950">{vendor.spend}</div>
                      <div className="text-xs text-slate-500">{vendor.orders} commandes</div>
                    </td>
                    <td className="px-4 py-3">
                      <ScoreBar value={vendor.onTime} />
                    </td>
                    <td className="px-4 py-3">
                      <ScoreBar value={vendor.quality} />
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded px-2 py-1 text-xs font-bold ${riskClass(vendor.risk)}`}>
                        {vendor.risk}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded px-2 py-1 text-xs font-bold ${statusClass(vendor.status)}`}>
                        {vendor.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-700">{vendor.nextReview}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex gap-2">
                        <button onClick={(e) => handleToggleStatus(vendor, e)} title={vendor.status === 'Actif' ? 'Suspendre' : 'Activer'} className="inline-grid size-8 place-items-center rounded border border-slate-200 text-slate-600 hover:bg-slate-50">
                          {vendor.status === 'Actif' ? <Pause className="size-4" /> : <Play className="size-4" />}
                        </button>
                        <button onClick={(e) => handleDelete(vendor.id, e)} title="Supprimer" className="inline-grid size-8 place-items-center rounded border border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700">
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="flex flex-col gap-5">
          <div className="rounded border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-bold text-slate-950">Revue prioritaire</h2>
              <CalendarClock className="size-4 text-slate-400" />
            </div>
            <div className="mt-4 grid gap-3">
              {dynamicReviewQueue.length > 0 ? dynamicReviewQueue.map((item) => (
                <div key={item.vendor} className="list-row rounded border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-slate-950">{item.vendor}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">{item.action}</p>
                    </div>
                    <span className="rounded bg-white px-2 py-1 text-xs font-bold text-slate-700">{item.due}</span>
                  </div>
                  <p className="mt-2 text-xs font-bold uppercase tracking-wide text-slate-400">{item.priority}</p>
                </div>
              )) : (
                <p className="text-sm text-slate-500">Aucune revue urgente.</p>
              )}
            </div>
          </div>

          <div className="rounded border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-bold text-slate-950">Couverture contrats</h2>
              <ShieldCheck className="size-4 text-slate-400" />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {dynamicContracts.map((contract) => (
                <div key={contract.label} className="list-row rounded border border-slate-200 bg-slate-50 p-3 text-center">
                  <p className={`mx-auto inline-flex min-w-9 justify-center rounded px-2 py-1 text-sm font-bold ${contract.tone}`}>
                    {contract.value}
                  </p>
                  <p className="mt-2 text-[10px] sm:text-xs font-semibold text-slate-500">{contract.label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-bold text-slate-950">Fiche active</h2>
              <BadgeCheck className="size-4 text-slate-400" />
            </div>
            {selectedVendor ? (
              <div className="mt-4 rounded border border-slate-200 bg-slate-50 p-3">
                <p className="font-bold text-slate-950">{selectedVendor.name}</p>
                <p className="mt-1 text-xs text-slate-500">{selectedVendor.contract} · {selectedVendor.paymentTerms}</p>
                <div className="mt-3 grid gap-2 text-sm">
                  <p className="flex items-center gap-2 font-medium text-slate-700">
                    <Mail className="size-4 text-slate-400" />
                    {selectedVendor.email}
                  </p>
                  <p className="flex items-center gap-2 font-medium text-slate-700">
                    <Phone className="size-4 text-slate-400" />
                    {selectedVendor.phone}
                  </p>
                  <p className="flex items-center gap-2 font-medium text-slate-700">
                    <Boxes className="size-4 text-slate-400" />
                    {selectedVendor.category}
                  </p>
                  <p className="flex items-center gap-2 font-medium text-slate-700">
                    <BarChart3 className="size-4 text-slate-400" />
                    Score global {Math.round((selectedVendor.onTime + selectedVendor.quality) / 2)}/100
                  </p>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
                Aucun fournisseur actif
              </div>
            )}
          </div>
        </aside>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/40 px-4 py-8 sm:items-center">
          <div className="w-full max-w-2xl rounded border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4">
              <h2 className="text-lg font-bold text-slate-950">Nouveau fournisseur</h2>
              <button type="button" onClick={() => setIsModalOpen(false)} className="inline-flex size-9 items-center justify-center rounded border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900">
                <X className="size-4" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-400">Nom *</span>
                  <input required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-slate-950" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-400">Categorie *</span>
                  <input required value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })} className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-slate-950" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-400">Responsable (Proprietaire) *</span>
                  <input required value={formData.owner} onChange={e => setFormData({ ...formData, owner: e.target.value })} className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-slate-950" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-400">Ville *</span>
                  <input required value={formData.city} onChange={e => setFormData({ ...formData, city: e.target.value })} className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-slate-950" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-400">Email *</span>
                  <input type="email" required value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-slate-950" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-400">Telephone *</span>
                  <input required value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-slate-950" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-400">Contrat *</span>
                  <input required value={formData.contract} onChange={e => setFormData({ ...formData, contract: e.target.value })} className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-slate-950" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-400">Conditions de paiement *</span>
                  <select required value={formData.paymentTerms} onChange={e => setFormData({ ...formData, paymentTerms: e.target.value })} className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-slate-950">
                    <option value="Comptant">Comptant</option>
                    <option value="15 jours">15 jours</option>
                    <option value="30 jours">30 jours</option>
                    <option value="45 jours">45 jours</option>
                    <option value="60 jours">60 jours</option>
                  </select>
                </label>
              </div>
              <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => setIsModalOpen(false)} className="inline-flex items-center justify-center gap-2 rounded border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  <X className="size-4" />
                  Annuler
                </button>
                <button type="submit" className="inline-flex items-center justify-center gap-2 rounded bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
                  <Check className="size-4" />
                  Creer le fournisseur
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  )
}

export const Route = createFileRoute('/$companySlug/purchases/vendors')({
  loader: async ({ params }) => getVendorData({ data: { companySlug: params.companySlug } }),
  component: VendorsPage,
})
