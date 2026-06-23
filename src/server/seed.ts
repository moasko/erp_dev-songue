import 'dotenv/config'
import { PrismaLibSql } from '@prisma/adapter-libsql'
import { PrismaClient } from '@prisma/client'

const adapter = new PrismaLibSql({ url: process.env.DATABASE_URL ?? 'file:./prisma/dev.db' })
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
