import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { prisma } from './db'
import type { PrismaClient } from '@prisma/client'

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

export const updateCatalogItem = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    companySlug: z.string(), itemId: z.string(), name: z.string().min(1), sku: z.string().min(1),
    type: z.enum(['Product', 'Service']), description: z.string().optional(), supplier: z.string().optional(),
    categoryId: z.string().optional(), price: z.number().min(0), wholesalePrice: z.number().min(0),
    cost: z.number().min(0), stock: z.number().min(0).optional(), minStockLevel: z.number().min(0).optional(),
    imageUrl: z.string().optional(), status: z.enum(['Active', 'Draft', 'Archived']),
  }))
  .handler(async ({ data }) => {
    const { company, user } = await getCompanyContext(data.companySlug, 'inventory.manage')
    const existing = await prisma.catalogItem.findFirst({ where: { id: data.itemId, companyId: company.id } })
    if (!existing) throw new Error('Article introuvable.')
    if (data.categoryId) {
      const category = await prisma.category.findFirst({ where: { id: data.categoryId, companyId: company.id, type: data.type } })
      if (!category) throw new Error('Categorie invalide pour ce type.')
    }
    const nextStock = data.type === 'Product' ? Math.round(data.stock ?? 0) : null
    const stockDelta = (nextStock ?? 0) - (existing.stock ?? 0)
    const warehouse = stockDelta !== 0 ? await ensureWarehouse(company.id) : null
    return prisma.$transaction(async (tx) => {
      const item = await tx.catalogItem.update({
        where: { id: existing.id },
        data: {
          name: data.name.trim(), sku: data.sku.trim(), type: data.type,
          description: data.description?.trim() || null, supplier: data.type === 'Product' ? data.supplier?.trim() || null : null,
          categoryId: data.categoryId || null, price: Math.round(data.price), wholesalePrice: data.type === 'Product' ? Math.round(data.wholesalePrice) : 0,
          cost: Math.round(data.cost), stock: nextStock, minStockLevel: data.type === 'Product' ? Math.round(data.minStockLevel ?? 0) : null,
          imageUrl: data.imageUrl?.trim() || null, status: data.status,
        },
        include: { category: true },
      })
      if (warehouse && stockDelta !== 0) {
        await tx.stockMovement.create({
          data: {
            companyId: company.id, warehouseId: warehouse.id, itemId: item.id,
            type: 'Adjustment', quantity: Math.abs(stockDelta), reference: `ADJ-${Date.now().toString().slice(-6)}`,
            reason: stockDelta > 0 ? 'Correction positive depuis la fiche article' : 'Correction negative depuis la fiche article', status: 'Completed',
          },
        })
      }
      await tx.auditLog.create({ data: { companyId: company.id, actorId: user.id, action: 'catalog.updated', entity: 'CatalogItem', entityId: item.id, metadata: JSON.stringify({ sku: item.sku, previousStock: existing.stock, stock: nextStock }) } })
      return item
    })
  })

export const deleteCatalogItem = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ companySlug: z.string(), itemId: z.string() }))
  .handler(async ({ data }) => {
    const { company, user } = await getCompanyContext(data.companySlug, 'inventory.manage')
    const item = await prisma.catalogItem.findFirst({ where: { id: data.itemId, companyId: company.id } })
    if (!item) throw new Error('Article introuvable.')
    await prisma.$transaction(async (tx) => {
      await tx.auditLog.create({ data: { companyId: company.id, actorId: user.id, action: 'catalog.deleted', entity: 'CatalogItem', entityId: item.id, metadata: JSON.stringify({ name: item.name, sku: item.sku }) } })
      await tx.catalogItem.delete({ where: { id: item.id } })
    })
    return { ok: true }
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

    return prisma.$transaction(async (tx) => {
      // Increment atomique : deux devis simultanes ne peuvent pas recevoir la
      // meme reference (contrainte unique companyId+reference sinon violee).
      const numbering = await tx.quoteSettings.update({
        where: { companyId: company.id },
        data: { nextNumber: { increment: 1 } },
      })
      const reference = `DEV-${String(numbering.nextNumber - 1).padStart(5, '0')}`

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

export const updateQuote = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    companySlug: z.string(), quoteId: z.string(), customerId: z.string().optional(), title: z.string().min(1),
    validUntil: z.string().min(1), discountRate: z.number().min(0).max(100), taxRate: z.number().min(0).max(100),
    notes: z.string().optional(), terms: z.string().optional(), lines: z.array(quoteLineInput).min(1),
  }))
  .handler(async ({ data }) => {
    const { company, user } = await getCompanyContext(data.companySlug, 'invoice.update')
    const existing = await prisma.quote.findFirst({ where: { id: data.quoteId, companyId: company.id } })
    if (!existing) throw new Error('Devis introuvable.')
    if (existing.status === 'Accepted') throw new Error('Un devis accepte doit etre duplique ou annule, pas modifie.')
    if (data.customerId) {
      const customer = await prisma.customer.findFirst({ where: { id: data.customerId, companyId: company.id } })
      if (!customer) throw new Error('Client introuvable.')
    }
    const subtotal = data.lines.reduce((sum, line) => sum + Math.round(line.quantity * line.unitPrice), 0)
    const taxable = Math.max(0, subtotal - Math.round(subtotal * data.discountRate / 100))
    const total = taxable + Math.round(taxable * data.taxRate / 100)
    return prisma.$transaction(async (tx) => {
      await tx.quoteLine.deleteMany({ where: { quoteId: existing.id } })
      const quote = await tx.quote.update({ where: { id: existing.id }, data: {
        customerId: data.customerId || null, title: data.title.trim(), validUntil: new Date(data.validUntil),
        discountRate: Math.round(data.discountRate), taxRate: Math.round(data.taxRate), subtotalCents: subtotal, totalCents: total,
        notes: data.notes?.trim() || null, terms: data.terms?.trim() || null,
        lines: { create: data.lines.map((line, index) => ({ itemId: line.itemId || null, description: line.description.trim(), quantity: line.quantity, unitPrice: Math.round(line.unitPrice), totalCents: Math.round(line.quantity * line.unitPrice), sortOrder: index })) },
      }, include: { customer: true, lines: { include: { item: true }, orderBy: { sortOrder: 'asc' } } } })
      await tx.auditLog.create({ data: { companyId: company.id, actorId: user.id, action: 'quote.updated', entity: 'Quote', entityId: quote.id, metadata: JSON.stringify({ reference: quote.reference, total: quote.totalCents }) } })
      return quote
    })
  })

export const deleteQuote = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ companySlug: z.string(), quoteId: z.string() }))
  .handler(async ({ data }) => {
    const { company, user } = await getCompanyContext(data.companySlug, 'invoice.delete')
    const quote = await prisma.quote.findFirst({ where: { id: data.quoteId, companyId: company.id } })
    if (!quote) throw new Error('Devis introuvable.')
    if (quote.status === 'Accepted') throw new Error('Un devis accepte ne peut pas etre supprime.')
    await prisma.$transaction(async (tx) => {
      await tx.auditLog.create({ data: { companyId: company.id, actorId: user.id, action: 'quote.deleted', entity: 'Quote', entityId: quote.id, metadata: JSON.stringify({ reference: quote.reference }) } })
      await tx.quote.delete({ where: { id: quote.id } })
    })
    return { ok: true }
  })

export const updateCrmLead = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    companySlug: z.string(), leadId: z.string(), name: z.string().min(1), company: z.string().optional(),
    email: z.string().optional(), phone: z.string().optional(), source: z.string(),
    status: z.enum(['New', 'Contacted', 'Qualified', 'Lost']),
  }))
  .handler(async ({ data }) => {
    const { company, user } = await getCompanyContext(data.companySlug, 'customer.update')
    const lead = await prisma.lead.update({
      where: { id: data.leadId, companyId: company.id },
      data: { name: data.name.trim(), company: data.company?.trim() || null, email: data.email?.trim() || null, phone: data.phone?.trim() || null, source: data.source, status: data.status },
    })
    await prisma.auditLog.create({ data: { companyId: company.id, actorId: user.id, action: 'lead.updated', entity: 'Lead', entityId: lead.id, metadata: JSON.stringify({ name: lead.name, status: lead.status }) } })
    return lead
  })

export const deleteCrmLead = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ companySlug: z.string(), leadId: z.string() }))
  .handler(async ({ data }) => {
    const { company, user } = await getCompanyContext(data.companySlug, 'customer.delete')
    const lead = await prisma.lead.findFirst({ where: { id: data.leadId, companyId: company.id } })
    if (!lead) throw new Error('Prospect introuvable.')
    await prisma.$transaction(async (tx) => {
      await tx.auditLog.create({ data: { companyId: company.id, actorId: user.id, action: 'lead.deleted', entity: 'Lead', entityId: lead.id, metadata: JSON.stringify({ name: lead.name }) } })
      await tx.lead.delete({ where: { id: lead.id } })
    })
    return { ok: true }
  })

const dealInput = z.object({
  companySlug: z.string(), contactId: z.string(), title: z.string().min(1), value: z.number().min(0),
  stageId: z.enum(['new', 'qualified', 'proposal', 'negotiation', 'won', 'lost']),
  priority: z.enum(['Low', 'Medium', 'High']), expectedCloseDate: z.string().min(1),
})

export const createCrmDeal = createServerFn({ method: 'POST' })
  .inputValidator(dealInput)
  .handler(async ({ data }) => {
    const { company, user } = await getCompanyContext(data.companySlug, 'customer.create')
    const customer = await prisma.customer.findFirst({ where: { id: data.contactId, companyId: company.id } })
    if (!customer) throw new Error('Client introuvable.')
    const deal = await prisma.deal.create({ data: { companyId: company.id, contactId: customer.id, title: data.title.trim(), value: Math.round(data.value), stageId: data.stageId, priority: data.priority, expectedCloseDate: new Date(data.expectedCloseDate), status: data.stageId === 'won' ? 'Won' : data.stageId === 'lost' ? 'Lost' : 'Open' }, include: { customer: true } })
    await prisma.auditLog.create({ data: { companyId: company.id, actorId: user.id, action: 'deal.created', entity: 'Deal', entityId: deal.id } })
    return deal
  })

export const updateCrmDeal = createServerFn({ method: 'POST' })
  .inputValidator(dealInput.extend({ dealId: z.string() }))
  .handler(async ({ data }) => {
    const { company, user } = await getCompanyContext(data.companySlug, 'customer.update')
    const deal = await prisma.deal.update({ where: { id: data.dealId, companyId: company.id }, data: { contactId: data.contactId, title: data.title.trim(), value: Math.round(data.value), stageId: data.stageId, priority: data.priority, expectedCloseDate: new Date(data.expectedCloseDate), status: data.stageId === 'won' ? 'Won' : data.stageId === 'lost' ? 'Lost' : 'Open' }, include: { customer: true } })
    await prisma.auditLog.create({ data: { companyId: company.id, actorId: user.id, action: 'deal.updated', entity: 'Deal', entityId: deal.id, metadata: JSON.stringify({ stage: deal.stageId, value: deal.value }) } })
    return deal
  })

export const deleteCrmDeal = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ companySlug: z.string(), dealId: z.string() }))
  .handler(async ({ data }) => {
    const { company, user } = await getCompanyContext(data.companySlug, 'customer.delete')
    const deal = await prisma.deal.findFirst({ where: { id: data.dealId, companyId: company.id } })
    if (!deal) throw new Error('Opportunite introuvable.')
    await prisma.$transaction(async (tx) => { await tx.auditLog.create({ data: { companyId: company.id, actorId: user.id, action: 'deal.deleted', entity: 'Deal', entityId: deal.id, metadata: JSON.stringify({ title: deal.title }) } }); await tx.deal.delete({ where: { id: deal.id } }) })
    return { ok: true }
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
    accountId: z.string().optional(),
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
    const number = data.number?.trim() || `FAC-${Date.now().toString().slice(-6)}`

    // Comme pour les factures d'achat : une facture payee impacte la
    // tresorerie (transaction + paiement + solde du compte).
    const account = data.status === 'Paid'
      ? data.accountId
        ? await prisma.bankAccount.findFirst({ where: { id: data.accountId, companyId: company.id } })
        : await ensureAccount(company.id, 'Cash', 'Caisse boutique')
      : null
    if (data.status === 'Paid' && !account) throw new Error('Compte introuvable.')

    return prisma.$transaction(async (tx) => {
      const invoice = await tx.salesInvoice.create({
        data: {
          companyId: company.id,
          customerId: customerId ?? null,
          number,
          status: data.status,
          subtotalCents: amount,
          totalCents: amount,
          paidCents: data.status === 'Paid' ? amount : 0,
          notes: data.notes?.trim() || null,
        },
        include: { customer: true },
      })

      if (data.status === 'Paid' && account) {
        const transaction = await tx.transaction.create({
          data: {
            companyId: company.id,
            accountId: account.id,
            description: invoice.customer ? `${invoice.customer.name} - ${number}` : `Facture ${number}`,
            amount,
            type: 'Income',
            category: 'Ventes',
            reference: number,
            status: 'Completed',
          },
        })
        await tx.payment.create({
          data: {
            companyId: company.id,
            accountId: account.id,
            transactionId: transaction.id,
            salesInvoiceId: invoice.id,
            amount,
            direction: 'In',
            method: account.type,
            reference: number,
          },
        })
        await tx.bankAccount.update({
          where: { id: account.id },
          data: { balance: { increment: amount } },
        })
      }

      return invoice
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
    const { company, user } = await getCompanyContext(data.companySlug, 'finance.manage')
    const register = await prisma.posRegister.upsert({
      where: { companyId_name: { companyId: company.id, name: 'Caisse principale' } },
      update: {}, create: { companyId: company.id, name: 'Caisse principale' },
    })
    const session = (await prisma.posSession.findFirst({ where: { companyId: company.id, registerId: register.id, cashierId: user.id, status: 'Open' }, orderBy: { openedAt: 'desc' } }))
      ?? await prisma.posSession.create({ data: { companyId: company.id, registerId: register.id, cashierId: user.id, status: 'Open' } })
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

    const sale = await prisma.$transaction(async (tx) => {
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

      const transaction = await tx.transaction.create({
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
      const ticket = await tx.posTicket.create({
        data: {
          companyId: company.id, sessionId: session.id, cashierId: user.id, customerId: data.customerId || null,
          transactionId: transaction.id, reference, status: 'Completed', paymentMethod: data.paymentMethod,
          subtotalCents: total, totalCents: total,
          lines: { create: lineItems.map((line) => ({ itemId: line.item.id, sku: line.item.sku, name: line.item.name, quantity: line.quantity, unitPrice: line.item.price, totalCents: line.total })) },
        },
        include: { lines: true, customer: true },
      })
      await tx.auditLog.create({ data: { companyId: company.id, actorId: user.id, action: 'pos.sale_completed', entity: 'PosTicket', entityId: ticket.id, metadata: JSON.stringify({ reference, total, paymentMethod: data.paymentMethod }) } })
      return { transaction, ticket }
    })

    const customer = data.customerId ? await prisma.customer.findFirst({ where: { id: data.customerId, companyId: company.id } }) : null
    return {
      reference,
      customer: customer?.name ?? 'Client comptoir',
      total,
      items: data.lines.reduce((sum, line) => sum + line.quantity, 0),
      paymentMethod: data.paymentMethod,
      createdAt: sale.ticket.createdAt.toISOString(),
      lines: sale.ticket.lines.map((line) => ({ name: line.name, sku: line.sku, quantity: line.quantity, unitPrice: line.unitPrice, total: line.totalCents })),
    }
  })

export const openPosSession = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ companySlug: z.string(), openingBalance: z.number().min(0).default(0) }))
  .handler(async ({ data }) => {
    const { company, user } = await getCompanyContext(data.companySlug, 'finance.manage')
    const register = await prisma.posRegister.upsert({ where: { companyId_name: { companyId: company.id, name: 'Caisse principale' } }, update: {}, create: { companyId: company.id, name: 'Caisse principale' } })
    const existing = await prisma.posSession.findFirst({ where: { registerId: register.id, cashierId: user.id, status: 'Open' } })
    if (existing) return existing
    return prisma.posSession.create({ data: { companyId: company.id, registerId: register.id, cashierId: user.id, openingBalance: Math.round(data.openingBalance) } })
  })

export const closePosSession = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ companySlug: z.string(), closingBalance: z.number().min(0) }))
  .handler(async ({ data }) => {
    const { company, user } = await getCompanyContext(data.companySlug, 'finance.manage')
    const session = await prisma.posSession.findFirst({ where: { companyId: company.id, cashierId: user.id, status: 'Open' }, orderBy: { openedAt: 'desc' } })
    if (!session) throw new Error('Aucune session de caisse ouverte.')
    const cash = await prisma.posTicket.aggregate({ where: { sessionId: session.id, status: 'Completed', paymentMethod: 'cash' }, _sum: { totalCents: true } })
    const expectedBalance = session.openingBalance + (cash._sum.totalCents ?? 0)
    return prisma.posSession.update({ where: { id: session.id }, data: { status: 'Closed', closingBalance: Math.round(data.closingBalance), expectedBalance, closedAt: new Date() } })
  })

export const updatePosTicket = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    companySlug: z.string(), ticketId: z.string(), customerId: z.string().optional(),
    paymentMethod: z.enum(['cash', 'mobile', 'card']),
    lines: z.array(z.object({ lineId: z.string(), quantity: z.number().int().positive() })).min(1),
  }))
  .handler(async ({ data }) => {
    const { company, user } = await getCompanyContext(data.companySlug, 'finance.manage')
    const ticket = await prisma.posTicket.findFirst({
      where: { id: data.ticketId, companyId: company.id, status: 'Completed' },
      include: { lines: { include: { item: true } }, transaction: true },
    })
    if (!ticket?.transaction) throw new Error('Ticket modifiable introuvable.')
    const quantities = new Map(data.lines.map((line) => [line.lineId, line.quantity]))
    if (quantities.size !== data.lines.length || quantities.size !== ticket.lines.length || data.lines.some((line) => !ticket.lines.some((existing) => existing.id === line.lineId))) throw new Error('Toutes les lignes du ticket doivent etre conservees.')
    if (data.customerId && !await prisma.customer.findFirst({ where: { id: data.customerId, companyId: company.id } })) throw new Error('Client introuvable.')

    const updatedLines = ticket.lines.filter((line) => quantities.has(line.id)).map((line) => ({ ...line, nextQuantity: quantities.get(line.id)! }))
    const newTotal = updatedLines.reduce((sum, line) => sum + line.unitPrice * line.nextQuantity, 0)
    const newAccount = data.paymentMethod === 'mobile'
      ? await ensureAccount(company.id, 'Cash', 'Mobile money')
      : data.paymentMethod === 'card'
        ? await ensureAccount(company.id, 'CreditCard', 'Paiement carte')
        : await ensureAccount(company.id, 'Cash', 'Caisse boutique')
    const oldAccountId = ticket.transaction.accountId
    const warehouse = updatedLines.some((line) => line.item?.stock !== null && line.nextQuantity !== line.quantity) ? await ensureWarehouse(company.id) : null

    return prisma.$transaction(async (tx) => {
      for (const line of updatedLines) {
        if (!line.item || line.item.stock === null || line.nextQuantity === line.quantity) continue
        const additionalSold = line.nextQuantity - line.quantity
        if (additionalSold > 0) {
          const changed = await tx.catalogItem.updateMany({ where: { id: line.item.id, companyId: company.id, stock: { gte: additionalSold } }, data: { stock: { decrement: additionalSold } } })
          if (!changed.count) throw new Error(`Stock insuffisant pour ${line.name}.`)
        } else await tx.catalogItem.update({ where: { id: line.item.id }, data: { stock: { increment: Math.abs(additionalSold) } } })
        await tx.stockMovement.create({ data: { companyId: company.id, warehouseId: warehouse!.id, itemId: line.item.id, type: 'Adjustment', quantity: Math.abs(additionalSold), reference: ticket.reference, reason: 'Correction ticket de caisse', status: 'Completed' } })
      }
      if (oldAccountId === newAccount.id) {
        await tx.bankAccount.update({ where: { id: oldAccountId }, data: { balance: { increment: newTotal - ticket.totalCents } } })
      } else {
        await tx.bankAccount.update({ where: { id: oldAccountId }, data: { balance: { decrement: ticket.totalCents } } })
        await tx.bankAccount.update({ where: { id: newAccount.id }, data: { balance: { increment: newTotal } } })
      }
      await tx.posTicketLine.deleteMany({ where: { ticketId: ticket.id, id: { notIn: data.lines.map((line) => line.lineId) } } })
      for (const line of updatedLines) await tx.posTicketLine.update({ where: { id: line.id }, data: { quantity: line.nextQuantity, totalCents: line.unitPrice * line.nextQuantity } })
      await tx.transaction.update({ where: { id: ticket.transaction!.id }, data: { accountId: newAccount.id, amount: newTotal } })
      const result = await tx.posTicket.update({ where: { id: ticket.id }, data: { customerId: data.customerId || null, paymentMethod: data.paymentMethod, subtotalCents: newTotal, totalCents: newTotal }, include: { lines: true, customer: true, cashier: { select: { id: true, name: true } }, transaction: { include: { account: true } } } })
      await tx.auditLog.create({ data: { companyId: company.id, actorId: user.id, action: 'pos.ticket_corrected', entity: 'PosTicket', entityId: ticket.id, metadata: JSON.stringify({ previousTotal: ticket.totalCents, total: newTotal, paymentMethod: data.paymentMethod }) } })
      return result
    })
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
