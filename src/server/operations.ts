import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { prisma } from './db'
import type { PrismaClient } from '@prisma/client'

async function getCompany(companySlug: string, permission: string) {
  const { requireCompanyAccess } = await import('./access')
  const { company } = await requireCompanyAccess(companySlug, permission)
  return company
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
})

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
    const company = await getCompany(data.companySlug, 'inventory.manage')
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
    const company = await getCompany(data.companySlug, 'inventory.manage')
    const item = await prisma.catalogItem.update({
      where: { id: data.itemId, companyId: company.id },
      data: { status: data.status },
      include: { category: true },
    })
    await prisma.auditLog.create({
      data: {
        companyId: company.id,
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
    const company = await getCompany(data.companySlug, 'inventory.manage')
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
    const company = await getCompany(data.companySlug, 'invoice.create')
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

    const subtotal = data.lines.reduce((sum, line) => sum + Math.round(line.quantity * line.unitPrice), 0)
    const discount = Math.round(subtotal * (data.discountRate / 100))
    const taxable = Math.max(0, subtotal - discount)
    const tax = Math.round(taxable * (data.taxRate / 100))
    const total = taxable + tax
    const reference = `DEV-${String(settings.nextNumber).padStart(5, '0')}`

    return prisma.$transaction(async (tx) => {
      await tx.quoteSettings.update({
        where: { companyId: company.id },
        data: { nextNumber: { increment: 1 } },
      })

      return tx.quote.create({
        data: {
          companyId: company.id,
          customerId: customerId ?? null,
          reference,
          title: data.title.trim(),
          validUntil: new Date(data.validUntil),
          discountRate: Math.round(data.discountRate),
          taxRate: Math.round(data.taxRate),
          subtotalCents: subtotal,
          totalCents: total,
          notes: data.notes?.trim() || null,
          terms: data.terms?.trim() || settings.paymentTerms,
          lines: {
            create: data.lines.map((line, index) => ({
              itemId: line.itemId || null,
              description: line.description.trim(),
              quantity: line.quantity,
              unitPrice: Math.round(line.unitPrice),
              totalCents: Math.round(line.quantity * line.unitPrice),
              sortOrder: index,
            })),
          },
        },
        include: { customer: true, lines: { include: { item: true }, orderBy: { sortOrder: 'asc' } } },
      })
    })
  })

export const updateQuoteStatus = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    companySlug: z.string(),
    quoteId: z.string(),
    status: z.enum(['Draft', 'Sent', 'Accepted', 'Rejected', 'Expired']),
  }))
  .handler(async ({ data }) => {
    const company = await getCompany(data.companySlug, 'invoice.update')
    return prisma.quote.update({
      where: { id: data.quoteId, companyId: company.id },
      data: {
        status: data.status,
        acceptedAt: data.status === 'Accepted' ? new Date() : null,
      },
      include: { customer: true, lines: { include: { item: true }, orderBy: { sortOrder: 'asc' } } },
    })
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
    const customer = await prisma.customer.create({
      data: {
        companyId: company.id,
        name: data.name.trim(),
        email: data.email?.trim() || null,
      },
    })
    const lead = await prisma.lead.create({
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
    const transaction = await prisma.transaction.create({
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
    await prisma.bankAccount.update({
      where: { id: accountId },
      data: { balance: { increment: data.type === 'Income' ? amount : -amount } },
    })
    return transaction
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
    const reference = data.reference?.trim() || `ACH-${Date.now().toString().slice(-6)}`
    const vendor = await prisma.vendor.findFirst({
      where: { companyId: company.id, name: data.vendorName.trim() },
    })

    return prisma.$transaction(async (tx) => {
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

export const createSalesInvoice = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    companySlug: z.string(),
    customerId: z.string().optional(),
    customerName: z.string().optional(),
    number: z.string().optional(),
    amount: z.number().positive(),
    status: z.enum(['Draft', 'Sent', 'Paid']).default('Draft'),
    notes: z.string().optional(),
  }))
  .handler(async ({ data }) => {
    const company = await getCompany(data.companySlug, 'invoice.create')
    let customerId = data.customerId || undefined
    if (!customerId && data.customerName?.trim()) {
      const customer = await prisma.customer.create({
        data: {
          companyId: company.id,
          name: data.customerName.trim(),
        },
      })
      customerId = customer.id
    }

    const amount = Math.round(data.amount)
    return prisma.salesInvoice.create({
      data: {
        companyId: company.id,
        customerId: customerId ?? null,
        number: data.number?.trim() || `FAC-${Date.now().toString().slice(-6)}`,
        status: data.status,
        subtotalCents: amount,
        totalCents: amount,
        paidCents: data.status === 'Paid' ? amount : 0,
        notes: data.notes?.trim() || null,
      },
      include: { customer: true },
    })
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
          await tx.catalogItem.update({
            where: { id: line.item.id },
            data: { stock: { decrement: line.quantity } },
          })
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
