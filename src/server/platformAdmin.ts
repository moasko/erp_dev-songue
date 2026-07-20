import { createHash, randomBytes } from 'node:crypto'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { prisma } from './db'
import {
  getSessionContext,
  invalidateSessionCache,
  platformAdminEmails,
  requirePlatformAdmin,
} from './access'
import { appBaseUrl, mailIsConfigured, passwordResetEmail, sendMail } from './mail'

// ─── Espace super admin (plateforme) ───
// Ces server functions vivent AU-DESSUS des entreprises. Chacune appelle
// `requirePlatformAdmin()` en premier : la securite est verifiee cote serveur a
// partir de la session (email dans SUPER_ADMIN_EMAILS), jamais a partir d'un
// indicateur envoye par le client. Voir access.ts pour la resolution du role.

const resetDurationMs = 1000 * 60 * 60 // 1 h, comme un lien de reinitialisation classique

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function createToken() {
  return randomBytes(32).toString('base64url')
}

// Etat du super admin pour proteger la route /admin cote client (UX). La garde
// reelle reste `requirePlatformAdmin()` sur chaque server function de donnees.
export const getPlatformAdminState = createServerFn({ method: 'GET' }).handler(async () => {
  const context = await getSessionContext()
  if (!context) return { authenticated: false, isSuperAdmin: false, user: null }
  return {
    authenticated: true,
    isSuperAdmin: context.user.isSuperAdmin,
    user: {
      id: context.user.id,
      name: context.user.name,
      email: context.user.email,
      isSuperAdmin: context.user.isSuperAdmin,
    },
    firstCompanySlug: context.companies[0]?.slug ?? null,
  }
})

// Vue globale : sante du systeme et chiffres cles a travers toutes les entreprises.
export const getPlatformOverview = createServerFn({ method: 'GET' }).handler(async () => {
  await requirePlatformAdmin()

  const now = new Date()
  const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)

  const dbStart = Date.now()
  const [
    companies,
    workspaces,
    users,
    verifiedUsers,
    activeMemberships,
    activeSessions,
    logins24h,
    failedLogins24h,
    invoicesCount,
    quotesCount,
    customersCount,
    invoiceTotals,
    recentCompanies,
    recentUsers,
  ] = await Promise.all([
    prisma.company.count(),
    prisma.workspace.count(),
    prisma.user.count(),
    prisma.user.count({ where: { emailVerifiedAt: { not: null } } }),
    prisma.companyMembership.count({ where: { status: 'ACTIVE' } }),
    prisma.session.count({ where: { expiresAt: { gt: now } } }),
    prisma.loginEvent.count({ where: { success: true, createdAt: { gte: since24h } } }),
    prisma.loginEvent.count({ where: { success: false, createdAt: { gte: since24h } } }),
    prisma.salesInvoice.count(),
    prisma.quote.count(),
    prisma.customer.count(),
    prisma.salesInvoice.aggregate({ _sum: { totalCents: true, paidCents: true } }),
    prisma.company.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, name: true, slug: true, createdAt: true },
    }),
    prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, name: true, email: true, createdAt: true, emailVerifiedAt: true },
    }),
  ])
  const dbLatencyMs = Date.now() - dbStart

  return {
    ok: true as const,
    health: {
      dbLatencyMs,
      dbOnline: true,
      mailConfigured: mailIsConfigured(),
      publicRegistration: String(process.env.ALLOW_PUBLIC_REGISTRATION ?? '').trim().toLowerCase() === 'true',
      superAdminCount: platformAdminEmails().size,
      generatedAt: now.toISOString(),
    },
    stats: {
      companies,
      workspaces,
      users,
      verifiedUsers,
      activeMemberships,
      activeSessions,
      logins24h,
      failedLogins24h,
      invoicesCount,
      quotesCount,
      customersCount,
      invoicedCents: invoiceTotals._sum.totalCents ?? 0,
      collectedCents: invoiceTotals._sum.paidCents ?? 0,
    },
    recentCompanies: recentCompanies.map((company) => ({
      id: company.id,
      name: company.name,
      slug: company.slug,
      createdAt: company.createdAt.toISOString(),
    })),
    recentUsers: recentUsers.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      verified: Boolean(user.emailVerifiedAt),
      createdAt: user.createdAt.toISOString(),
    })),
  }
})

// Tous les tenants (entreprises) avec leur workspace, proprietaire et volumetrie.
export const listPlatformCompanies = createServerFn({ method: 'GET' }).handler(async () => {
  await requirePlatformAdmin()

  const companies = await prisma.company.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      workspace: { select: { name: true, slug: true, owner: { select: { name: true, email: true } } } },
      _count: {
        select: {
          memberships: true,
          salesInvoices: true,
          customers: true,
          modules: true,
          roles: true,
        },
      },
    },
  })

  return {
    ok: true as const,
    companies: companies.map((company) => ({
      id: company.id,
      name: company.name,
      slug: company.slug,
      subdomain: company.subdomain,
      currency: company.currency,
      country: company.country,
      createdAt: company.createdAt.toISOString(),
      workspaceName: company.workspace?.name ?? null,
      ownerName: company.workspace?.owner?.name ?? null,
      ownerEmail: company.workspace?.owner?.email ?? null,
      members: company._count.memberships,
      invoices: company._count.salesInvoices,
      customers: company._count.customers,
      modules: company._count.modules,
      roles: company._count.roles,
    })),
  }
})

// Tous les utilisateurs de la plateforme, avec leurs entreprises, roles et sessions.
export const listPlatformUsers = createServerFn({ method: 'GET' }).handler(async () => {
  await requirePlatformAdmin()

  const adminEmails = platformAdminEmails()
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    take: 500,
    include: {
      _count: { select: { sessions: true } },
      memberships: {
        where: { status: 'ACTIVE' },
        select: {
          company: { select: { name: true, slug: true } },
          roles: { select: { role: { select: { name: true } } } },
        },
      },
    },
  })

  return {
    ok: true as const,
    users: users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      isOwner: user.isOwner,
      isSuperAdmin: adminEmails.has(user.email.trim().toLowerCase()),
      verified: Boolean(user.emailVerifiedAt),
      totpEnabled: Boolean(user.totpEnabledAt),
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
      sessions: user._count.sessions,
      companies: user.memberships.map((membership) => ({
        name: membership.company.name,
        slug: membership.company.slug,
        roles: membership.roles.map((userRole) => userRole.role.name),
      })),
    })),
  }
})

// Tous les roles a travers les entreprises + le catalogue global permissions/modules.
export const listPlatformRoles = createServerFn({ method: 'GET' }).handler(async () => {
  await requirePlatformAdmin()

  const [roles, permissions, modules] = await Promise.all([
    prisma.role.findMany({
      orderBy: [{ company: { name: 'asc' } }, { name: 'asc' }],
      include: {
        company: { select: { name: true, slug: true } },
        _count: { select: { users: true, permissions: true } },
      },
    }),
    prisma.permission.findMany({ orderBy: { key: 'asc' } }),
    prisma.moduleDefinition.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { permissions: true } } } }),
  ])

  return {
    ok: true as const,
    roles: roles.map((role) => ({
      id: role.id,
      name: role.name,
      description: role.description,
      systemKey: role.systemKey,
      companyName: role.company.name,
      companySlug: role.company.slug,
      users: role._count.users,
      permissions: role._count.permissions,
    })),
    permissions: permissions.map((permission) => ({
      key: permission.key,
      moduleKey: permission.moduleKey,
      description: permission.description,
    })),
    modules: modules.map((module) => ({
      key: module.key,
      name: module.name,
      category: module.category,
      permissions: module._count.permissions,
    })),
  }
})

// Parametres globaux de la plateforme : runtime, plans, modules, indicateurs.
export const getPlatformSettings = createServerFn({ method: 'GET' }).handler(async () => {
  await requirePlatformAdmin()

  const { readFile } = await import('node:fs/promises')
  const packageJson = JSON.parse(await readFile('package.json', 'utf8').catch(() => '{}')) as {
    name?: string
    version?: string
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }

  const [plans, subscriptions] = await Promise.all([
    prisma.plan.findMany({ orderBy: { monthlyPriceCents: 'asc' } }),
    prisma.subscription.groupBy({ by: ['status'], _count: { _all: true } }).catch(() => []),
  ])

  const adminEmails = Array.from(platformAdminEmails())

  return {
    ok: true as const,
    app: {
      name: packageJson.name ?? 'erp-platform',
      version: packageJson.version ?? '0.0.0',
    },
    runtime: {
      react: packageJson.dependencies?.react ?? '',
      vite: packageJson.devDependencies?.vite ?? '',
      prisma: packageJson.devDependencies?.prisma ?? packageJson.dependencies?.['@prisma/client'] ?? '',
      tanstackStart: packageJson.dependencies?.['@tanstack/react-start'] ?? '',
      node: process.version,
    },
    flags: {
      publicRegistration: String(process.env.ALLOW_PUBLIC_REGISTRATION ?? '').trim().toLowerCase() === 'true',
      mailConfigured: mailIsConfigured(),
      appBaseUrl: appBaseUrl() ?? '(deduit du Host en dev)',
      rootDomain: (process.env.APP_ROOT_DOMAIN ?? '').trim() || '(non configure)',
    },
    superAdmins: adminEmails,
    plans: plans.map((plan) => ({
      key: plan.key,
      name: plan.name,
      monthlyPriceCents: plan.monthlyPriceCents,
      yearlyPriceCents: plan.yearlyPriceCents,
      maxCompanies: plan.maxCompanies,
      maxUsers: plan.maxUsers,
    })),
    subscriptions: (subscriptions as Array<{ status: string; _count: { _all: number } }>).map((row) => ({
      status: row.status,
      count: row._count._all,
    })),
  }
})

// Activite globale : journal d'audit de toutes les entreprises + evenements de connexion.
export const listPlatformActivity = createServerFn({ method: 'GET' }).handler(async () => {
  await requirePlatformAdmin()

  const [auditLogs, loginEvents] = await Promise.all([
    prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        company: { select: { name: true, slug: true } },
        actor: { select: { name: true, email: true } },
      },
    }),
    prisma.loginEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 60 }),
  ])

  return {
    ok: true as const,
    auditLogs: auditLogs.map((log) => ({
      id: log.id,
      action: log.action,
      entity: log.entity,
      companyName: log.company?.name ?? null,
      actorName: log.actor?.name ?? null,
      actorEmail: log.actor?.email ?? null,
      createdAt: log.createdAt.toISOString(),
    })),
    loginEvents: loginEvents.map((event) => ({
      id: event.id,
      email: event.email,
      success: event.success,
      reason: event.reason,
      ip: event.ip,
      createdAt: event.createdAt.toISOString(),
    })),
  }
})

// ─── Actions de gestion (guardees + effets serveur) ───

// Force la deconnexion d'un utilisateur en supprimant toutes ses sessions.
export const revokeUserSessions = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ userId: z.string().min(1) }))
  .handler(async ({ data }) => {
    await requirePlatformAdmin()
    const user = await prisma.user.findUnique({ where: { id: data.userId }, select: { id: true, email: true } })
    if (!user) return { ok: false as const, message: 'Utilisateur introuvable.' }

    const result = await prisma.session.deleteMany({ where: { userId: user.id } })
    // Le cache de session est indexe par token (non par userId) : on le vide en
    // entier pour que les sessions revoquees cessent d'etre servies immediatement.
    invalidateSessionCache()
    return { ok: true as const, revoked: result.count }
  })

// Genere un lien de reinitialisation de mot de passe pour un utilisateur (assistance
// super admin). Le lien est aussi envoye par email si un transport est configure.
export const createUserResetLink = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ userId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const context = await requirePlatformAdmin()
    const user = await prisma.user.findUnique({ where: { id: data.userId }, select: { id: true, name: true, email: true } })
    if (!user) return { ok: false as const, message: 'Utilisateur introuvable.' }

    const token = createToken()
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + resetDurationMs),
        createdBy: context.user.id,
      },
    })

    const resetPath = `/reset/${token}`
    const expiresInMinutes = Math.round(resetDurationMs / 60000)
    const baseUrl = appBaseUrl()
    const delivery = baseUrl
      ? await sendMail({
          to: user.email,
          ...passwordResetEmail({ resetUrl: `${baseUrl}${resetPath}`, name: user.name, expiresInMinutes }),
        }).catch(() => null)
      : null

    return {
      ok: true as const,
      resetPath,
      expiresInMinutes,
      delivered: Boolean(delivery?.delivered),
      email: user.email,
    }
  })

// Suppression d'une entreprise (tenant) et de toutes ses donnees (cascade Prisma).
// Action destructive et irreversible : elle exige de retaper le slug exact, cote
// client comme cote serveur, en plus de la garde super admin.
export const deletePlatformCompany = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ companyId: z.string().min(1), confirmSlug: z.string().min(1) }))
  .handler(async ({ data }) => {
    await requirePlatformAdmin()
    const company = await prisma.company.findUnique({
      where: { id: data.companyId },
      select: { id: true, name: true, slug: true },
    })
    if (!company) return { ok: false as const, message: 'Entreprise introuvable.' }
    if (data.confirmSlug.trim() !== company.slug) {
      return { ok: false as const, message: 'Le slug de confirmation ne correspond pas.' }
    }

    await prisma.company.delete({ where: { id: company.id } })
    invalidateSessionCache()
    return { ok: true as const, deleted: company.slug }
  })
