import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useMemo, useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from 'react'
import {
  AlertTriangle,
  Boxes,
  Briefcase,
  Check,
  Layers,
  Image as ImageIcon,
  LayoutGrid,
  List,
  Package,
  PackagePlus,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import { type CatalogCategory, type CatalogItem, type CatalogItemStatus, type CatalogItemType } from '~/domain/catalogData'
import { getCompanyFactor, useCompany } from '~/context/CompanyContext'
import { getCatalogData } from '~/server/dataFetchers'
import { createCatalogCategory, createCatalogItem, restockCatalogItem, updateCatalogItemStatus } from '~/server/operations'
import { formatMoney } from '~/utils/currency'

export const Route = createFileRoute('/$companySlug/products-services')({
  loader: async ({ params }) => getCatalogData({ data: { companySlug: params.companySlug } }),
  component: CatalogPage,
})

type StockFilter = 'all' | 'low' | 'out' | 'ok' | 'service'
type CatalogModal = 'product' | 'category' | null

interface ProductFormState {
  name: string
  sku: string
  type: CatalogItemType
  categoryId: string
  description: string
  supplier: string
  cost: string
  price: string
  wholesalePrice: string
  stock: string
  minStockLevel: string
  status: CatalogItemStatus
  imageUrl: string
}

interface CategoryFormState {
  name: string
  type: CatalogItemType
  color: string
}

const productFormDefaults: ProductFormState = {
  name: '',
  sku: '',
  type: 'Product',
  categoryId: '',
  description: '',
  supplier: '',
  cost: '0',
  price: '',
  wholesalePrice: '0',
  stock: '0',
  minStockLevel: '5',
  status: 'Draft',
  imageUrl: '',
}

const categoryFormDefaults: CategoryFormState = {
  name: '',
  type: 'Product',
  color: 'slate',
}

function CatalogPage() {
  const { companySlug } = Route.useParams()
  const router = useRouter()
  const data = Route.useLoaderData()
  const { activeCompanyId } = useCompany()
  const factor = getCompanyFactor(activeCompanyId)

  const [items, setItems] = useState<CatalogItem[]>(() => data.items.map(toCatalogItem))
  const [categories, setCategories] = useState<CatalogCategory[]>(() => data.categories.map(toCatalogCategory))
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState<'All' | CatalogItemType>('All')
  const [stockFilter, setStockFilter] = useState<StockFilter>('all')
  const [activeModal, setActiveModal] = useState<CatalogModal>(null)
  const [productForm, setProductForm] = useState<ProductFormState>(productFormDefaults)
  const [categoryForm, setCategoryForm] = useState<CategoryFormState>(categoryFormDefaults)
  const [actionMessage, setActionMessage] = useState('')

  const products = items.filter((item) => item.type === 'Product')
  const services = items.filter((item) => item.type === 'Service')
  const lowStock = products.filter((item) => item.stock !== null && item.minStockLevel !== undefined && item.stock > 0 && item.stock <= item.minStockLevel)
  const outOfStock = products.filter((item) => item.stock === 0)
  const totalStockValue = products.reduce((sum, item) => sum + (item.stock ?? 0) * item.cost * factor, 0)
  const suppliers = Array.from(new Set(items.map((item) => item.supplier).filter(Boolean))).sort() as string[]

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const query = searchQuery.toLowerCase()
      const matchesSearch = `${item.name} ${item.sku} ${item.description ?? ''} ${item.supplier ?? ''}`.toLowerCase().includes(query)
      const matchesType = filterType === 'All' || item.type === filterType
      const matchesStock =
        stockFilter === 'all' ||
        (stockFilter === 'service' && item.type === 'Service') ||
        (stockFilter === 'out' && item.stock === 0) ||
        (stockFilter === 'low' && item.type === 'Product' && item.stock !== null && item.minStockLevel !== undefined && item.stock > 0 && item.stock <= item.minStockLevel) ||
        (stockFilter === 'ok' && item.type === 'Product' && item.stock !== null && item.minStockLevel !== undefined && item.stock > item.minStockLevel)

      return matchesSearch && matchesType && matchesStock
    })
  }, [filterType, items, searchQuery, stockFilter])

  function openProductModal(type: CatalogItemType = 'Product') {
    const nextNumber = items.length + 1
    const nextSkuPrefix = type === 'Product' ? 'PROD' : 'SERV'
    const firstCategory = categories.find((category) => category.type === type) ?? categories[0]
    setProductForm({
      ...productFormDefaults,
      type,
      sku: `${nextSkuPrefix}-${String(nextNumber).padStart(4, '0')}`,
      categoryId: firstCategory?.id ?? '',
      stock: type === 'Product' ? '0' : '',
      minStockLevel: type === 'Product' ? '5' : '',
    })
    setActiveModal('product')
  }

  async function addProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = productForm.name.trim()
    const sku = productForm.sku.trim()
    const price = Number(productForm.price)
    const cost = Number(productForm.cost)
    const wholesalePrice = Number(productForm.wholesalePrice)
    const stock = Number(productForm.stock)
    const minStockLevel = Number(productForm.minStockLevel)

    if (!name || !sku || !Number.isFinite(price) || price < 0 || !Number.isFinite(cost) || cost < 0 || !Number.isFinite(wholesalePrice) || wholesalePrice < 0) {
      setActionMessage('Renseigne le nom, le SKU et des prix valides.')
      return
    }
    if (productForm.type === 'Product' && (!Number.isFinite(stock) || stock < 0 || !Number.isFinite(minStockLevel) || minStockLevel < 0)) {
      setActionMessage('Renseigne des valeurs de stock valides pour ce produit.')
      return
    }

    try {
      const newItem = toCatalogItem(await createCatalogItem({
        data: {
          companySlug,
          name,
          sku,
          type: productForm.type,
          description: productForm.description.trim() || undefined,
          supplier: productForm.type === 'Product' ? productForm.supplier.trim() || undefined : undefined,
          categoryId: productForm.categoryId || undefined,
          price,
          cost,
          wholesalePrice: productForm.type === 'Product' ? wholesalePrice : 0,
          stock: productForm.type === 'Product' ? Math.max(0, Math.floor(stock || 0)) : undefined,
          minStockLevel: productForm.type === 'Product' ? Math.max(0, Math.floor(minStockLevel || 0)) : undefined,
          status: productForm.status,
          imageUrl: productForm.imageUrl.trim() || undefined,
        },
      }))
      setItems((current) => [newItem, ...current])
      setActiveModal(null)
      setActionMessage(`${newItem.name} ajoute au catalogue.`)
      await router.invalidate()
    } catch (error: any) {
      setActionMessage(error.message || 'Impossible d ajouter cet article.')
    }
  }

  async function addCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = categoryForm.name.trim()
    if (!name) {
      setActionMessage('Renseigne le nom de la categorie.')
      return
    }
    const newCategory = toCatalogCategory(await createCatalogCategory({
      data: {
        companySlug,
        name,
        type: categoryForm.type,
        color: categoryForm.color,
      },
    }))
    setCategories((current) => [newCategory, ...current])
    setProductForm((current) => ({ ...current, categoryId: newCategory.id, type: newCategory.type }))
    setCategoryForm(categoryFormDefaults)
    setActiveModal('product')
    setActionMessage(`${newCategory.name} ajoutee aux categories.`)
  }

  async function markRestocked(itemId: string) {
    const item = items.find((candidate) => candidate.id === itemId)
    if (!item || item.type !== 'Product') return
    const targetStock = Math.max(item.minStockLevel ?? 5, 5) * 2
    const quantity = Math.max(1, targetStock - (item.stock ?? 0))
    try {
      const updated = toCatalogItem(await restockCatalogItem({
        data: { companySlug, itemId, quantity },
      }))
      setItems((current) => current.map((candidate) => candidate.id === itemId ? updated : candidate))
      setActionMessage(`${updated.name}: +${quantity} en stock.`)
      await router.invalidate()
    } catch (error: any) {
      setActionMessage(error.message || 'Impossible de recharger ce produit.')
    }
  }

  async function toggleStatus(itemId: string) {
    const item = items.find((candidate) => candidate.id === itemId)
    if (!item) return
    const status = item.status === 'Active' ? 'Draft' : 'Active'
    try {
      const updated = toCatalogItem(await updateCatalogItemStatus({
        data: { companySlug, itemId, status },
      }))
      setItems((current) => current.map((candidate) => candidate.id === itemId ? updated : candidate))
      setActionMessage(`${updated.name}: statut ${status === 'Active' ? 'actif' : 'brouillon'}.`)
      await router.invalidate()
    } catch (error: any) {
      setActionMessage(error.message || 'Impossible de modifier le statut.')
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">Produits & stock</h1>
          <p className="mt-1 text-sm text-slate-500">Articles, prix, images, codes-barres, seuils et alertes de reapprovisionnement.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => openProductModal('Product')} className="inline-flex items-center gap-2 rounded border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <PackagePlus className="size-4" />
            Nouveau produit
          </button>
          <button onClick={() => openProductModal('Service')} className="inline-flex items-center gap-2 rounded border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <Briefcase className="size-4" />
            Nouveau service
          </button>
          <Link to="/$companySlug/inventory" params={{ companySlug }} className="inline-flex items-center gap-2 rounded bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
            <Boxes className="size-4" />
            Voir stock
          </Link>
        </div>
      </div>

      {actionMessage ? (
        <div className="mb-6 rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          {actionMessage}
        </div>
      ) : null}

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
        <SummaryCard title="Produits actifs" value={products.length.toString()} detail={`${services.length} services`} icon={Package} />
        <SummaryCard title="Valeur stock" value={formatMoney(totalStockValue)} detail="Prix x quantite" icon={Boxes} />
        <SummaryCard title="Stock faible" value={lowStock.length.toString()} detail="A commander bientot" icon={AlertTriangle} alert={lowStock.length > 0} />
        <SummaryCard title="Ruptures" value={outOfStock.length.toString()} detail="Vente bloquee" icon={PackagePlus} alert={outOfStock.length > 0} />
      </div>

      <div className="mb-6 flex flex-col gap-4 rounded border border-slate-200 bg-white p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 sm:max-w-md">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Rechercher nom ou SKU..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded border border-slate-300 py-2 pl-9 pr-4 text-sm outline-none focus:border-slate-950"
            />
          </div>
          <select value={stockFilter} onChange={(e) => setStockFilter(e.target.value as StockFilter)} className="rounded border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-slate-950">
            <option value="all">Tous les stocks</option>
            <option value="low">Stock faible</option>
            <option value="out">Rupture</option>
            <option value="ok">Stock OK</option>
            <option value="service">Services</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center rounded border border-slate-200 bg-slate-50 p-1">
            {(['All', 'Product', 'Service'] as const).map((type) => (
              <button key={type} onClick={() => setFilterType(type)} className={`rounded px-3 py-1.5 text-xs font-semibold ${filterType === type ? 'bg-white text-slate-950 border border-slate-200' : 'text-slate-500 hover:text-slate-900'}`}>
                {type === 'All' ? 'Tous' : type === 'Product' ? 'Produits' : 'Services'}
              </button>
            ))}
          </div>
          <button onClick={() => setActionMessage('Filtres avances: categorie, fournisseur et marge seront connectes a la base.')} className="inline-flex items-center gap-2 rounded border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <SlidersHorizontal className="size-4" />
            Filtres
          </button>
          <div className="flex items-center gap-1 rounded border border-slate-200 bg-white p-1">
            <button onClick={() => setViewMode('grid')} className={`rounded p-1.5 ${viewMode === 'grid' ? 'bg-slate-100 text-slate-900' : 'text-slate-400 hover:text-slate-700'}`} aria-label="Vue grille">
              <LayoutGrid className="size-4" />
            </button>
            <button onClick={() => setViewMode('list')} className={`rounded p-1.5 ${viewMode === 'list' ? 'bg-slate-100 text-slate-900' : 'text-slate-400 hover:text-slate-700'}`} aria-label="Vue liste">
              <List className="size-4" />
            </button>
          </div>
        </div>
      </div>

      {filteredItems.length === 0 ? (
        <div className="rounded border border-dashed border-slate-300 bg-white py-12 text-center">
          <Package className="mx-auto mb-3 size-10 text-slate-300" />
          <p className="text-sm font-semibold text-slate-700">Aucun article trouve.</p>
          <p className="mt-1 text-xs text-slate-500">Change le filtre ou ajoute un produit.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button onClick={() => openProductModal('Product')} className="inline-flex items-center gap-2 rounded bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
              <PackagePlus className="size-4" />
              Ajouter produit
            </button>
            <button onClick={() => openProductModal('Service')} className="inline-flex items-center gap-2 rounded border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <Briefcase className="size-4" />
              Ajouter service
            </button>
          </div>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredItems.map((item) => <CatalogCard key={item.id} item={item} categories={categories} onRestock={markRestocked} onToggleStatus={toggleStatus} />)}
        </div>
      ) : (
        <CatalogList items={filteredItems} categories={categories} onRestock={markRestocked} onToggleStatus={toggleStatus} />
      )}

      {activeModal === 'product' ? (
        <Modal title={productForm.type === 'Product' ? 'Ajouter un produit' : 'Ajouter un service'} onClose={() => setActiveModal(null)} wide>
          <form onSubmit={addProduct} className="space-y-5">
            <FormSection title={productForm.type === 'Product' ? 'Informations produit' : 'Informations service'}>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField label={productForm.type === 'Product' ? 'Nom du produit *' : 'Nom du service *'} name="name" value={productForm.name} onChange={(value) => setProductForm((current) => ({ ...current, name: value }))} placeholder={productForm.type === 'Product' ? 'Ex: Smartphone Samsung Galaxy' : 'Ex: Installation reseau'} required />
                <TextField label="SKU *" name="sku" value={productForm.sku} onChange={(value) => setProductForm((current) => ({ ...current, sku: value }))} required />
              <SelectField label="Type" value={productForm.type} onChange={(value) => setProductForm((current) => ({ ...current, type: value as CatalogItemType, stock: value === 'Product' ? current.stock || '0' : '', minStockLevel: value === 'Product' ? current.minStockLevel || '5' : '', supplier: value === 'Product' ? current.supplier : '', wholesalePrice: value === 'Product' ? current.wholesalePrice || '0' : '0' }))}>
                <option value="Product">Produit</option>
                <option value="Service">Service</option>
              </SelectField>
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-400">Categorie *</span>
                <div className="flex gap-2">
                  <select value={productForm.categoryId} onChange={(event) => setProductForm((current) => ({ ...current, categoryId: event.target.value }))} className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-slate-950">
                    <option value="">{productForm.type === 'Product' ? 'Ex: Electronique' : 'Ex: Services techniques'}</option>
                    {categories.filter((category) => category.type === productForm.type).map((category) => (
                      <option key={category.id} value={category.id}>{category.name}</option>
                    ))}
                  </select>
                  <button type="button" onClick={() => setActiveModal('category')} className="inline-flex size-10 shrink-0 items-center justify-center rounded border border-slate-300 text-slate-600 hover:bg-slate-50" aria-label="Ajouter une categorie">
                    <Layers className="size-4" />
                  </button>
                </div>
              </label>
              <SelectField label="Statut" value={productForm.status} onChange={(value) => setProductForm((current) => ({ ...current, status: value as CatalogItemStatus }))}>
                <option value="Draft">Brouillon</option>
                <option value="Active">Actif</option>
                <option value="Archived">Archive</option>
              </SelectField>
                <div className="sm:col-span-2">
                  <TextAreaField label="Description" value={productForm.description} onChange={(value) => setProductForm((current) => ({ ...current, description: value }))} placeholder={productForm.type === 'Product' ? 'Description du produit...' : 'Description de la prestation...'} />
                </div>
              </div>
            </FormSection>

            {productForm.type === 'Product' ? (
            <FormSection title="Stock du produit">
              <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <TextField label="Stock actuel *" name="stock" value={productForm.stock} onChange={(value) => setProductForm((current) => ({ ...current, stock: value }))} type="number" min="0" required />
                    <p className="mt-1 text-xs font-semibold text-slate-500">Valeur: {formatMoney((Number(productForm.stock) || 0) * (Number(productForm.price) || 0))}</p>
                  </div>
                  <div>
                    <TextField label="Stock minimum" name="minStockLevel" value={productForm.minStockLevel} onChange={(value) => setProductForm((current) => ({ ...current, minStockLevel: value }))} type="number" min="0" />
                    <p className="mt-1 text-xs text-slate-500">Alerte envoyee lorsque le stock descend en dessous de cette valeur</p>
                  </div>
                <label className="block">
                  <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-400">Fournisseur</span>
                  <input list="product-suppliers" value={productForm.supplier} onChange={(event) => setProductForm((current) => ({ ...current, supplier: event.target.value }))} placeholder="Selectionner un fournisseur" className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-slate-950" />
                  <datalist id="product-suppliers">
                    {suppliers.map((supplier) => <option key={supplier} value={supplier} />)}
                  </datalist>
                </label>
                <TextField label="Image URL" name="imageUrl" value={productForm.imageUrl} onChange={(value) => setProductForm((current) => ({ ...current, imageUrl: value }))} placeholder="https://..." />
              </div>
            </FormSection>
            ) : (
            <FormSection title="Execution du service">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm font-bold text-slate-950">Pas de gestion de stock</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">Un service est vendu comme une prestation. Il n'a pas de quantite en depot, pas de seuil minimum et ne declenche pas d'alerte de rupture.</p>
                </div>
                <TextField label="Image URL" name="imageUrl" value={productForm.imageUrl} onChange={(value) => setProductForm((current) => ({ ...current, imageUrl: value }))} placeholder="https://..." />
              </div>
            </FormSection>
            )}

            <FormSection title={productForm.type === 'Product' ? 'Prix du produit' : 'Prix du service'}>
              <div className={`grid gap-4 ${productForm.type === 'Product' ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
                <TextField label={productForm.type === 'Product' ? "Prix d'achat (FCFA) *" : 'Cout de revient (FCFA)'} name="cost" value={productForm.cost} onChange={(value) => setProductForm((current) => ({ ...current, cost: value }))} type="number" min="0" required={productForm.type === 'Product'} />
                <PriceField label={productForm.type === 'Product' ? 'Prix detail (FCFA) *' : 'Prix de la prestation (FCFA) *'} value={productForm.price} cost={productForm.cost} onChange={(value) => setProductForm((current) => ({ ...current, price: value }))} />
                {productForm.type === 'Product' ? (
                  <PriceField label="Prix gros (FCFA) *" value={productForm.wholesalePrice} cost={productForm.cost} onChange={(value) => setProductForm((current) => ({ ...current, wholesalePrice: value }))} />
                ) : null}
              </div>
            </FormSection>
            <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setActiveModal(null)} className="inline-flex items-center justify-center gap-2 rounded border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                <X className="size-4" />
                Annuler
              </button>
              <button type="submit" className="inline-flex items-center justify-center gap-2 rounded bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
                <Check className="size-4" />
                Enregistrer
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {activeModal === 'category' ? (
        <Modal title="Nouvelle categorie" onClose={() => setActiveModal('product')}>
          <form onSubmit={addCategory} className="space-y-5">
            <TextField label="Nom" name="categoryName" value={categoryForm.name} onChange={(value) => setCategoryForm((current) => ({ ...current, name: value }))} required />
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField label="Type" value={categoryForm.type} onChange={(value) => setCategoryForm((current) => ({ ...current, type: value as CatalogItemType }))}>
                <option value="Product">Produit</option>
                <option value="Service">Service</option>
              </SelectField>
              <SelectField label="Couleur" value={categoryForm.color} onChange={(value) => setCategoryForm((current) => ({ ...current, color: value }))}>
                <option value="slate">Gris</option>
                <option value="emerald">Vert</option>
                <option value="amber">Ambre</option>
                <option value="rose">Rose</option>
              </SelectField>
            </div>
            <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setActiveModal('product')} className="inline-flex items-center justify-center gap-2 rounded border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                <X className="size-4" />
                Retour
              </button>
              <button type="submit" className="inline-flex items-center justify-center gap-2 rounded bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
                <Check className="size-4" />
                Ajouter
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  )
}

function CatalogCard({ item, categories, onRestock, onToggleStatus }: { item: CatalogItem; categories: CatalogCategory[]; onRestock: (id: string) => void; onToggleStatus: (id: string) => void }) {
  const { activeCompanyId } = useCompany()
  const factor = getCompanyFactor(activeCompanyId)
  const category = categories.find((c) => c.id === item.categoryId)
  const stockState = getStockState(item)

  return (
    <div className="flex min-h-[300px] flex-col overflow-hidden rounded border border-slate-200 bg-white transition hover:border-slate-300">
      <div className="relative flex h-40 items-center justify-center border-b border-slate-200 bg-slate-50">
        {item.imageUrl ? <img src={item.imageUrl} alt={item.name} className="size-full object-cover" /> : <ImageIcon className="size-10 text-slate-200" />}
        <div className="absolute left-2 top-2 rounded bg-white/95 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600">
          {item.type === 'Product' ? 'Produit' : 'Service'}
        </div>
        <div className={`absolute right-2 top-2 rounded px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${stockState.className}`}>
          {stockState.label}
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="mb-2 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-xs text-slate-400">{item.sku}</p>
            <h3 className="mt-1 line-clamp-2 font-bold leading-tight text-slate-950">{item.name}</h3>
          </div>
          <span className="shrink-0 rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">{category?.name ?? 'General'}</span>
        </div>

        <div className="mt-auto border-t border-slate-100 pt-4">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-slate-500">{item.type === 'Service' ? 'Prestation' : 'Stock / seuil'}</p>
              {item.type === 'Service' ? (
                <span className="mt-1 inline-flex items-center gap-1 text-sm font-bold text-slate-700"><Briefcase className="size-4" /> Illimite</span>
              ) : (
                <span className="mt-1 inline-flex items-center gap-1 text-sm font-bold text-slate-700">
                  <Package className="size-4" /> {item.stock ?? 0} / {item.minStockLevel ?? 0}
                </span>
              )}
            </div>
            <p className="text-lg font-bold text-slate-950">{formatMoney(item.price * factor)}</p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => onToggleStatus(item.id)} className="rounded border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
              {item.status === 'Active' ? 'Mettre pause' : 'Activer'}
            </button>
            <button onClick={() => onRestock(item.id)} disabled={item.type === 'Service'} className="rounded bg-slate-950 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400">
              Recharger
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function CatalogList({ items, categories, onRestock, onToggleStatus }: { items: CatalogItem[]; categories: CatalogCategory[]; onRestock: (id: string) => void; onToggleStatus: (id: string) => void }) {
  const { activeCompanyId } = useCompany()
  const factor = getCompanyFactor(activeCompanyId)

  return (
    <div className="overflow-hidden rounded border border-slate-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full whitespace-nowrap text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
            <tr>
              <th className="w-12 px-4 py-3 font-semibold"></th>
              <th className="px-4 py-3 font-semibold">Article</th>
              <th className="px-4 py-3 font-semibold">Categorie</th>
              <th className="px-4 py-3 text-right font-semibold">Prix</th>
              <th className="px-4 py-3 text-right font-semibold">Stock</th>
              <th className="px-4 py-3 text-center font-semibold">Etat</th>
              <th className="px-4 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((item) => {
              const category = categories.find((c) => c.id === item.categoryId)
              const stockState = getStockState(item)

              return (
                <tr key={item.id} className="list-row">
                  <td className="px-4 py-3">
                    <div className="flex size-10 items-center justify-center overflow-hidden rounded border border-slate-200 bg-slate-50">
                      {item.imageUrl ? <img src={item.imageUrl} alt="" className="size-full object-cover" /> : <ImageIcon className="size-4 text-slate-300" />}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-bold text-slate-950">{item.name}</p>
                    <p className="mt-0.5 font-mono text-xs text-slate-400">{item.sku}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{category?.name ?? 'General'}</td>
                  <td className="px-4 py-3 text-right font-bold text-slate-950">{formatMoney(item.price * factor)}</td>
                  <td className="px-4 py-3 text-right font-bold text-slate-700">{item.type === 'Service' ? 'Illimite' : `${item.stock ?? 0} / ${item.minStockLevel ?? 0}`}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex rounded px-2 py-1 text-xs font-bold ${stockState.className}`}>{stockState.label}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-2">
                      <button onClick={() => onToggleStatus(item.id)} className="rounded border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50">
                        {item.status === 'Active' ? 'Pause' : 'Activer'}
                      </button>
                      <button onClick={() => onRestock(item.id)} disabled={item.type === 'Service'} className="rounded bg-slate-950 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400">
                        Stock
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SummaryCard({ title, value, detail, icon: Icon, alert = false }: { title: string; value: string; detail: string; icon: any; alert?: boolean }) {
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

function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded border border-slate-200 bg-white p-4">
      <h3 className="mb-4 text-sm font-bold text-slate-950">{title}</h3>
      {children}
    </section>
  )
}

function TextField({ label, value, onChange, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-400">{label}</span>
      <input {...props} value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-slate-950" />
    </label>
  )
}

function TextAreaField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-400">{label}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} rows={3} className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-slate-950" />
    </label>
  )
}

function PriceField({ label, value, cost, onChange }: { label: string; value: string; cost: string; onChange: (value: string) => void }) {
  const margin = getMargin(Number(value) || 0, Number(cost) || 0)

  return (
    <div>
      <TextField label={label} value={value} onChange={onChange} type="number" min="0" required />
      <p className={`mt-1 text-xs font-semibold ${margin < 0 ? 'text-rose-600' : 'text-slate-500'}`}>Marge: {margin.toFixed(2)}%</p>
    </div>
  )
}

function SelectField({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-400">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-slate-950">
        {children}
      </select>
    </label>
  )
}

function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/40 px-4 py-8 sm:items-center" role="dialog" aria-modal="true">
      <div className={`w-full rounded border border-slate-200 bg-white shadow-xl ${wide ? 'max-w-4xl' : 'max-w-2xl'}`}>
        <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-bold text-slate-950">{title}</h2>
          <button type="button" onClick={onClose} className="inline-flex size-9 items-center justify-center rounded border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900" aria-label="Fermer">
            <X className="size-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

function getStockState(item: CatalogItem) {
  if (item.type === 'Service') return { label: 'Service', className: 'bg-slate-100 text-slate-600' }
  if (item.stock === 0) return { label: 'Rupture', className: 'bg-rose-50 text-rose-700' }
  if (item.stock !== null && item.minStockLevel !== undefined && item.stock <= item.minStockLevel) return { label: 'Faible', className: 'bg-amber-50 text-amber-700' }
  if (item.status !== 'Active') return { label: 'Brouillon', className: 'bg-slate-100 text-slate-600' }
  return { label: 'OK', className: 'bg-emerald-50 text-emerald-700' }
}

function getMargin(salePrice: number, cost: number) {
  if (salePrice <= 0) return 0
  return ((salePrice - cost) / salePrice) * 100
}

function toCatalogCategory(category: any): CatalogCategory {
  return {
    id: category.id,
    name: category.name,
    type: category.type,
    color: category.color ?? 'slate',
  }
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
