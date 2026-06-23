import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { prisma } from './db'

export const getDashboardData = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({ companySlug: z.string() }),
  )
  .handler(async ({ data }) => {
    const { companySlug } = data

    const { requireCompanyAccess } = await import('./access')
    const { company } = await requireCompanyAccess(companySlug)

    const [accounts, warehouses, transactions, deals, products, movements, employees] =
      await Promise.all([
        prisma.bankAccount.findMany({ where: { companyId: company.id } }),
        prisma.warehouse.findMany({ where: { companyId: company.id } }),
        prisma.transaction.findMany({
          where: { companyId: company.id },
          orderBy: { date: 'desc' },
          take: 50,
        }),
        prisma.deal.findMany({
          where: { companyId: company.id },
          include: { customer: true },
        }),
        prisma.catalogItem.findMany({ where: { companyId: company.id } }),
        prisma.stockMovement.findMany({
          where: { companyId: company.id },
          orderBy: { date: 'desc' },
          take: 20,
        }),
        prisma.employee.findMany({ where: { companyId: company.id } }),
      ])

    return {
      accounts,
      warehouses,
      transactions,
      crmDeals: deals,
      products,
      movements,
      employees,
    }
  })
