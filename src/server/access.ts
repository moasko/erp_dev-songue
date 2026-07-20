import { createHash } from 'node:crypto'
import { getCookie, getRequestIP } from '@tanstack/react-start/server'
import { prisma } from './db'
import { throttle } from './rateLimit'

const sessionCookieName = 'erp_session'

export type SessionCompany = {
  id: string
  name: string
  slug: string
  logoUrl: string | null
  currency: string | null
  locale: string | null
  roles: string[]
  permissions: string[]
}

export type SessionContext = {
  sessionId: string
  expiresAt: Date
  user: { id: string; name: string; email: string; isOwner: boolean; isSuperAdmin: boolean }
  companies: SessionCompany[]
}

// Super administrateurs de la plateforme : au-dessus des entreprises, ils gerent
// l'ensemble (tenants, utilisateurs, sante systeme). L'appartenance est controlee
// par la variable d'environnement SUPER_ADMIN_EMAILS (emails separes par des
// virgules), jamais par un secret en dur ni un bouton dans l'interface : c'est une
// decision d'exploitation. Pour activer, ajouter son email a SUPER_ADMIN_EMAILS
// dans .env puis redemarrer le serveur.
export function platformAdminEmails(): Set<string> {
  return new Set(
    String(process.env.SUPER_ADMIN_EMAILS ?? '')
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  )
}

export function isPlatformAdminEmail(email: string): boolean {
  const emails = platformAdminEmails()
  return emails.has(email.trim().toLowerCase())
}

// Cache de session en memoire (par processus), meme compromis que rateLimit.ts :
// suffisant pour une instance self-hosted unique, a remplacer par un stockage
// partage (Redis) en multi-instance. Evite de rejouer la requete
// session -> roles -> permissions a chaque server function. Une revocation de
// permission peut donc mettre jusqu'a `sessionCacheTtlMs` a prendre effet.
const sessionCacheTtlMs = 30 * 1000
const sessionCacheMaxEntries = 5000
const sessionCache = new Map<string, { context: SessionContext; cachedAt: number }>()

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export function invalidateSessionCache() {
  sessionCache.clear()
}

export function invalidateSessionToken(token: string) {
  sessionCache.delete(hashToken(token))
}

function pruneSessionCache(now: number) {
  for (const [key, entry] of sessionCache) {
    if (now - entry.cachedAt >= sessionCacheTtlMs) sessionCache.delete(key)
  }
  if (sessionCache.size >= sessionCacheMaxEntries) sessionCache.clear()
}

async function loadSessionContext(tokenHash: string): Promise<SessionContext | null> {
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      expiresAt: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          isOwner: true,
          memberships: {
            where: { status: 'ACTIVE' },
            select: {
              company: {
                select: { id: true, name: true, slug: true, logoUrl: true, currency: true, locale: true },
              },
              roles: {
                select: {
                  role: {
                    select: {
                      name: true,
                      permissions: { select: { permission: { select: { key: true } } } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  })
  if (!session) return null

  return {
    sessionId: session.id,
    expiresAt: session.expiresAt,
    user: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      isOwner: session.user.isOwner,
      isSuperAdmin: isPlatformAdminEmail(session.user.email),
    },
    companies: session.user.memberships.map((membership) => ({
      id: membership.company.id,
      name: membership.company.name,
      slug: membership.company.slug,
      logoUrl: membership.company.logoUrl,
      currency: membership.company.currency,
      locale: membership.company.locale,
      roles: membership.roles.map((userRole) => userRole.role.name),
      permissions: Array.from(
        new Set(
          membership.roles.flatMap((userRole) =>
            userRole.role.permissions.map((rolePermission) => rolePermission.permission.key),
          ),
        ),
      ),
    })),
  }
}

// Garde anti-flood globale : borne genereuse (un usage normal reste tres en
// dessous), mais bloque un scanner ou un script qui martele les endpoints
// depuis une meme IP.
const floodLimit = 600
const floodWindowMs = 60 * 1000

export async function getSessionContext(): Promise<SessionContext | null> {
  const ip = getRequestIP({ xForwardedFor: true }) ?? 'unknown'
  const flood = throttle(`flood:ip:${ip}`, floodLimit, floodWindowMs)
  if (!flood.allowed) {
    throw new Error('Trop de requetes. Reessaie dans un instant.')
  }

  const token = getCookie(sessionCookieName)
  if (!token) return null

  const tokenHash = hashToken(token)
  const now = Date.now()

  const cached = sessionCache.get(tokenHash)
  if (cached && now - cached.cachedAt < sessionCacheTtlMs) {
    if (cached.context.expiresAt > new Date(now)) return cached.context
    sessionCache.delete(tokenHash)
  }

  const context = await loadSessionContext(tokenHash)
  if (!context) {
    sessionCache.delete(tokenHash)
    return null
  }
  if (context.expiresAt <= new Date(now)) {
    sessionCache.delete(tokenHash)
    await prisma.session.delete({ where: { id: context.sessionId } }).catch(() => {})
    return null
  }

  pruneSessionCache(now)
  sessionCache.set(tokenHash, { context, cachedAt: now })
  return context
}

export async function requireCompanyAccess(companySlug: string, permission?: string) {
  const context = await getSessionContext()
  if (!context) throw new Error('Authentication required')

  const company = context.companies.find((item) => item.slug === companySlug)
  if (!company) throw new Error('Company access denied')

  const permissions = new Set(company.permissions)
  if (permission && !context.user.isOwner && !permissions.has(permission)) {
    throw new Error('Permission denied')
  }

  return {
    user: context.user,
    company,
    permissions,
  }
}

// Garde serveur pour l'espace super admin : toute server function de la plateforme
// doit l'appeler en premier. La verification se fait cote serveur a partir de la
// session (email dans SUPER_ADMIN_EMAILS), jamais a partir d'un indicateur envoye
// par le client.
export async function requirePlatformAdmin() {
  const context = await getSessionContext()
  if (!context) throw new Error('Authentication required')
  if (!context.user.isSuperAdmin) throw new Error('Platform admin access denied')
  return context
}
