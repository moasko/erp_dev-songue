import 'dotenv/config'
import { prisma } from './src/server/db'
import { hashPassword } from './src/server/password'

// Usage : ADMIN_NAME="Nom" ADMIN_EMAIL="admin@exemple.com" ADMIN_PASSWORD="..." npx tsx _create_account.ts
// Ne jamais ecrire d'identifiants en dur dans ce fichier.
async function main() {
  const name = process.env.ADMIN_NAME?.trim() || 'Administrateur'
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase()
  const password = process.env.ADMIN_PASSWORD

  if (!email || !password) {
    console.error('Variables ADMIN_EMAIL et ADMIN_PASSWORD requises.')
    process.exit(1)
  }
  if (password.length < 8) {
    console.error('ADMIN_PASSWORD doit contenir au moins 8 caracteres.')
    process.exit(1)
  }

  let user = await prisma.user.findUnique({ where: { email } })
  if (user) {
    console.log('Account exists, updating password...')
    await prisma.user.update({
      where: { email },
      data: { passwordHash: await hashPassword(password) }
    })
    console.log('Password updated successfully!')
    return
  }

  user = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash: await hashPassword(password),
      isOwner: true,
      // Compte provisionne en ligne de commande : il n'y a pas d'etape de
      // verification a lui faire passer, et sans cette date le login le renverrait
      // vers /verify en attendant un code qu'il n'a jamais demande.
      emailVerifiedAt: new Date(),
    }
  })

  // Create workspace and company (if not exists)
  let workspace = await prisma.workspace.findFirst()
  if (!workspace) {
    workspace = await prisma.workspace.create({
      data: {
        name: `Espace ${name}`,
        slug: 'espace-principal',
        ownerId: user.id
      },
    })
  }

  let company = await prisma.company.findFirst()
  if (!company) {
    company = await prisma.company.create({
      data: {
        workspaceId: workspace.id,
        name: 'Entreprise principale',
        slug: 'entreprise-principale',
      },
    })
  }

  const role = await prisma.role.findFirst({ where: { name: 'Owner' } })

  await prisma.companyMembership.create({
    data: {
      userId: user.id,
      companyId: company.id,
      status: 'ACTIVE',
      roles: role ? {
        create: { roleId: role.id }
      } : undefined
    }
  })

  console.log('Account created successfully:', user.email)
}

main().catch(console.error).finally(() => prisma.$disconnect())
