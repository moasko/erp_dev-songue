import { createFileRoute, useRouter } from '@tanstack/react-router'
import { CreditCard, ImageIcon, Minus, Plus, Printer, ReceiptText, Search, ShoppingCart, Smartphone, Trash2, UserRound, Wallet, X } from 'lucide-react'
import { useMemo, useState, type ComponentType, type ReactNode } from 'react'
import { type CatalogCategory, type CatalogItem } from '~/domain/catalogData'
import { useCompany, useMoney } from '~/context/CompanyContext'
import { getPosData } from '~/server/dataFetchers'
import { createPosSale } from '~/server/operations'

type CartLine = {
  item: CatalogItem
  quantity: number
}

type PaymentMethod = 'cash' | 'mobile' | 'card'

type CheckoutTicket = {
  reference: string
  customer: string
  total: number
  items: number
  paymentMethod: PaymentMethod
  createdAt: string
  lines: Array<{
    name: string
    sku: string
    quantity: number
    unitPrice: number
    total: number
  }>
}

export const Route = createFileRoute('/$companySlug/pos/register')({
  loader: async ({ params }) => getPosData({ data: { companySlug: params.companySlug } }),
  component: PosRegister,
})

function PosRegister() {
  const { formatMoney } = useMoney()
  const { companySlug } = Route.useParams()
  const router = useRouter()
  const data = Route.useLoaderData()
  const { activeCompany } = useCompany()
  const products = data.items.map(toCatalogItem).filter((item: CatalogItem) => item.status === 'Active')
  const customers = data.customers
  const [cart, setCart] = useState<CartLine[]>([])
  const [query, setQuery] = useState('')
  const [customerId, setCustomerId] = useState('counter')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [lastTicket, setLastTicket] = useState<CheckoutTicket | null>(null)
  const [isTicketModalOpen, setIsTicketModalOpen] = useState(false)
  const [actionMessage, setActionMessage] = useState('')
  const [isCheckingOut, setIsCheckingOut] = useState(false)

  const productCategoryIds = Array.from(new Set(products.map((item: CatalogItem) => item.categoryId)))
  const categories = data.categories.map(toCatalogCategory).filter((category: CatalogCategory) => productCategoryIds.includes(category.id))
  const visibleProducts = products.filter((item) => {
    const matchesQuery = `${item.name} ${item.sku}`.toLowerCase().includes(query.toLowerCase())
    const matchesCategory = selectedCategory === 'all' || item.categoryId === selectedCategory
    return matchesQuery && matchesCategory
  })
  const subtotal = cart.reduce((sum, line) => sum + line.item.price * line.quantity, 0)
  const total = subtotal
  const selectedCustomer = customers.find((customer: any) => customer.id === customerId)
  const cartCount = useMemo(() => cart.reduce((sum, line) => sum + line.quantity, 0), [cart])

  function addItem(item: CatalogItem) {
    if (item.stock !== null && item.stock <= 0) {
      setActionMessage(`${item.name} est en rupture de stock.`)
      return
    }
    setCart((current) => {
      const existing = current.find((line) => line.item.id === item.id)
      if (existing) {
        if (item.stock !== null && existing.quantity + 1 > item.stock) {
          setActionMessage(`Stock insuffisant pour ${item.name}. Disponible: ${item.stock}.`)
          return current
        }
        return current.map((line) => line.item.id === item.id ? { ...line, quantity: line.quantity + 1 } : line)
      }
      return [...current, { item, quantity: 1 }]
    })
    setActionMessage('')
  }

  function updateQuantity(itemId: string, delta: number) {
    setCart((current) =>
      current
        .map((line) => {
          if (line.item.id !== itemId) return line
          const nextQuantity = Math.max(0, line.quantity + delta)
          if (line.item.stock !== null && nextQuantity > line.item.stock) {
            setActionMessage(`Stock insuffisant pour ${line.item.name}. Disponible: ${line.item.stock}.`)
            return line
          }
          return { ...line, quantity: nextQuantity }
        })
        .filter((line) => line.quantity > 0),
    )
  }

  async function checkout() {
    if (cart.length === 0) {
      setActionMessage('Ajoute au moins un produit avant d encaisser.')
      return
    }
    if (isCheckingOut) return

    const cartSnapshot = cart.map((line) => ({
      name: line.item.name,
      sku: line.item.sku,
      quantity: line.quantity,
      unitPrice: line.item.price,
      total: line.item.price * line.quantity,
    }))
    setIsCheckingOut(true)
    let saleTicket: Omit<CheckoutTicket, 'lines'>
    try {
      saleTicket = await createPosSale({
        data: {
          companySlug,
          customerId: customerId === 'counter' ? undefined : customerId,
          paymentMethod,
          lines: cart.map((line) => ({ itemId: line.item.id, quantity: line.quantity })),
        },
      }) as Omit<CheckoutTicket, 'lines'>
    } catch (error: any) {
      setActionMessage(error.message || 'Impossible d encaisser cette vente.')
      return
    } finally {
      setIsCheckingOut(false)
    }
    const ticket: CheckoutTicket = {
      ...saleTicket,
      createdAt: new Date(saleTicket.createdAt).toLocaleString('fr-FR'),
      lines: cartSnapshot,
    }

    setLastTicket(ticket)
    setIsTicketModalOpen(true)
    setActionMessage(`Ticket ${ticket.reference} encaisse.`)
    setCart([])
    setQuery('')
    await router.invalidate()
    printTicketSoon()
  }

  function printTicketSoon() {
    if (typeof window === 'undefined') return
    window.setTimeout(() => window.print(), 250)
  }

  return (
    <main className="app-page-bg min-h-[calc(100vh-4rem)]">
      <div className="grid min-h-[calc(100vh-4rem)] grid-cols-1 lg:grid-cols-[minmax(0,1fr)_390px] xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="flex min-h-0 flex-col px-4 py-5 sm:px-6 lg:h-[calc(100vh-4rem)] lg:overflow-hidden lg:px-8">
          <div className="mb-4 flex shrink-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-cyan-500">Vente rapide</p>
              <h1 className="mt-1 text-2xl font-bold text-slate-950 dark:text-white">Nouvelle vente</h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{activeCompany.name} - session caisse ouverte</p>
            </div>
            <div className="neon-surface grid grid-cols-2 rounded px-3 py-2 text-center">
              <MiniStat label="Articles" value={cartCount.toString()} />
              <MiniStat label="Total" value={formatMoney(total)} />
            </div>
          </div>

          <div className="neon-surface mb-4 shrink-0 rounded p-3">
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_230px]">
              <label className="relative">
                <Search className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-slate-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Scanner ou rechercher un produit"
                  className="h-12 w-full rounded border border-slate-300 bg-white py-2 pl-10 pr-4 text-base font-semibold text-slate-950 outline-none focus:border-slate-950 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:border-cyan-400"
                />
              </label>
              <label className="relative">
                <UserRound className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <select
                  value={customerId}
                  onChange={(event) => setCustomerId(event.target.value)}
                  className="h-12 w-full rounded border border-slate-300 bg-white pl-9 pr-3 text-sm font-bold text-slate-700 outline-none focus:border-slate-950 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-cyan-400"
                >
                  <option value="counter">Client comptoir</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>{customer.name}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="mb-4 flex shrink-0 gap-2 overflow-x-auto pb-1">
            <CategoryButton active={selectedCategory === 'all'} onClick={() => setSelectedCategory('all')}>
              Tous
            </CategoryButton>
            {categories.map((category) => (
              <CategoryButton key={category.id} active={selectedCategory === category.id} onClick={() => setSelectedCategory(category.id)}>
                {category.name}
              </CategoryButton>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {visibleProducts.length > 0 ? (
              <div className="grid grid-cols-2 gap-3 pb-6 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {visibleProducts.map((item) => (
                  <ProductButton key={item.id} item={item} onAdd={() => addItem(item)} />
                ))}
              </div>
            ) : (
              <div className="neon-surface rounded p-10 text-center">
                <Search className="mx-auto size-8 text-slate-300 dark:text-slate-600" />
                <p className="mt-3 text-sm font-bold text-slate-950 dark:text-white">Aucun article trouve</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Essaie un autre nom, SKU ou categorie.</p>
              </div>
            )}
          </div>
        </section>

        <aside className="neon-surface border-l border-slate-200 bg-white lg:sticky lg:top-16 lg:flex lg:h-[calc(100vh-4rem)] lg:flex-col dark:border-slate-800 dark:bg-slate-950">
          <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <div>
              <h2 className="font-bold text-slate-950 dark:text-white">Panier</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">{selectedCustomer?.name ?? 'Client comptoir'}</p>
            </div>
            <div className="grid size-10 place-items-center rounded bg-slate-950 text-white dark:bg-cyan-400 dark:text-slate-950">
              <ShoppingCart className="size-5" />
            </div>
          </div>

          <div className="min-h-[260px] flex-1 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
            {cart.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <ShoppingCart className="mx-auto size-10 text-slate-300 dark:text-slate-700" />
                <p className="mt-3 text-sm font-semibold text-slate-950 dark:text-white">Panier vide</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Ajoute un produit pour commencer.</p>
              </div>
            ) : (
              cart.map((line) => (
                <CartLineRow key={line.item.id} line={line} onChangeQuantity={updateQuantity} />
              ))
            )}
          </div>

          <div className="shrink-0 border-t border-slate-200 p-5 dark:border-slate-800">
            <div className="mb-4 space-y-2">
              <PriceLine label="Sous-total" value={formatMoney(subtotal)} />
              <div className="flex items-center justify-between border-t border-slate-200 pt-3 text-2xl font-bold text-slate-950 dark:border-slate-800 dark:text-white">
                <span>Total</span>
                <span>{formatMoney(total)}</span>
              </div>
            </div>

            <div className="mb-4 grid grid-cols-3 gap-2">
              <PaymentButton active={paymentMethod === 'cash'} icon={Wallet} label="Especes" onClick={() => setPaymentMethod('cash')} />
              <PaymentButton active={paymentMethod === 'mobile'} icon={Smartphone} label="Mobile" onClick={() => setPaymentMethod('mobile')} />
              <PaymentButton active={paymentMethod === 'card'} icon={CreditCard} label="Carte" onClick={() => setPaymentMethod('card')} />
            </div>

            {actionMessage ? (
              <div className="mb-3 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
                {actionMessage}
              </div>
            ) : null}

            <button
              onClick={checkout}
              disabled={cart.length === 0 || isCheckingOut}
              className="inline-flex w-full items-center justify-center gap-2 rounded bg-slate-950 px-4 py-4 text-base font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400 dark:bg-cyan-400 dark:text-slate-950 dark:hover:bg-cyan-300 dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
            >
              <ReceiptText className="size-5" />
              {isCheckingOut ? 'Encaissement...' : `Encaisser ${total > 0 ? formatMoney(total) : ''}`}
            </button>

            {lastTicket ? (
              <div className="mt-3 rounded border border-slate-200 px-3 py-2 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-300">
                <span className="font-bold text-slate-950 dark:text-white">{lastTicket.reference}</span> - {paymentLabel(lastTicket.paymentMethod)} - {lastTicket.customer}
                <button onClick={() => setIsTicketModalOpen(true)} className="mt-2 block font-bold text-slate-950 hover:underline dark:text-white">Voir le ticket</button>
              </div>
            ) : null}
          </div>
        </aside>
      </div>

      {isTicketModalOpen && lastTicket ? (
        <TicketModal
          companyName={activeCompany.name}
          ticket={lastTicket}
          onClose={() => setIsTicketModalOpen(false)}
          onPrint={printTicketSoon}
        />
      ) : null}
    </main>
  )
}

function ProductButton({ item, onAdd }: { item: CatalogItem; onAdd: () => void }) {
  const { formatMoney } = useMoney()
  const isLowStock = item.stock !== null && item.minStockLevel && item.stock <= item.minStockLevel

  return (
    <button onClick={onAdd} className="group overflow-hidden rounded border border-slate-200 bg-white text-left transition hover:-translate-y-0.5 hover:border-slate-400 hover:shadow-lg dark:border-slate-800 dark:bg-slate-950 dark:hover:border-cyan-500">
      <div className="relative aspect-square bg-slate-100 dark:bg-slate-900">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt={item.name} className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center text-slate-300 dark:text-slate-700">
            <ImageIcon className="size-8" />
          </div>
        )}
        <span className="absolute right-2 top-2 rounded border border-slate-200 bg-white/95 px-2 py-1 text-[11px] font-bold text-slate-950 dark:border-slate-700 dark:bg-slate-950/95 dark:text-white">
          {formatMoney(item.price)}
        </span>
        <span className="absolute left-2 top-2 rounded border border-slate-200 bg-white/95 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:border-slate-700 dark:bg-slate-950/95 dark:text-slate-300">
          {item.type === 'Service' ? 'Service' : 'Produit'}
        </span>
      </div>
      <div className="p-3">
        <p className="line-clamp-2 min-h-10 text-sm font-bold text-slate-950 dark:text-white">{item.name}</p>
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className={`truncate text-xs font-semibold ${isLowStock ? 'text-rose-600' : 'text-slate-500 dark:text-slate-400'}`}>
            {item.stock === null ? 'Prestation' : `${item.stock} en stock`}
          </span>
          <span className="grid size-8 place-items-center rounded bg-slate-950 text-white transition group-hover:bg-slate-800 dark:bg-cyan-400 dark:text-slate-950 dark:group-hover:bg-cyan-300">
            <Plus className="size-4" />
          </span>
        </div>
      </div>
    </button>
  )
}

function CartLineRow({ line, onChangeQuantity }: { line: CartLine; onChangeQuantity: (itemId: string, delta: number) => void }) {
  const { formatMoney } = useMoney()
  return (
    <div className="px-5 py-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded bg-slate-100 text-slate-300 dark:bg-slate-900 dark:text-slate-700">
            {line.item.imageUrl ? <img src={line.item.imageUrl} alt="" className="size-full object-cover" /> : <ImageIcon className="size-5" />}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-950 dark:text-white">{line.item.name}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{formatMoney(line.item.price)} / unite</p>
          </div>
        </div>
        <button onClick={() => onChangeQuantity(line.item.id, -line.quantity)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-950 dark:hover:bg-slate-900 dark:hover:text-white" aria-label="Retirer du panier">
          <Trash2 className="size-4" />
        </button>
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center rounded border border-slate-200 dark:border-slate-800">
          <button onClick={() => onChangeQuantity(line.item.id, -1)} className="p-2 text-slate-500 hover:text-slate-950 dark:hover:text-white" aria-label="Diminuer">
            <Minus className="size-3" />
          </button>
          <span className="w-9 text-center text-sm font-bold text-slate-950 dark:text-white">{line.quantity}</span>
          <button onClick={() => onChangeQuantity(line.item.id, 1)} className="p-2 text-slate-500 hover:text-slate-950 dark:hover:text-white" aria-label="Augmenter">
            <Plus className="size-3" />
          </button>
        </div>
        <span className="text-right font-bold text-slate-950 dark:text-white">{formatMoney(line.item.price * line.quantity)}</span>
      </div>
    </div>
  )
}

function CategoryButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} className={`shrink-0 rounded border px-4 py-2 text-sm font-bold transition ${active ? 'border-slate-950 bg-slate-950 text-white dark:border-cyan-400 dark:bg-cyan-400 dark:text-slate-950' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-950 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:border-cyan-500 dark:hover:text-white'}`}>
      {children}
    </button>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 px-3 py-1">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</p>
      <p className="truncate text-sm font-bold text-slate-950 dark:text-white">{value}</p>
    </div>
  )
}

function PaymentButton({ active, icon: Icon, label, onClick }: { active: boolean; icon: ComponentType<{ className?: string }>; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`inline-flex h-12 items-center justify-center gap-2 rounded border text-xs font-bold transition ${active ? 'border-slate-950 bg-slate-950 text-white dark:border-cyan-400 dark:bg-cyan-400 dark:text-slate-950' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-950 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:border-cyan-500 dark:hover:text-white'}`}>
      <Icon className="size-4" />
      {label}
    </button>
  )
}

function PriceLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-400">
      <span>{label}</span>
      <span className="font-semibold text-slate-900 dark:text-slate-100">{value}</span>
    </div>
  )
}

function TicketModal({ companyName, ticket, onClose, onPrint }: { companyName: string; ticket: CheckoutTicket; onClose: () => void; onPrint: () => void }) {
  const { formatMoney } = useMoney()
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 px-3 py-6 sm:items-center sm:px-4 sm:py-8" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-950">
        <div className="no-print flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-slate-950 dark:text-white">Ticket encaisse</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Impression lancee automatiquement.</p>
          </div>
          <button type="button" onClick={onClose} className="inline-flex size-9 items-center justify-center rounded border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-800 dark:hover:bg-slate-900 dark:hover:text-white" aria-label="Fermer">
            <X className="size-4" />
          </button>
        </div>

        <div className="p-5">
          <div className="ticket-print-area rounded border border-slate-200 bg-white p-5 text-slate-950 dark:border-slate-800">
            <div className="text-center">
              <p className="text-lg font-black uppercase tracking-wide">{companyName}</p>
              <p className="mt-1 text-xs text-slate-500">Ticket / facture caisse</p>
            </div>

            <div className="my-4 border-y border-dashed border-slate-300 py-3 text-xs">
              <TicketInfo label="Reference" value={ticket.reference} />
              <TicketInfo label="Date" value={ticket.createdAt} />
              <TicketInfo label="Client" value={ticket.customer} />
              <TicketInfo label="Paiement" value={paymentLabel(ticket.paymentMethod)} />
            </div>

            <div className="space-y-3">
              {ticket.lines.map((line) => (
                <div key={`${line.sku}-${line.name}`} className="text-sm">
                  <div className="flex justify-between gap-3">
                    <span className="font-bold">{line.name}</span>
                    <span className="font-bold">{formatMoney(line.total)}</span>
                  </div>
                  <div className="mt-1 flex justify-between text-xs text-slate-500">
                    <span>{line.sku}</span>
                    <span>{line.quantity} x {formatMoney(line.unitPrice)}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 border-t border-dashed border-slate-300 pt-3">
              <div className="flex items-center justify-between text-lg font-black">
                <span>Total</span>
                <span>{formatMoney(ticket.total)}</span>
              </div>
              <p className="mt-4 text-center text-xs text-slate-500">Merci pour votre achat.</p>
            </div>
          </div>

          <div className="no-print mt-4 grid grid-cols-2 gap-2">
            <button onClick={onClose} className="inline-flex h-11 items-center justify-center rounded border border-slate-300 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900">
              Fermer
            </button>
            <button onClick={onPrint} className="inline-flex h-11 items-center justify-center gap-2 rounded bg-slate-950 px-4 text-sm font-bold text-white hover:bg-slate-800 dark:bg-cyan-400 dark:text-slate-950 dark:hover:bg-cyan-300">
              <Printer className="size-4" />
              Imprimer
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function TicketInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 py-0.5">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-bold text-slate-950">{value}</span>
    </div>
  )
}

function paymentLabel(method: PaymentMethod) {
  if (method === 'mobile') return 'Mobile'
  if (method === 'card') return 'Carte'
  return 'Especes'
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
