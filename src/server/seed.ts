import 'dotenv/config'
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('Clearing database...')

  await prisma.lead.deleteMany()
  await prisma.deal.deleteMany()
  await prisma.customer.deleteMany()
  await prisma.stockMovement.deleteMany()
  await prisma.warehouse.deleteMany()
  await prisma.employee.deleteMany()
  await prisma.transaction.deleteMany()
  await prisma.bankAccount.deleteMany()
  await prisma.catalogItem.deleteMany()
  await prisma.category.deleteMany()

  await prisma.session.deleteMany()
  await prisma.rolePermission.deleteMany()
  await prisma.userRole.deleteMany()
  await prisma.permission.deleteMany()
  await prisma.role.deleteMany()
  await prisma.companyModule.deleteMany()
  await prisma.companyMembership.deleteMany()
  await prisma.moduleDefinition.deleteMany()
  await prisma.company.deleteMany()
  await prisma.workspace.deleteMany()
  await prisma.user.deleteMany()

  console.log('Database cleared.')
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
