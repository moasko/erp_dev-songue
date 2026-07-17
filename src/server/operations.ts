import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { prisma } from './db'
import type { Prisma, PrismaClient } from '@prisma/client'
import { computeDocumentTotals, lineTotal } from '~/utils/documentTotals'

async function getCompany(companySlug: string, permission: string) {
  const { requireCompanyAccess } = await import('./access')
  const { company } = await requireCompanyAccess(companySlug, permission)
  return company
}

async function getCompanyContext(companySlug: string, permission: string) {
  const { requireCompanyAccess } = await import('./access')
  const { company, user } = await requireCompanyAccess(companySlug, permission)
  return { company, user }
}

async function ensureAccount(companyId: string, type: string, name: string) {
  const existing = await prisma.bankAccount.findFirst({ where: { companyId, type, name } })
  if (existing) return existing
  return prisma.bankAccount.create({
    data: {
      companyId,
      name,
      type,
      currency: 'FCFA',
      balance: 0,
      status: 'Active',
    },
  })
}

async function ensureWarehouse(companyId: string) {
  const existing = await prisma.warehouse.findFirst({ where: { companyId } })
  if (existing) return existing
  return prisma.warehouse.create({
    data: {
      companyId,
      name: 'Depot principal',
      location: 'Boutique',
      capacity: 1000,
      usedCapacity: 0,
      status: 'Active',
    },
  })
}

async function ensureQuoteSettings(companyId: string, companyName: string) {
  const existing = await prisma.quoteSettings.findUnique({ where: { companyId } })
  if (existing) return existing
  return prisma.quoteSettings.create({
    data: {
      companyId,
      legalName: companyName,
      footerNote: 'Merci pour votre confiance.',
      paymentTerms: 'Validite 30 jours. Paiement selon accord commercial.',
      accentColor: '#0f172a',
      nextNumber: 1,
    },
  })
}

const quoteLineInput = z.object({
  itemId: z.string().optional(),
  description: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPrice: z.number().min(0),
  // null = la ligne suit le taux de TVA par defaut du document
  vatRate: z.number().int().min(0).max(100).nullable().optional(),
})

type Tx = Prisma.TransactionClient

// Numero de document sequentiel et sans doublon. L'upsert cree le compteur au
// premier document ; l'update increment prend un verrou de ligne : deux
// documents simultanes recoivent forcement deux numeros distincts.
async function nextDocumentNumber(tx: Tx, companyId: string, kind: string, prefix: string) {
  await tx.documentCounter.upsert({
    where: { companyId_kind: { companyId, kind } },
    update: {},
    create: { companyId, kind, nextNumber: 1 },
  })
  const counter = await tx.documentCounter.update({
    where: { companyId_kind: { companyId, kind } },
    data: { nextNumber: { increment: 1 } },
  })
  return `${prefix}-${String(counter.nextNumber - 1).padStart(5, '0')}`
}

// Trace d'audit : qui a fait quoi, sur quelle entite. Passe dans la meme
// transaction que la mutation pour ne jamais avoir d'action sans trace.
async function logAudit(
  client: Tx | PrismaClient,
  input: { companyId: string; actorId: string | null; action: string; entity: string; entityId: string; metadata?: Record<string, unknown> },
) {
  await client.auditLog.create({
    data: {
      companyId: input.companyId,
      actorId: input.actorId,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    },
  })
}

const optionalUrlInput = z.preprocess(
  (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
  z.string().url().optional(),
)

const optionalHexColorInput = z.preprocess(
  (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
  z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
)

export const createCatalogCategory = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    companySlug: z.string(),
    name: z.string().min(1),
    type: z.enum(['Product', 'Service']),
    color: z.string().default('slate'),
  }))
  .handler(async ({ data }) => {
    const company = await getCompany(data.companySlug, 'inventory.manage')
    return prisma.category.upsert({
      where: { companyId_name: { companyId: company.id, name: data.name.trim() } },
      update: { type: data.type, color: data.color },
      create: {
        companyId: company.id,
        name: data.name.trim(),
        type: data.type,
        color: data.color,
      },
    })
  })

export const createCatalogItem = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    companySlug: z.string(),
    name: z.string().min(1),
    sku: z.string().min(1),
    type: z.enum(['Product', 'Service']),
    description: z.string().optional(),
    supplier: z.string().optional(),
    categoryId: z.string().optional(),
    price: z.number().min(0),
    wholesalePrice: z.number().min(0).default(0),
    cost: z.number().min(0).default(0),
    stock: z.number().min(0).optional(),
    minStockLevel: z.number().min(0).optional(),
    imageUrl: z.string().optional(),
    status: z.enum(['Active', 'Draft', 'Archived']).default('Active'),
  }))
  .handler(async ({ data }) => {
    const { company, user } = await getCompanyContext(data.companySlug, 'inventory.manage')
    if (data.categoryId) {
      const category = await prisma.category.findFirst({
        where: { id: data.categoryId, companyId: company.id, type: data.type },
      })
      if (!category) throw new Error('Categorie invalide pour ce type.')
    }

    const item = await prisma.catalogItem.create({
      data: {
        companyId: company.id,
        name: data.name.trim(),
        sku: data.sku.trim(),
        type: data.type,
        description: data.description?.trim() || null,
        supplier: data.supplier?.trim() || null,
        categoryId: data.categoryId || null,
        price: Math.round(data.price),
        wholesalePrice: Math.round(data.wholesalePrice),
        cost: Math.round(data.cost),
        stock: data.type === 'Product' ? Math.round(data.stock ?? 0) : null,
        minStockLevel: data.type === 'Product' ? Math.round(data.minStockLevel ?? 0) : null,
        imageUrl: data.imageUrl?.trim() || null,
        status: data.status,
      },
      include: { category: true },
    })

    if (item.type === 'Product' && (item.stock ?? 0) > 0) {
      const warehouse = await ensureWarehouse(company.id)
      await prisma.stockMovement.create({
        data: {
          companyId: company.id,
          warehouseId: warehouse.id,
          itemId: item.id,
          type: 'In',
          quantity: item.stock ?? 0,
          reference: `INIT-${item.sku}`,
          reason: 'Stock initial',
          status: 'Completed',
        },
      })
    }

    await prisma.auditLog.create({
      data: {
        companyId: company.id,
        actorId: user.id,
        action: 'catalog.created',
        entity: 'CatalogItem',
        entityId: item.id,
        metadata: JSON.stringify({ type: item.type, sku: item.sku, status: item.status }),
      },
    })

    return item
  })

export const updateCatalogItemStatus = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    companySlug: z.string(),
    itemId: z.string(),
    status: z.enum(['Active', 'Draft', 'Archived']),
  }))
  .handler(async ({ data }) => {
    const { company, user } = await getCompanyContext(data.companySlug, 'inventory.manage')
    const item = await prisma.catalogItem.update({
      where: { id: data.itemId, companyId: company.id },
      data: { status: data.status },
      include: { category: true },
    })
    await prisma.auditLog.create({
      data: {
        companyId: company.id,
        actorId: user.id,
        action: 'catalog.status_updated',
        entity: 'CatalogItem',
        entityId: item.id,
        metadata: JSON.stringify({ status: item.status, sku: item.sku }),
      },
    })
    return item
  })

export const restockCatalogItem = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    companySlug: z.string(),
    itemId: z.string(),
    quantity: z.number().int().positive(),
    reason: z.string().optional(),
  }))
  .handler(async ({ data }) => {
    const { company, user } = await getCompanyContext(data.companySlug, 'inventory.manage')
    const existing = await prisma.catalogItem.findFirst({
      where: { id: data.itemId, companyId: company.id, type: 'Product' },
    })
    if (!existing) throw new Error('Produit introuvable.')

    const warehouse = await ensureWarehouse(company.id)
    const reference = `RESTOCK-${Date.now().toString().slice(-6)}`
    const item = await prisma.$transaction(async (tx) => {
      const updated = await tx.catalogItem.update({
        where: { id: existing.id },
        data: {
          stock: { increment: data.quantity },
          status: existing.status === 'Archived' ? existing.status : 'Active',
        },
        include: { category: true },
      })
      await tx.stockMovement.create({
        data: {
          companyId: company.id,
          warehouseId: warehouse.id,
          itemId: existing.id,
          type: 'In',
          quantity: data.quantity,
          reference,
          reason: data.reason?.trim() || 'Reapprovisionnement',
          status: 'Completed',
        },
      })
      await tx.auditLog.create({
        data: {
          companyId: company.id,
          actorId: user.id,
          action: 'catalog.restocked',
          entity: 'CatalogItem',
          entityId: existing.id,
          metadata: JSON.stringify({ quantity: data.quantity, reference, sku: existing.sku }),
        },
      })
      return updated
    })

    return item
  })

export const createQuote = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    companySlug: z.string(),
    customerId: z.string().optional(),
    customerName: z.string().optional(),
    customerEmail: z.string().optional(),
    title: z.string().min(1),
    validUntil: z.string().min(1),
    discountRate: z.number().min(0).max(100).default(0),
    taxRate: z.number().min(0).max(100).default(0),
    notes: z.string().optional(),
    terms: z.string().optional(),
    lines: z.array(quoteLineInput).min(1),
  }))
  .handler(async ({ data }) => {
    const { company, user } = await getCompanyContext(data.companySlug, 'invoice.create')
    const settings = await ensureQuoteSettings(company.id, company.name)

    let customerId = data.customerId || undefined
    if (!customerId && data.customerName?.trim()) {
      const customer = await prisma.customer.create({
        data: {
          companyId: company.id,
          name: data.customerName.trim(),
          email: data.customerEmail?.trim() || null,
        },
      })
      customerId = customer.id
    }

    const normalizedLines = data.lines.map((line) => ({
      ...line,
      unitPrice: Math.round(line.unitPrice),
      vatRate: line.vatRate ?? null,
    }))
    const totals = computeDocumentTotals(normalizedLines, data.discountRate, data.taxRate)

    return prisma.$transaction(async (tx) => {
      // Increment atomique : deux devis simultanes ne peuvent pas recevoir la
      // meme reference (contrainte unique companyId+reference sinon violee).
      const numbering = await tx.quoteSettings.update({
        where: { companyId: company.id },
        data: { nextNumber: { increment: 1 } },
      })
      const reference = `DEV-${String(numbering.nextNumber - 1).padStart(5, '0')}`

      const quote = await tx.quote.create({
        data: {
          companyId: company.id,
          customerId: customerId ?? null,
          reference,
          title: data.title.trim(),
          validUntil: new Date(data.validUntil),
          discountRate: Math.round(data.discountRate),
          taxRate: Math.round(data.taxRate),
          subtotalCents: totals.subtotal,
          totalCents: totals.total,
          notes: data.notes?.trim() || null,
          terms: data.terms?.trim() || settings.paymentTerms,
          lines: {
            create: normalizedLines.map((line, index) => ({
              itemId: line.itemId || null,
              description: line.description.trim(),
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              totalCents: lineTotal(line),
              vatRate: line.vatRate,
              sortOrder: index,
            })),
          },
        },
        include: { customer: true, lines: { include: { item: true }, orderBy: { sortOrder: 'asc' } } },
      })
      await logAudit(tx, {
        companyId: company.id,
        actorId: user.id,
        action: 'quote.created',
        entity: 'Quote',
        entityId: quote.id,
        metadata: { reference, totalCents: totals.total },
      })
      return quote
    })
  })

export const updateQuoteStatus = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    companySlug: z.string(),
    quoteId: z.string(),
    status: z.enum(['Draft', 'Sent', 'Accepted', 'Rejected', 'Expired']),
  }))
  .handler(async ({ data }) => {
    const { company, user } = await getCompanyContext(data.companySlug, 'invoice.update')
    const quote = await prisma.quote.update({
      where: { id: data.quoteId, companyId: company.id },
      data: {
        status: data.status,
        acceptedAt: data.status === 'Accepted' ? new Date() : null,
      },
      include: { customer: true, lines: { include: { item: true }, orderBy: { sortOrder: 'asc' } } },
    })
    await logAudit(prisma, {
      companyId: company.id,
      actorId: user.id,
      action: 'quote.status_updated',
      entity: 'Quote',
      entityId: quote.id,
      metadata: { reference: quote.reference, status: data.status },
    })
    return quote
  })

export const saveQuoteSettings = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    companySlug: z.string(),
    logoUrl: optionalUrlInput,
    legalName: z.string().optional(),
    address: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().optional(),
    taxId: z.string().optional(),
    footerNote: z.string().optional(),
    paymentTerms: z.string().optional(),
    accentColor: optionalHexColorInput,
  }))
  .handler(async ({ data }) => {
    const company = await getCompany(data.companySlug, 'company.manage')
    await ensureQuoteSettings(company.id, company.name)

    return prisma.quoteSettings.update({
      where: { companyId: company.id },
      data: {
        logoUrl: data.logoUrl?.trim() || null,
        legalName: data.legalName?.trim() || company.name,
        address: data.address?.trim() || null,
        phone: data.phone?.trim() || null,
        email: data.email?.trim() || null,
        taxId: data.taxId?.trim() || null,
        footerNote: data.footerNote?.trim() || 'Merci pour votre confiance.',
        paymentTerms: data.paymentTerms?.trim() || 'Validite 30 jours. Paiement selon accord commercial.',
        accentColor: data.accentColor?.trim() || '#0f172a',
      },
    })
  })

export const createCrmLead = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    companySlug: z.string(),
    name: z.string().min(1),
    company: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
    source: z.string().default('POS'),
  }))
  .handler(async ({ data }) => {
    const company = await getCompany(data.companySlug, 'customer.create')
    return prisma.$transaction(async (tx) => {
      const customer = await tx.customer.create({
        data: {
          companyId: company.id,
          name: data.name.trim(),
          email: data.email?.trim() || null,
        },
      })
      const lead = await tx.lead.create({
        data: {
          companyId: company.id,
          name: data.name.trim(),
          company: data.company?.trim() || null,
          email: data.email?.trim() || null,
          phone: data.phone?.trim() || null,
          source: data.source,
          status: 'New',
          score: 0,
        },
      })
      return { lead, customer }
    })
  })

export const createFinanceTransaction = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    companySlug: z.string(),
    accountId: z.string().optional(),
    description: z.string().min(1),
    amount: z.number().positive(),
    type: z.enum(['Income', 'Expense']),
    category: z.string().min(1),
    reference: z.string().optional(),
  }))
  .handler(async ({ data }) => {
    const company = await getCompany(data.companySlug, 'finance.manage')
    const fallback = await ensureAccount(company.id, 'Cash', 'Caisse boutique')
    const accountId = data.accountId || fallback.id
    const amount = Math.round(data.amount)
    return prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.create({
        data: {
          companyId: company.id,
          accountId,
          description: data.description.trim(),
          amount,
          type: data.type,
          category: data.category.trim(),
          reference: data.reference?.trim() || null,
          status: 'Completed',
        },
      })
      await tx.bankAccount.update({
        where: { id: accountId, companyId: company.id },
        data: { balance: { increment: data.type === 'Income' ? amount : -amount } },
      })
      return transaction
    })
  })

export const createPurchaseInvoice = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    companySlug: z.string(),
    accountId: z.string().optional(),
    vendorName: z.string().min(1),
    reference: z.string().optional(),
    category: z.string().min(1),
    amount: z.number().positive(),
    status: z.enum(['Pending', 'Paid']).default('Paid'),
    notes: z.string().optional(),
  }))
  .handler(async ({ data }) => {
    const company = await getCompany(data.companySlug, 'finance.manage')
    const account = data.accountId
      ? await prisma.bankAccount.findFirst({ where: { id: data.accountId, companyId: company.id } })
      : await ensureAccount(company.id, 'Cash', 'Caisse boutique')
    if (!account) throw new Error('Compte introuvable.')

    const amount = Math.round(data.amount)
    const vendor = await prisma.vendor.findFirst({
      where: { companyId: company.id, name: data.vendorName.trim() },
    })

    return prisma.$transaction(async (tx) => {
      const reference = data.reference?.trim() || await nextDocumentNumber(tx, company.id, 'purchaseInvoice', 'ACH')
      const invoice = await tx.purchaseInvoice.create({
        data: {
          companyId: company.id,
          vendorId: vendor?.id ?? null,
          vendorName: data.vendorName.trim(),
          reference,
          category: data.category.trim(),
          totalCents: amount,
          paidCents: data.status === 'Paid' ? amount : 0,
          status: data.status,
          notes: data.notes?.trim() || null,
        },
        include: { vendor: true },
      })

      if (data.status === 'Paid') {
        const transaction = await tx.transaction.create({
          data: {
            companyId: company.id,
            accountId: account.id,
            description: `${invoice.vendorName} - ${invoice.reference}`,
            amount,
            type: 'Expense',
            category: invoice.category,
            reference,
            status: 'Completed',
          },
        })
        await tx.payment.create({
          data: {
            companyId: company.id,
            accountId: account.id,
            transactionId: transaction.id,
            purchaseInvoiceId: invoice.id,
            amount,
            direction: 'Out',
            method: account.type,
            reference,
          },
        })
        await tx.bankAccount.update({
          where: { id: account.id },
          data: { balance: { decrement: amount } },
        })
      }

      return invoice
    })
  })

const invoiceInclude = {
  customer: true,
  quote: { select: { id: true, reference: true } },
  lines: { include: { item: true }, orderBy: { sortOrder: 'asc' as const } },
  payments: { orderBy: { date: 'desc' as const } },
}

export const createSalesInvoice = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    companySlug: z.string(),
    customerId: z.string().optional(),
    customerName: z.string().optional(),
    customerEmail: z.string().optional(),
    accountId: z.string().optional(),
    title: z.string().optional(),
    dueDate: z.string().optional(),
    discountRate: z.number().min(0).max(100).default(0),
    taxRate: z.number().min(0).max(100).default(0),
    status: z.enum(['Draft', 'Sent', 'Paid']).default('Draft'),
    notes: z.string().optional(),
    terms: z.string().optional(),
    lines: z.array(quoteLineInput).min(1),
  }))
  .handler(async ({ data }) => {
    const { company, user } = await getCompanyContext(data.companySlug, 'invoice.create')
    const settings = await ensureQuoteSettings(company.id, company.name)

    let customerId = data.customerId || undefined
    if (!customerId && data.customerName?.trim()) {
      const customer = await prisma.customer.create({
        data: {
          companyId: company.id,
          name: data.customerName.trim(),
          email: data.customerEmail?.trim() || null,
        },
      })
      customerId = customer.id
    }

    const normalizedLines = data.lines.map((line) => ({
      ...line,
      unitPrice: Math.round(line.unitPrice),
      vatRate: line.vatRate ?? null,
    }))
    const totals = computeDocumentTotals(normalizedLines, data.discountRate, data.taxRate)

    // Comme pour les factures d'achat : une facture payee impacte la
    // tresorerie (transaction + paiement + solde du compte).
    const account = data.status === 'Paid'
      ? data.accountId
        ? await prisma.bankAccount.findFirst({ where: { id: data.accountId, companyId: company.id } })
        : await ensureAccount(company.id, 'Cash', 'Caisse boutique')
      : null
    if (data.status === 'Paid' && !account) throw new Error('Compte introuvable.')

    return prisma.$transaction(async (tx) => {
      const number = await nextDocumentNumber(tx, company.id, 'salesInvoice', 'FAC')

      const invoice = await tx.salesInvoice.create({
        data: {
          companyId: company.id,
          customerId: customerId ?? null,
          number,
          title: data.title?.trim() || null,
          dueDate: data.dueDate ? new Date(data.dueDate) : defaultDueDate(),
          status: data.status,
          discountRate: Math.round(data.discountRate),
          taxRate: Math.round(data.taxRate),
          subtotalCents: totals.subtotal,
          taxCents: totals.taxTotal,
          totalCents: totals.total,
          paidCents: data.status === 'Paid' ? totals.total : 0,
          notes: data.notes?.trim() || null,
          terms: data.terms?.trim() || settings.paymentTerms,
          lines: {
            create: normalizedLines.map((line, index) => ({
              itemId: line.itemId || null,
              description: line.description.trim(),
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              totalCents: lineTotal(line),
              vatRate: line.vatRate,
              sortOrder: index,
            })),
          },
        },
        include: invoiceInclude,
      })

      if (data.status === 'Paid' && account) {
        await registerInvoicePayment(tx, {
          companyId: company.id,
          account,
          invoice: { id: invoice.id, number, customerName: invoice.customer?.name ?? null },
          amount: totals.total,
        })
      }

      await logAudit(tx, {
        companyId: company.id,
        actorId: user.id,
        action: 'invoice.created',
        entity: 'SalesInvoice',
        entityId: invoice.id,
        metadata: { number, totalCents: totals.total, status: data.status },
      })

      return invoice
    })
  })

// Echeance par defaut : 30 jours apres emission.
function defaultDueDate() {
  const date = new Date()
  date.setDate(date.getDate() + 30)
  return date
}

// Encaissement d'une facture : le paiement, la transaction de tresorerie et le
// solde du compte bougent ensemble, dans la transaction de l'appelant.
async function registerInvoicePayment(
  tx: Tx,
  input: {
    companyId: string
    account: { id: string; type: string }
    invoice: { id: string; number: string; customerName: string | null }
    amount: number
    method?: string
  },
) {
  const transaction = await tx.transaction.create({
    data: {
      companyId: input.companyId,
      accountId: input.account.id,
      description: input.invoice.customerName
        ? `${input.invoice.customerName} - ${input.invoice.number}`
        : `Facture ${input.invoice.number}`,
      amount: input.amount,
      type: 'Income',
      category: 'Ventes',
      reference: input.invoice.number,
      status: 'Completed',
    },
  })
  await tx.payment.create({
    data: {
      companyId: input.companyId,
      accountId: input.account.id,
      transactionId: transaction.id,
      salesInvoiceId: input.invoice.id,
      amount: input.amount,
      direction: 'In',
      method: input.method ?? input.account.type,
      reference: input.invoice.number,
    },
  })
  await tx.bankAccount.update({
    where: { id: input.account.id },
    data: { balance: { increment: input.amount } },
  })
}

// Conversion d'un devis en facture : les lignes, remise et taux de TVA sont
// figes tels quels ; la facture recoit son propre numero sequentiel et reste
// liee au devis d'origine.
export const convertQuoteToInvoice = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    companySlug: z.string(),
    quoteId: z.string(),
    dueDate: z.string().optional(),
  }))
  .handler(async ({ data }) => {
    const { company, user } = await getCompanyContext(data.companySlug, 'invoice.create')
    const quote = await prisma.quote.findFirst({
      where: { id: data.quoteId, companyId: company.id },
      include: { customer: true, lines: { orderBy: { sortOrder: 'asc' } } },
    })
    if (!quote) throw new Error('Devis introuvable.')
    if (!quote.lines.length) throw new Error('Ce devis ne contient aucune ligne.')

    const existing = await prisma.salesInvoice.findFirst({
      where: { companyId: company.id, quoteId: quote.id, status: { not: 'Cancelled' } },
    })
    if (existing) throw new Error(`Ce devis est deja facture (${existing.number}).`)

    // Recalcul avec l'algorithme commun : pour un devis cree par l'application
    // le resultat est identique aux montants stockes, et la facture repart d'une
    // ventilation HT/TVA coherente ligne a ligne.
    const totals = computeDocumentTotals(quote.lines, quote.discountRate, quote.taxRate)

    return prisma.$transaction(async (tx) => {
      const number = await nextDocumentNumber(tx, company.id, 'salesInvoice', 'FAC')

      const invoice = await tx.salesInvoice.create({
        data: {
          companyId: company.id,
          customerId: quote.customerId,
          quoteId: quote.id,
          number,
          title: quote.title,
          dueDate: data.dueDate ? new Date(data.dueDate) : defaultDueDate(),
          status: 'Draft',
          discountRate: quote.discountRate,
          taxRate: quote.taxRate,
          subtotalCents: totals.subtotal,
          taxCents: totals.taxTotal,
          totalCents: totals.total,
          currency: quote.currency,
          notes: quote.notes,
          terms: quote.terms,
          lines: {
            create: quote.lines.map((line) => ({
              itemId: line.itemId,
              description: line.description,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              totalCents: line.totalCents,
              vatRate: line.vatRate,
              sortOrder: line.sortOrder,
            })),
          },
        },
        include: invoiceInclude,
      })

      // Un devis facture est de fait accepte.
      if (quote.status !== 'Accepted') {
        await tx.quote.update({
          where: { id: quote.id },
          data: { status: 'Accepted', acceptedAt: quote.acceptedAt ?? new Date() },
        })
      }

      await logAudit(tx, {
        companyId: company.id,
        actorId: user.id,
        action: 'invoice.created_from_quote',
        entity: 'SalesInvoice',
        entityId: invoice.id,
        metadata: { number, quoteReference: quote.reference, totalCents: quote.totalCents },
      })

      return invoice
    })
  })

export const updateSalesInvoiceStatus = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    companySlug: z.string(),
    invoiceId: z.string(),
    status: z.enum(['Draft', 'Sent', 'Cancelled']),
  }))
  .handler(async ({ data }) => {
    const { company, user } = await getCompanyContext(data.companySlug, 'invoice.update')
    const existing = await prisma.salesInvoice.findFirst({
      where: { id: data.invoiceId, companyId: company.id },
    })
    if (!existing) throw new Error('Facture introuvable.')
    if (existing.paidCents > 0 && data.status === 'Cancelled') {
      throw new Error('Impossible d\'annuler une facture partiellement ou totalement encaissee.')
    }

    const invoice = await prisma.salesInvoice.update({
      where: { id: existing.id },
      data: { status: data.status },
      include: invoiceInclude,
    })
    await logAudit(prisma, {
      companyId: company.id,
      actorId: user.id,
      action: 'invoice.status_updated',
      entity: 'SalesInvoice',
      entityId: invoice.id,
      metadata: { number: invoice.number, status: data.status },
    })
    return invoice
  })

export const recordInvoicePayment = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    companySlug: z.string(),
    invoiceId: z.string(),
    accountId: z.string().optional(),
    amount: z.number().positive(),
    method: z.string().optional(),
  }))
  .handler(async ({ data }) => {
    const { company, user } = await getCompanyContext(data.companySlug, 'finance.manage')
    const invoice = await prisma.salesInvoice.findFirst({
      where: { id: data.invoiceId, companyId: company.id },
      include: { customer: true },
    })
    if (!invoice) throw new Error('Facture introuvable.')
    if (invoice.status === 'Cancelled') throw new Error('Cette facture est annulee.')

    const amount = Math.round(data.amount)
    const remaining = invoice.totalCents - invoice.paidCents
    if (amount > remaining) {
      throw new Error(`Le paiement depasse le reste a payer (${remaining}).`)
    }

    const account = data.accountId
      ? await prisma.bankAccount.findFirst({ where: { id: data.accountId, companyId: company.id } })
      : await ensureAccount(company.id, 'Cash', 'Caisse boutique')
    if (!account) throw new Error('Compte introuvable.')

    return prisma.$transaction(async (tx) => {
      await registerInvoicePayment(tx, {
        companyId: company.id,
        account,
        invoice: { id: invoice.id, number: invoice.number, customerName: invoice.customer?.name ?? null },
        amount,
        method: data.method,
      })

      const paidCents = invoice.paidCents + amount
      const updated = await tx.salesInvoice.update({
        where: { id: invoice.id },
        data: {
          paidCents,
          status: paidCents >= invoice.totalCents ? 'Paid' : 'PartiallyPaid',
        },
        include: invoiceInclude,
      })

      await logAudit(tx, {
        companyId: company.id,
        actorId: user.id,
        action: 'invoice.payment_recorded',
        entity: 'SalesInvoice',
        entityId: invoice.id,
        metadata: { number: invoice.number, amount, paidCents },
      })

      return updated
    })
  })

// Envoi du document au client par email : rendu HTML fidele au modele imprime
// (mentions legales, ventilation TVA, total en lettres). Le statut passe a
// « Envoye » des que l'email part.
export const sendDocumentByEmail = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    companySlug: z.string(),
    kind: z.enum(['quote', 'invoice']),
    documentId: z.string(),
    // Adresse de destination : par defaut celle du client.
    to: z.string().email().optional(),
  }))
  .handler(async ({ data }) => {
    const { company, user } = await getCompanyContext(data.companySlug, 'invoice.update')
    const { sendMail, mailIsConfigured } = await import('./mail')
    const { documentEmail } = await import('./documentEmail')
    const settings = await ensureQuoteSettings(company.id, company.name)

    const source = data.kind === 'quote'
      ? await prisma.quote.findFirst({
          where: { id: data.documentId, companyId: company.id },
          include: { customer: true, lines: { orderBy: { sortOrder: 'asc' } } },
        })
      : await prisma.salesInvoice.findFirst({
          where: { id: data.documentId, companyId: company.id },
          include: { customer: true, lines: { orderBy: { sortOrder: 'asc' } } },
        })
    if (!source) throw new Error('Document introuvable.')

    const to = data.to?.trim() || source.customer?.email?.trim()
    if (!to) throw new Error('Ce client n\'a pas d\'adresse email. Renseigne une adresse de destination.')

    const isQuote = data.kind === 'quote'
    const reference = isQuote ? (source as any).reference : (source as any).number
    const message = documentEmail({
      doc: {
        kind: data.kind,
        reference,
        title: (source as any).title,
        issueDate: source.issueDate,
        deadline: isQuote ? (source as any).validUntil : (source as any).dueDate,
        customerName: source.customer?.name ?? 'Client',
        lines: source.lines,
        discountRate: (source as any).discountRate ?? 0,
        taxRate: (source as any).taxRate ?? 0,
        notes: source.notes,
        terms: (source as any).terms,
        paidCents: isQuote ? 0 : (source as any).paidCents,
      },
      settings,
      companyName: company.name,
      currency: company.currency,
      locale: company.locale,
    })

    const result = await sendMail({ to, ...message })
    if (!result.ok) throw new Error(result.message || 'L\'email n\'a pas pu etre envoye.')

    // Brouillon envoye = document officiellement transmis.
    const updated = isQuote
      ? await prisma.quote.update({
          where: { id: source.id },
          data: source.status === 'Draft' ? { status: 'Sent' } : {},
          include: { customer: true, lines: { include: { item: true }, orderBy: { sortOrder: 'asc' } } },
        })
      : await prisma.salesInvoice.update({
          where: { id: source.id },
          data: source.status === 'Draft' ? { status: 'Sent' } : {},
          include: invoiceInclude,
        })

    await logAudit(prisma, {
      companyId: company.id,
      actorId: user.id,
      action: isQuote ? 'quote.emailed' : 'invoice.emailed',
      entity: isQuote ? 'Quote' : 'SalesInvoice',
      entityId: source.id,
      metadata: { reference, to },
    })

    return { document: updated, delivered: result.delivered, mailConfigured: mailIsConfigured() }
  })

// Relance manuelle d'une facture : ignore le delai entre relances automatiques,
// mais exige un email client.
export const sendInvoiceReminder = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    companySlug: z.string(),
    invoiceId: z.string(),
  }))
  .handler(async ({ data }) => {
    const { company, user } = await getCompanyContext(data.companySlug, 'invoice.update')
    const { sendMail } = await import('./mail')
    const { invoiceReminderEmail } = await import('./documentEmail')

    const invoice = await prisma.salesInvoice.findFirst({
      where: { id: data.invoiceId, companyId: company.id },
      include: { customer: true },
    })
    if (!invoice) throw new Error('Facture introuvable.')
    const remaining = invoice.totalCents - invoice.paidCents
    if (remaining <= 0) throw new Error('Cette facture est deja soldee.')
    if (!invoice.customer?.email) throw new Error('Ce client n\'a pas d\'adresse email.')

    const settings = await ensureQuoteSettings(company.id, company.name)
    const message = invoiceReminderEmail({
      reference: invoice.number,
      customerName: invoice.customer.name,
      sellerName: settings.legalName || company.name,
      dueDate: invoice.dueDate,
      remaining,
      currency: company.currency,
      locale: company.locale,
      sellerPhone: settings.phone,
      sellerEmail: settings.email,
    })
    const result = await sendMail({ to: invoice.customer.email, ...message })
    if (!result.ok) throw new Error(result.message || 'L\'email n\'a pas pu etre envoye.')

    const updated = await prisma.salesInvoice.update({
      where: { id: invoice.id },
      data: { lastReminderAt: new Date() },
      include: invoiceInclude,
    })
    await logAudit(prisma, {
      companyId: company.id,
      actorId: user.id,
      action: 'invoice.reminder_sent',
      entity: 'SalesInvoice',
      entityId: invoice.id,
      metadata: { number: invoice.number, remaining, to: invoice.customer.email },
    })
    return updated
  })

// Relance groupee : marque les factures echues « en retard » puis envoie un
// rappel a chaque client (au plus une relance tous les 3 jours par facture).
export const runInvoiceReminders = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ companySlug: z.string() }))
  .handler(async ({ data }) => {
    const { company, user } = await getCompanyContext(data.companySlug, 'invoice.update')
    const { processOverdueInvoices } = await import('./reminders')
    return processOverdueInvoices(company.id, user.id)
  })

export const createPosSale = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    companySlug: z.string(),
    customerId: z.string().optional(),
    paymentMethod: z.enum(['cash', 'mobile', 'card']),
    lines: z.array(z.object({
      itemId: z.string(),
      quantity: z.number().int().positive(),
    })).min(1),
  }))
  .handler(async ({ data }) => {
    const company = await getCompany(data.companySlug, 'finance.manage')
    const requestedQuantities = new Map<string, number>()
    for (const line of data.lines) {
      requestedQuantities.set(line.itemId, (requestedQuantities.get(line.itemId) ?? 0) + line.quantity)
    }
    const itemIds = Array.from(requestedQuantities.keys())
    const items = await prisma.catalogItem.findMany({ where: { companyId: company.id, id: { in: itemIds }, status: 'Active' } })
    if (items.length !== itemIds.length) throw new Error('Un produit du panier est introuvable ou inactif.')

    for (const item of items) {
      const requested = requestedQuantities.get(item.id) ?? 0
      if (item.stock !== null && requested > item.stock) {
        throw new Error(`Stock insuffisant pour ${item.name}. Disponible: ${item.stock}.`)
      }
    }

    const lineItems = itemIds.map((itemId) => {
      const item = items.find((candidate: { id: string }) => candidate.id === itemId)
      if (!item) throw new Error('Produit introuvable.')
      const quantity = requestedQuantities.get(itemId) ?? 0
      return { item, quantity, total: item.price * quantity }
    })
    const total = lineItems.reduce((sum, line) => sum + line.total, 0)
    const reference = `POS-${Date.now().toString().slice(-6)}`
    const account = data.paymentMethod === 'mobile'
      ? await ensureAccount(company.id, 'Cash', 'Mobile money')
      : data.paymentMethod === 'card'
        ? await ensureAccount(company.id, 'CreditCard', 'Paiement carte')
        : await ensureAccount(company.id, 'Cash', 'Caisse boutique')
    const warehouse = lineItems.some((line) => line.item.stock !== null) ? await ensureWarehouse(company.id) : null

    const transaction = await prisma.$transaction(async (tx) => {
      for (const line of lineItems) {
        if (line.item.stock !== null) {
          // Decrement conditionnel : deux ventes simultanees du meme article ne
          // peuvent pas faire passer le stock en negatif (la verification
          // au-dessus est hors transaction, donc non suffisante).
          const updated = await tx.catalogItem.updateMany({
            where: { id: line.item.id, companyId: company.id, stock: { gte: line.quantity } },
            data: { stock: { decrement: line.quantity } },
          })
          if (updated.count === 0) {
            throw new Error(`Stock insuffisant pour ${line.item.name}.`)
          }
          await tx.stockMovement.create({
            data: {
              companyId: company.id,
              warehouseId: warehouse!.id,
              itemId: line.item.id,
              type: 'Out',
              quantity: line.quantity,
              reference,
              reason: 'Vente POS',
              status: 'Completed',
            },
          })
        }
      }

      await tx.bankAccount.update({
        where: { id: account.id },
        data: { balance: { increment: total } },
      })

      return tx.transaction.create({
        data: {
          companyId: company.id,
          accountId: account.id,
          description: `Vente caisse ${reference}`,
          amount: total,
          type: 'Income',
          category: 'POS',
          reference,
          status: 'Completed',
        },
      })
    })

    const customer = data.customerId ? await prisma.customer.findFirst({ where: { id: data.customerId, companyId: company.id } }) : null
    return {
      reference,
      customer: customer?.name ?? 'Client comptoir',
      total,
      items: data.lines.reduce((sum, line) => sum + line.quantity, 0),
      paymentMethod: data.paymentMethod,
      createdAt: transaction.date.toISOString(),
    }
  })

export const createVendor = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    companySlug: z.string(),
    name: z.string().min(1),
    category: z.string().min(1),
    owner: z.string().min(1),
    city: z.string().min(1),
    email: z.string().min(1),
    phone: z.string().min(1),
    contract: z.string().min(1),
    paymentTerms: z.string().min(1),
  }))
  .handler(async ({ data }) => {
    const company = await getCompany(data.companySlug, 'finance.manage')
    return prisma.vendor.create({
      data: {
        companyId: company.id,
        name: data.name.trim(),
        category: data.category.trim(),
        owner: data.owner.trim(),
        city: data.city.trim(),
        email: data.email.trim(),
        phone: data.phone.trim(),
        contract: data.contract.trim(),
        paymentTerms: data.paymentTerms.trim(),
        spend: '0 FCFA',
        orders: 0,
        onTime: 100,
        quality: 100,
        risk: 'Faible',
        status: 'Actif',
        nextReview: new Date(new Date().setMonth(new Date().getMonth() + 6)).toLocaleDateString('fr-FR'),
      },
    })
  })

export const updateVendor = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    companySlug: z.string(),
    id: z.string(),
    status: z.enum(['Strategique', 'Actif', 'A surveiller', 'Suspendu']).optional(),
    risk: z.enum(['Faible', 'Moyen', 'Eleve']).optional(),
  }))
  .handler(async ({ data }) => {
    const company = await getCompany(data.companySlug, 'finance.manage')
    return prisma.vendor.update({
      where: { id: data.id, companyId: company.id },
      data: {
        ...(data.status ? { status: data.status } : {}),
        ...(data.risk ? { risk: data.risk } : {}),
      },
    })
  })

export const deleteVendor = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    companySlug: z.string(),
    id: z.string(),
  }))
  .handler(async ({ data }) => {
    const company = await getCompany(data.companySlug, 'finance.manage')
    return prisma.vendor.delete({
      where: { id: data.id, companyId: company.id },
    })
  })
