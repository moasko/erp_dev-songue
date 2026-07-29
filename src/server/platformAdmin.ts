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

// Statut de cycle de vie d'une entreprise, DERIVE des donnees existantes (aucune
// colonne dediee sur Company, la base distante etant partagee) :
//   - 'SUSPENDED' : l'entreprise a des membres mais aucun n'est ACTIVE. La
//     suspension bascule tous les CompanyMembership en 'SUSPENDED' ; comme la
//     session ne charge que les memberships ACTIVE (access.ts), l'acces est
//     reellement coupe pour tous les membres.
//   - 'ACTIVE'    : au moins un membre actif.
//   - 'EMPTY'     : aucun membre (cas limite).
function deriveCompanyStatus(statuses: string[]): 'ACTIVE' | 'SUSPENDED' | 'EMPTY' {
  if (statuses.length === 0) return 'EMPTY'
  const active = statuses.filter((status) => status === 'ACTIVE').length
  if (active === 0) return 'SUSPENDED'
  return 'ACTIVE'
}

// Tous les tenants (entreprises) avec leur workspace, proprietaire, statut et volumetrie.
export const listPlatformCompanies = createServerFn({ method: 'GET' }).handler(async () => {
  await requirePlatformAdmin()

  const companies = await prisma.company.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      workspace: {
        select: {
          name: true,
          slug: true,
          owner: { select: { id: true, name: true, email: true, emailVerifiedAt: true } },
        },
      },
      memberships: { select: { status: true } },
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
    companies: companies.map((company) => {
      const statuses = company.memberships.map((membership) => membership.status)
      return {
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
        ownerVerified: Boolean(company.workspace?.owner?.emailVerifiedAt),
        status: deriveCompanyStatus(statuses),
        activeMembers: statuses.filter((status) => status === 'ACTIVE').length,
        members: company._count.memberships,
        invoices: company._count.salesInvoices,
        customers: company._count.customers,
        modules: company._count.modules,
        roles: company._count.roles,
      }
    }),
  }
})

// Detail complet d'une entreprise : profil, proprietaire, membres, volumetrie,
// activite recente et motif de suspension courant (lu dans le journal d'audit).
export const getPlatformCompanyDetail = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ companyId: z.string().min(1) }))
  .handler(async ({ data }) => {
    await requirePlatformAdmin()

    const company = await prisma.company.findUnique({
      where: { id: data.companyId },
      include: {
        workspace: {
          select: {
            name: true,
            slug: true,
            owner: { select: { id: true, name: true, email: true, emailVerifiedAt: true, lastLoginAt: true } },
          },
        },
        memberships: {
          orderBy: { createdAt: 'asc' },
          include: {
            user: { select: { name: true, email: true, lastLoginAt: true } },
            roles: { select: { role: { select: { name: true } } } },
          },
        },
        _count: {
          select: {
            memberships: true,
            salesInvoices: true,
            quotes: true,
            customers: true,
            employees: true,
            items: true,
            warehouses: true,
            vendors: true,
            purchaseInvoices: true,
          },
        },
      },
    })
    if (!company) return { ok: false as const, message: 'Entreprise introuvable.' }

    const statuses = company.memberships.map((membership) => membership.status)
    const status = deriveCompanyStatus(statuses)

    // Motif de suspension : derniere entree d'audit 'company.suspended' non suivie
    // d'une reactivation. On lit simplement la plus recente suspension.
    let suspendReason: string | null = null
    if (status === 'SUSPENDED') {
      const lastSuspension = await prisma.auditLog.findFirst({
        where: { companyId: company.id, action: 'company.suspended' },
        orderBy: { createdAt: 'desc' },
      })
      if (lastSuspension?.metadata) {
        try {
          suspendReason = (JSON.parse(lastSuspension.metadata).reason as string) ?? null
        } catch {
          suspendReason = null
        }
      }
    }

    const recentActivity = await prisma.auditLog.findMany({
      where: { companyId: company.id },
      orderBy: { createdAt: 'desc' },
      take: 15,
      include: { actor: { select: { name: true, email: true } } },
    })

    return {
      ok: true as const,
      company: {
        id: company.id,
        name: company.name,
        slug: company.slug,
        subdomain: company.subdomain,
        legalName: company.legalName,
        email: company.email,
        phone: company.phone,
        address: company.address,
        taxId: company.taxId,
        rccm: company.rccm,
        currency: company.currency,
        country: company.country,
        website: company.website,
        createdAt: company.createdAt.toISOString(),
        status,
        suspendReason,
        workspaceName: company.workspace?.name ?? null,
        owner: company.workspace?.owner
          ? {
              id: company.workspace.owner.id,
              name: company.workspace.owner.name,
              email: company.workspace.owner.email,
              verified: Boolean(company.workspace.owner.emailVerifiedAt),
              lastLoginAt: company.workspace.owner.lastLoginAt?.toISOString() ?? null,
            }
          : null,
      },
      counts: {
        members: company._count.memberships,
        invoices: company._count.salesInvoices,
        quotes: company._count.quotes,
        customers: company._count.customers,
        employees: company._count.employees,
        items: company._count.items,
        warehouses: company._count.warehouses,
        vendors: company._count.vendors,
        purchases: company._count.purchaseInvoices,
      },
      members: company.memberships.map((membership) => ({
        id: membership.id,
        name: membership.user.name,
        email: membership.user.email,
        status: membership.status,
        roles: membership.roles.map((userRole) => userRole.role.name),
        lastLoginAt: membership.user.lastLoginAt?.toISOString() ?? null,
      })),
      recentActivity: recentActivity.map((log) => ({
        id: log.id,
        action: log.action,
        entity: log.entity,
        actorEmail: log.actor?.email ?? null,
        createdAt: log.createdAt.toISOString(),
      })),
    }
  })

// Statut de compte d'un utilisateur, DERIVE de ses memberships (meme principe que
// deriveCompanyStatus : aucune colonne dediee, base partagee). La suspension d'un
// utilisateur bascule ses memberships ACTIVE en 'DISABLED' — statut distinct du
// 'SUSPENDED' pose par la suspension d'entreprise, pour que reactiver l'un ne
// reactive jamais l'autre.
function deriveUserDisabled(statuses: string[]): boolean {
  return statuses.length > 0 && !statuses.includes('ACTIVE') && statuses.includes('DISABLED')
}

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
        select: {
          status: true,
          company: { select: { name: true, slug: true } },
          roles: { select: { role: { select: { name: true } } } },
        },
      },
    },
  })

  return {
    ok: true as const,
    users: users.map((user) => {
      const statuses = user.memberships.map((membership) => membership.status)
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        isOwner: user.isOwner,
        isSuperAdmin: adminEmails.has(user.email.trim().toLowerCase()),
        verified: Boolean(user.emailVerifiedAt),
        totpEnabled: Boolean(user.totpEnabledAt),
        mustChangePassword: user.mustChangePassword,
        disabled: deriveUserDisabled(statuses),
        lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
        createdAt: user.createdAt.toISOString(),
        sessions: user._count.sessions,
        companies: user.memberships.map((membership) => ({
          name: membership.company.name,
          slug: membership.company.slug,
          status: membership.status,
          roles: membership.roles.map((userRole) => userRole.role.name),
        })),
      }
    }),
  }
})

// Fiche complete d'un utilisateur : profil, entreprises, sessions ouvertes,
// dernieres tentatives de connexion et dernieres actions (journal d'audit).
export const getPlatformUserDetail = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ userId: z.string().min(1) }))
  .handler(async ({ data }) => {
    await requirePlatformAdmin()

    const user = await prisma.user.findUnique({
      where: { id: data.userId },
      include: {
        memberships: {
          orderBy: { createdAt: 'asc' },
          include: {
            company: { select: { name: true, slug: true } },
            roles: { select: { role: { select: { name: true } } } },
          },
        },
        sessions: {
          orderBy: { createdAt: 'desc' },
          select: { id: true, ip: true, userAgent: true, createdAt: true, expiresAt: true },
        },
        ownedWorkspaces: { select: { name: true, _count: { select: { companies: true } } } },
      },
    })
    if (!user) return { ok: false as const, message: 'Utilisateur introuvable.' }

    const [loginEvents, recentActions] = await Promise.all([
      prisma.loginEvent.findMany({ where: { email: user.email }, orderBy: { createdAt: 'desc' }, take: 15 }),
      prisma.auditLog.findMany({
        where: { actorId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 15,
        include: { company: { select: { name: true } } },
      }),
    ])

    const now = Date.now()
    return {
      ok: true as const,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        isOwner: user.isOwner,
        isSuperAdmin: platformAdminEmails().has(user.email.trim().toLowerCase()),
        verified: Boolean(user.emailVerifiedAt),
        verifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
        totpEnabled: Boolean(user.totpEnabledAt),
        mustChangePassword: user.mustChangePassword,
        disabled: deriveUserDisabled(user.memberships.map((membership) => membership.status)),
        lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
        createdAt: user.createdAt.toISOString(),
      },
      workspaces: user.ownedWorkspaces.map((workspace) => ({
        name: workspace.name,
        companies: workspace._count.companies,
      })),
      memberships: user.memberships.map((membership) => ({
        id: membership.id,
        companyName: membership.company.name,
        companySlug: membership.company.slug,
        status: membership.status,
        roles: membership.roles.map((userRole) => userRole.role.name),
      })),
      sessions: user.sessions.map((session) => ({
        id: session.id,
        ip: session.ip,
        userAgent: session.userAgent,
        createdAt: session.createdAt.toISOString(),
        active: session.expiresAt.getTime() > now,
      })),
      loginEvents: loginEvents.map((event) => ({
        id: event.id,
        success: event.success,
        reason: event.reason,
        ip: event.ip,
        createdAt: event.createdAt.toISOString(),
      })),
      recentActions: recentActions.map((log) => ({
        id: log.id,
        action: log.action,
        entity: log.entity,
        companyName: log.company?.name ?? null,
        createdAt: log.createdAt.toISOString(),
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

// Les actions sensibles (devalidation, suspension, suppression, 2FA) sont
// refusees sur les comptes super admin et sur son propre compte : un super admin
// ne peut ni se verrouiller lui-meme ni neutraliser un pair depuis l'interface.
// La liste des super admins se gere uniquement via SUPER_ADMIN_EMAILS (access.ts).
function guardSensitiveUser(target: { id: string; email: string }, actorId: string): string | null {
  if (target.id === actorId) return 'Action refusee sur votre propre compte.'
  if (platformAdminEmails().has(target.email.trim().toLowerCase())) {
    return 'Ce compte est super admin : action refusee.'
  }
  return null
}

// Journalise une action de niveau utilisateur. AuditLog exige une entreprise :
// on ecrit dans la plus ancienne entreprise de l'utilisateur, ou on n'ecrit rien
// s'il n'appartient a aucune (compte en cours d'onboarding).
async function logUserAction(options: {
  userId: string
  actorId: string
  action: string
  metadata?: Record<string, unknown>
}) {
  const membership = await prisma.companyMembership.findFirst({
    where: { userId: options.userId },
    orderBy: { createdAt: 'asc' },
    select: { companyId: true },
  })
  if (!membership) return
  await prisma.auditLog.create({
    data: {
      companyId: membership.companyId,
      actorId: options.actorId,
      action: options.action,
      entity: 'User',
      entityId: options.userId,
      metadata: options.metadata ? JSON.stringify(options.metadata) : null,
    },
  })
}

// Valide ou devalide l'email d'un utilisateur. La verification conditionne deja
// la connexion (auth.ts renvoie needsVerification) : la devalidation revoque les
// sessions pour prendre effet immediatement, comme setOwnerVerified.
export const setUserVerified = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ userId: z.string().min(1), verified: z.boolean() }))
  .handler(async ({ data }) => {
    const context = await requirePlatformAdmin()
    const user = await prisma.user.findUnique({
      where: { id: data.userId },
      select: { id: true, email: true, emailVerifiedAt: true },
    })
    if (!user) return { ok: false as const, message: 'Utilisateur introuvable.' }

    if (!data.verified) {
      const guard = guardSensitiveUser(user, context.user.id)
      if (guard) return { ok: false as const, message: guard }
      await prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: null } })
      await prisma.session.deleteMany({ where: { userId: user.id } })
      invalidateSessionCache()
    } else {
      await prisma.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: user.emailVerifiedAt ?? new Date() },
      })
    }

    await logUserAction({
      userId: user.id,
      actorId: context.user.id,
      action: data.verified ? 'user.verified' : 'user.unverified',
      metadata: { email: user.email },
    })
    return { ok: true as const, verified: data.verified }
  })

// Suspend ou reactive un utilisateur sur TOUTES ses entreprises. La suspension
// bascule ses memberships ACTIVE en 'DISABLED' (statut distinct du 'SUSPENDED'
// d'entreprise : reactiver une entreprise ne reactive pas un compte suspendu) et
// revoque ses sessions. La reactivation fait l'inverse (DISABLED -> ACTIVE).
export const setUserSuspended = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      userId: z.string().min(1),
      suspend: z.boolean(),
      reason: z.string().max(500).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const context = await requirePlatformAdmin()
    const user = await prisma.user.findUnique({
      where: { id: data.userId },
      select: { id: true, email: true },
    })
    if (!user) return { ok: false as const, message: 'Utilisateur introuvable.' }

    const guard = guardSensitiveUser(user, context.user.id)
    if (guard) return { ok: false as const, message: guard }

    if (data.suspend) {
      const reason = data.reason?.trim()
      if (!reason) return { ok: false as const, message: 'Un motif est requis pour suspendre.' }
      const result = await prisma.companyMembership.updateMany({
        where: { userId: user.id, status: 'ACTIVE' },
        data: { status: 'DISABLED' },
      })
      await prisma.session.deleteMany({ where: { userId: user.id } })
      invalidateSessionCache()
      await logUserAction({
        userId: user.id,
        actorId: context.user.id,
        action: 'user.suspended',
        metadata: { email: user.email, reason, membershipsAffected: result.count },
      })
      return { ok: true as const, suspended: true, affected: result.count }
    }

    const result = await prisma.companyMembership.updateMany({
      where: { userId: user.id, status: 'DISABLED' },
      data: { status: 'ACTIVE' },
    })
    invalidateSessionCache()
    await logUserAction({
      userId: user.id,
      actorId: context.user.id,
      action: 'user.reactivated',
      metadata: { email: user.email, membershipsAffected: result.count },
    })
    return { ok: true as const, suspended: false, affected: result.count }
  })

// Desactive la double authentification d'un utilisateur (assistance : telephone
// perdu). Ses sessions sont revoquees : il devra se reconnecter, sans code 2FA.
export const disableUserTotp = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ userId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const context = await requirePlatformAdmin()
    const user = await prisma.user.findUnique({
      where: { id: data.userId },
      select: { id: true, email: true, totpEnabledAt: true },
    })
    if (!user) return { ok: false as const, message: 'Utilisateur introuvable.' }
    if (!user.totpEnabledAt) return { ok: false as const, message: "La 2FA n'est pas activee sur ce compte." }

    const guard = guardSensitiveUser(user, context.user.id)
    if (guard) return { ok: false as const, message: guard }

    await prisma.user.update({ where: { id: user.id }, data: { totpSecret: null, totpEnabledAt: null } })
    await prisma.session.deleteMany({ where: { userId: user.id } })
    invalidateSessionCache()
    await logUserAction({
      userId: user.id,
      actorId: context.user.id,
      action: 'user.totp_disabled',
      metadata: { email: user.email },
    })
    return { ok: true as const }
  })

// Suppression definitive d'un compte utilisateur (cascade : sessions, memberships,
// jetons). Refusee s'il possede encore des entreprises — les supprimer d'abord via
// la page Entreprises — et exige de retaper l'email exact, comme pour un tenant.
export const deletePlatformUser = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ userId: z.string().min(1), confirmEmail: z.string().min(1) }))
  .handler(async ({ data }) => {
    const context = await requirePlatformAdmin()
    const user = await prisma.user.findUnique({
      where: { id: data.userId },
      select: { id: true, email: true },
    })
    if (!user) return { ok: false as const, message: 'Utilisateur introuvable.' }

    const guard = guardSensitiveUser(user, context.user.id)
    if (guard) return { ok: false as const, message: guard }
    if (data.confirmEmail.trim().toLowerCase() !== user.email.trim().toLowerCase()) {
      return { ok: false as const, message: "L'email de confirmation ne correspond pas." }
    }

    const ownedCompanies = await prisma.company.count({ where: { workspace: { ownerId: user.id } } })
    if (ownedCompanies > 0) {
      return {
        ok: false as const,
        message: `Ce compte possede ${ownedCompanies} entreprise(s). Supprimez-les d'abord depuis la page Entreprises.`,
      }
    }

    // Trace ecrite AVANT la suppression : le membership disparait avec le compte.
    await logUserAction({
      userId: user.id,
      actorId: context.user.id,
      action: 'user.deleted',
      metadata: { email: user.email },
    })
    await prisma.user.delete({ where: { id: user.id } })
    invalidateSessionCache()
    return { ok: true as const, deleted: user.email }
  })

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

// Suspend ou reactive une entreprise. La suspension bascule tous les membres
// actifs en 'SUSPENDED' (acces coupe, la session ne charge que les ACTIVE) ; la
// reactivation fait l'inverse. Le motif est exige a la suspension et conserve dans
// le journal d'audit (aucune colonne dediee sur Company, base partagee).
export const setCompanySuspended = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      companyId: z.string().min(1),
      suspend: z.boolean(),
      reason: z.string().max(500).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const context = await requirePlatformAdmin()
    const company = await prisma.company.findUnique({
      where: { id: data.companyId },
      select: { id: true, name: true, slug: true },
    })
    if (!company) return { ok: false as const, message: 'Entreprise introuvable.' }

    if (data.suspend) {
      const reason = data.reason?.trim()
      if (!reason) return { ok: false as const, message: 'Un motif est requis pour suspendre.' }
      const result = await prisma.companyMembership.updateMany({
        where: { companyId: company.id, status: 'ACTIVE' },
        data: { status: 'SUSPENDED' },
      })
      await prisma.auditLog.create({
        data: {
          companyId: company.id,
          actorId: context.user.id,
          action: 'company.suspended',
          entity: 'Company',
          entityId: company.id,
          metadata: JSON.stringify({ reason, membersAffected: result.count }),
        },
      })
      invalidateSessionCache()
      return { ok: true as const, suspended: true, affected: result.count }
    }

    const result = await prisma.companyMembership.updateMany({
      where: { companyId: company.id, status: 'SUSPENDED' },
      data: { status: 'ACTIVE' },
    })
    await prisma.auditLog.create({
      data: {
        companyId: company.id,
        actorId: context.user.id,
        action: 'company.reactivated',
        entity: 'Company',
        entityId: company.id,
        metadata: JSON.stringify({ reason: data.reason?.trim() ?? '', membersAffected: result.count }),
      },
    })
    invalidateSessionCache()
    return { ok: true as const, suspended: false, affected: result.count }
  })

// Marque le proprietaire d'une entreprise comme verifie / non verifie. La
// verification s'appuie sur l'email verifie du compte (User.emailVerifiedAt) qui
// conditionne deja la connexion : la devalidation revoque aussi les sessions du
// proprietaire pour prendre effet immediatement.
export const setOwnerVerified = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ companyId: z.string().min(1), verified: z.boolean() }))
  .handler(async ({ data }) => {
    const context = await requirePlatformAdmin()
    const company = await prisma.company.findUnique({
      where: { id: data.companyId },
      select: {
        id: true,
        workspace: { select: { owner: { select: { id: true, email: true, emailVerifiedAt: true } } } },
      },
    })
    const owner = company?.workspace?.owner
    if (!company || !owner) return { ok: false as const, message: 'Proprietaire introuvable.' }

    if (data.verified) {
      await prisma.user.update({ where: { id: owner.id }, data: { emailVerifiedAt: owner.emailVerifiedAt ?? new Date() } })
    } else {
      await prisma.user.update({ where: { id: owner.id }, data: { emailVerifiedAt: null } })
      await prisma.session.deleteMany({ where: { userId: owner.id } })
      invalidateSessionCache()
    }

    await prisma.auditLog.create({
      data: {
        companyId: company.id,
        actorId: context.user.id,
        action: data.verified ? 'company.owner_verified' : 'company.owner_unverified',
        entity: 'User',
        entityId: owner.id,
        metadata: JSON.stringify({ email: owner.email }),
      },
    })
    return { ok: true as const, verified: data.verified }
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
