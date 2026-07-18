import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { prisma } from './db'
import type { Prisma } from '@prisma/client'

// Regroupe les mouvements d'une periode en ~12 barres max pour le mini-graphique :
// par jour sur 2 semaines, par semaine jusqu'a ~3 mois, par mois au-dela.
function buildSeries(
  txs: Array<{ date: Date; type: string; amount: number }>,
  start: Date,
  end: Date,
) {
  const spanDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1)
  const grain: 'day' | 'week' | 'month' = spanDays <= 14 ? 'day' : spanDays <= 98 ? 'week' : 'month'
  const buckets = new Map<string, { label: string; income: number; expense: number; order: number }>()

  for (const tx of txs) {
    const d = new Date(tx.date)
    let key: string
    let label: string
    let order: number
    if (grain === 'day') {
      key = d.toISOString().slice(0, 10)
      label = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
      order = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
    } else if (grain === 'week') {
      const monday = new Date(d)
      const day = monday.getDay()
      monday.setDate(monday.getDate() + (day === 0 ? -6 : 1 - day))
      monday.setHours(0, 0, 0, 0)
      key = monday.toISOString().slice(0, 10)
      label = monday.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
      order = monday.getTime()
    } else {
      key = `${d.getFullYear()}-${d.getMonth()}`
      label = d.toLocaleDateString('fr-FR', { month: 'short' })
      order = new Date(d.getFullYear(), d.getMonth(), 1).getTime()
    }
    const bucket = buckets.get(key) ?? { label, income: 0, expense: 0, order }
    if (tx.type === 'Income') bucket.income += tx.amount
    else if (tx.type === 'Expense') bucket.expense += tx.amount
    buckets.set(key, bucket)
  }

  return Array.from(buckets.values())
    .sort((a, b) => a.order - b.order)
    .map(({ label, income, expense }) => ({ label, income, expense }))
}

export const getDashboardData = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      companySlug: z.string(),
      // Bornes de periode ISO (optionnelles). Defaut : depuis le 1er du mois.
      start: z.string().optional(),
      end: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { companySlug } = data

    const { requireCompanyAccess } = await import('./access')
    // Le dashboard agrege comptes, transactions et ventes : on exige au minimum la lecture finance.
    const { company } = await requireCompanyAccess(companySlug, 'finance.read')

    const now = new Date()
    const start = data.start ? new Date(data.start) : new Date(now.getFullYear(), now.getMonth(), 1)
    const end = data.end ? new Date(data.end) : now
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
      throw new Error('Periode invalide.')
    }
    const dateInRange = { gte: start, lte: end }

    // Stock bas = stock <= seuil (seuil absent traite comme 0), calcule en SQL.
    const lowStockWhere: Prisma.CatalogItemWhereInput = {
      companyId: company.id,
      type: 'Product',
      stock: { not: null },
      OR: [
        { minStockLevel: { not: null }, stock: { lte: prisma.catalogItem.fields.minStockLevel } },
        { minStockLevel: null, stock: { lte: 0 } },
      ],
    }

    const [
      accounts,
      incomeAgg,
      expenseAgg,
      posAgg,
      rangeTx,
      recent,
      pendingPayments,
      invoicesIssuedAgg,
      activeInvoicesAgg,
      overdueAgg,
      newCustomers,
      lowStock,
      lowStockCount,
      openDealsCount,
      pendingQuotes,
    ] = await Promise.all([
      prisma.bankAccount.findMany({ where: { companyId: company.id } }),
      prisma.transaction.aggregate({
        where: { companyId: company.id, type: 'Income', date: dateInRange },
        _sum: { amount: true },
      }),
      prisma.transaction.aggregate({
        where: { companyId: company.id, type: 'Expense', date: dateInRange },
        _sum: { amount: true },
      }),
      prisma.transaction.aggregate({
        where: { companyId: company.id, category: 'POS', type: 'Income', date: dateInRange },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      // Serie pour le graphique : champs minimaux, toute la periode.
      prisma.transaction.findMany({
        where: { companyId: company.id, date: dateInRange, type: { in: ['Income', 'Expense'] } },
        select: { date: true, type: true, amount: true },
        orderBy: { date: 'asc' },
      }),
      prisma.transaction.findMany({
        where: { companyId: company.id, date: dateInRange },
        orderBy: { date: 'desc' },
        take: 6,
        select: { id: true, date: true, description: true, amount: true, type: true, category: true },
      }),
      prisma.transaction.findMany({
        where: { companyId: company.id, status: 'Pending' },
        orderBy: { date: 'desc' },
        take: 3,
      }),
      prisma.salesInvoice.aggregate({
        where: { companyId: company.id, issueDate: dateInRange, status: { not: 'Cancelled' } },
        _sum: { totalCents: true },
        _count: { _all: true },
      }),
      // Impayes = solde restant des factures actives (instantane, hors periode).
      prisma.salesInvoice.aggregate({
        where: { companyId: company.id, status: { in: ['Sent', 'PartiallyPaid', 'Overdue'] } },
        _sum: { totalCents: true, paidCents: true },
      }),
      prisma.salesInvoice.aggregate({
        where: { companyId: company.id, status: 'Overdue' },
        _sum: { totalCents: true, paidCents: true },
        _count: { _all: true },
      }),
      prisma.customer.count({
        where: { companyId: company.id, createdAt: dateInRange },
      }),
      prisma.catalogItem.findMany({ where: lowStockWhere, orderBy: { stock: 'asc' }, take: 4 }),
      prisma.catalogItem.count({ where: lowStockWhere }),
      prisma.deal.count({ where: { companyId: company.id, status: 'Open' } }),
      prisma.quote.count({ where: { companyId: company.id, status: { in: ['Draft', 'Sent'] } } }),
    ])

    const income = incomeAgg._sum.amount ?? 0
    const expense = expenseAgg._sum.amount ?? 0
    const salesCount = posAgg._count._all
    const salesAmount = posAgg._sum.amount ?? 0
    const outstanding =
      (activeInvoicesAgg._sum.totalCents ?? 0) - (activeInvoicesAgg._sum.paidCents ?? 0)
    const overdueTotal = (overdueAgg._sum.totalCents ?? 0) - (overdueAgg._sum.paidCents ?? 0)

    return {
      range: { start: start.toISOString(), end: end.toISOString() },
      accounts,
      balance: accounts.reduce((sum, account) => sum + account.balance, 0),
      income,
      expense,
      net: income - expense,
      salesCount,
      salesAmount,
      avgBasket: salesCount > 0 ? Math.round(salesAmount / salesCount) : 0,
      invoicesIssuedCount: invoicesIssuedAgg._count._all,
      invoicesIssuedTotal: invoicesIssuedAgg._sum.totalCents ?? 0,
      outstanding: Math.max(0, outstanding),
      overdueTotal: Math.max(0, overdueTotal),
      overdueCount: overdueAgg._count._all,
      newCustomers,
      pendingQuotes,
      lowStock,
      lowStockCount,
      openDealsCount,
      pendingPayments,
      recent,
      series: buildSeries(rangeTx, start, end),
    }
  })
