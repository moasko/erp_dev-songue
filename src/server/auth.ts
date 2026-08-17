import { createHash, randomBytes } from 'node:crypto'
import { createServerFn } from '@tanstack/react-start'
import { deleteCookie, getCookie, getRequestHeader, getRequestIP, setCookie } from '@tanstack/react-start/server'
import { z } from 'zod'
import { prisma } from './db'
import { getSessionContext, invalidateSessionCache, invalidateSessionToken } from './access'
import { mailIsConfigured, sendMail, verificationCodeEmail } from './mail'
import { hashPassword, verifyPassword } from './password'
import { isBlocked, recordFailure, recordSuccess, throttle } from './rateLimit'
import {
  countryCodes,
  currencyCodes,
  fallbackRootDomain,
  localeCodes,
  validateSubdomain,
} from '~/utils/onboarding'
import { defaultCurrency, defaultLocale } from '~/utils/currency'
import type { Permission } from '@prisma/client'

const sessionCookieName = 'erp_session'
const sessionDurationMs = 1000 * 60 * 60 * 24 * 7
const verificationCodeTtlMs = 1000 * 60 * 15
const verificationMaxAttempts = 6

function rootDomain() {
  return (process.env.APP_ROOT_DOMAIN || fallbackRootDomain).trim().replace(/^\.+/, '')
}

const optionalUrlInput = z.preprocess(
  (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
  z.string().url().optional(),
)

const optionalEmailInput = z.preprocess(
  (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
  z.string().email().optional(),
)

type AuthCompany = {
  id: string
  name: string
  slug: string
  logoUrl?: string | null
  currency?: string | null
  locale?: string | null
  roles: string[]
  permissions: string[]
  enabledModules: string[]
}

export type AuthState = {
  user: {
    id: string
    name: string
    email: string
    isOwner: boolean
  } | null
  companies: AuthCompany[]
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function createSessionToken() {
  return randomBytes(32).toString('base64url')
}

function maskDatabaseUrl(value: string) {
  if (!value) return 'Non configure'
  if (value.startsWith('file:')) return value
  try {
    const url = new URL(value)
    if (url.password) url.password = '***'
    if (url.username) url.username = '***'
    return url.toString()
  } catch {
    return value.replace(/\/\/([^:@/]+):([^@/]+)@/, '//***:***@')
  }
}

function setSessionCookie(token: string, expiresAt: Date) {
  setCookie(sessionCookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  })
}

function clearSessionCookie() {
  deleteCookie(sessionCookieName, { path: '/' })
}

async function readAuthState(): Promise<AuthState> {
  const token = getCookie(sessionCookieName)
  if (!token) return { user: null, companies: [] }

  const context = await getSessionContext()
  if (!context) {
    clearSessionCookie()
    return { user: null, companies: [] }
  }

  return {
    user: context.user,
    companies: context.companies,
  }
}

export const getAuthState = createServerFn({ method: 'GET' }).handler(async () => {
  return readAuthState()
})

// Une fois l'installation faite, elle ne peut pas "se defaire" : on memorise
// le resultat pour ne pas requeter la base a chaque visite de /login ou /
// (cible favorite des scanners automatises).
let installationConfirmed = false

// L'installation est consideree faite quand une entreprise existe, pas des qu'un
// utilisateur existe : l'inscription cree le compte a l'etape 1 et l'entreprise
// seulement a l'etape 2. Compter les utilisateurs verrouillerait /register pour
// quelqu'un qui abandonne entre les deux etapes.
async function isInstalled() {
  if (installationConfirmed) return true
  const companiesCount = await prisma.company.count()
  if (companiesCount > 0) installationConfirmed = true
  return installationConfirmed
}

// L'inscription publique (self-service) reste desactivee par defaut : sur un ERP
// c'est une decision de securite explicite. On l'active via ALLOW_PUBLIC_REGISTRATION.
function publicRegistrationEnabled() {
  return String(process.env.ALLOW_PUBLIC_REGISTRATION ?? '').trim().toLowerCase() === 'true'
}

export const getInstallationState = createServerFn({ method: 'GET' }).handler(async () => {
  try {
    return { needsSetup: !(await isInstalled()), allowRegistration: publicRegistrationEnabled() }
  } catch (error) {
    console.error('Database connection error in getInstallationState:', error)
    // We assume setup is needed or database is unreachable
    return { needsSetup: true, allowRegistration: false, error: true }
  }
})

export const getCompanyAuthState = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ companySlug: z.string().min(1) }))
  .handler(async ({ data }) => {
    const auth = await readAuthState()
    const company = auth.companies.find((item) => item.slug === data.companySlug) ?? null

    return {
      ...auth,
      activeCompany: company,
      canAccessCompany: Boolean(company),
    }
  })

async function recordLoginEvent(input: {
  userId?: string | null
  email: string
  ip: string
  success: boolean
  reason?: string
}) {
  // Le journal de connexion ne doit jamais faire echouer le login lui-meme.
  await prisma.loginEvent.create({
    data: {
      userId: input.userId ?? null,
      email: input.email,
      ip: input.ip,
      success: input.success,
      reason: input.reason ?? null,
    },
  }).catch(() => {})
}

export const login = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      email: z.string().email(),
      password: z.string().min(1),
      totpCode: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const usersCount = await prisma.user.count()
    if (usersCount === 0) {
      return { ok: false, message: 'Premiere installation requise.', needsSetup: true, needsTotp: false, needsVerification: false }
    }

    const email = data.email.toLowerCase().trim()
    const clientIp = getRequestIP({ xForwardedFor: true }) ?? 'unknown'
    const rateLimitKeys = [`login:email:${email}`, `login:ip:${clientIp}`]

    for (const key of rateLimitKeys) {
      const { blocked, retryAfterSeconds } = isBlocked(key)
      if (blocked) {
        const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60))
        return { ok: false, message: `Trop de tentatives. Reessaie dans ${minutes} min.`, needsSetup: false, needsTotp: false, needsVerification: false }
      }
    }

    const user = await prisma.user.findUnique({
      where: { email },
    })

    if (!user || !(await verifyPassword(data.password, user.passwordHash))) {
      rateLimitKeys.forEach(recordFailure)
      await recordLoginEvent({
        userId: user?.id,
        email,
        ip: clientIp,
        success: false,
        reason: user ? 'password' : 'unknown_user',
      })
      return { ok: false, message: 'Email ou mot de passe incorrect.', needsSetup: false, needsTotp: false, needsVerification: false }
    }

    // Compte cree mais code jamais saisi : on renvoie vers /verify plutot que
    // d'ouvrir une session, et on repart sur un code neuf.
    if (!user.emailVerifiedAt) {
      await issueVerificationCode(user)
      return {
        ok: false,
        message: 'Confirme ton adresse email pour continuer.',
        needsSetup: false,
        needsTotp: false,
        needsVerification: true,
        email: user.email,
      }
    }

    // Double authentification : exigee si l'utilisateur l'a activee.
    if (user.totpSecret && user.totpEnabledAt) {
      const { verifyTotp } = await import('./totp')
      if (!data.totpCode) {
        return { ok: false, message: 'Saisis le code de ton application d authentification.', needsSetup: false, needsTotp: true, needsVerification: false }
      }
      if (!verifyTotp(user.totpSecret, data.totpCode)) {
        rateLimitKeys.forEach(recordFailure)
        await recordLoginEvent({ userId: user.id, email, ip: clientIp, success: false, reason: 'totp' })
        return { ok: false, message: 'Code de verification invalide.', needsSetup: false, needsTotp: true, needsVerification: false }
      }
    }

    rateLimitKeys.forEach(recordSuccess)

    const token = createSessionToken()
    const expiresAt = new Date(Date.now() + sessionDurationMs)

    await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt,
        ip: clientIp,
        userAgent: getRequestHeader('user-agent') ?? null,
      },
    })

    setSessionCookie(token, expiresAt)

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }).catch(() => {})
    await recordLoginEvent({ userId: user.id, email, ip: clientIp, success: true })

    const membership = await prisma.companyMembership.findFirst({
      where: { userId: user.id, status: 'ACTIVE' },
      include: { company: true },
      orderBy: { createdAt: 'asc' },
    })

    return {
      ok: true,
      needsSetup: false,
      needsTotp: false,
      needsVerification: false,
      redirectTo: membership ? `/${membership.company.slug}/dashboard` : '/onboarding',
    }
  })

// ─── Inscription en deux etapes ───
// Etape 1 (/register)  : le compte proprietaire, puis un code envoye par email.
// Etape 1b (/verify)   : le code confirme l'adresse et ouvre la session.
// Etape 2 (/onboarding): la boutique (workspace + entreprise).
//
// Le compte existe donc en base avant d'avoir la moindre entreprise : tant que
// `emailVerifiedAt` est nul, il ne peut ni se connecter ni rien creer.

function createVerificationCode() {
  // 6 chiffres tires du CSPRNG (pas Math.random) : c'est un secret d'authentification.
  return String(randomBytes(4).readUInt32BE(0) % 1_000_000).padStart(6, '0')
}

async function issueVerificationCode(user: { id: string; name: string; email: string }) {
  const code = createVerificationCode()

  // Un seul code valide a la fois : les precedents sont invalides.
  await prisma.emailVerificationToken.deleteMany({ where: { userId: user.id, consumedAt: null } })
  await prisma.emailVerificationToken.create({
    data: {
      userId: user.id,
      email: user.email,
      codeHash: hashToken(code),
      expiresAt: new Date(Date.now() + verificationCodeTtlMs),
    },
  })

  const delivery = await sendMail({ to: user.email, ...verificationCodeEmail({ code, name: user.name }) })

  // Sans transport configure, l'email part dans la console du serveur. On renvoie
  // alors le code a l'interface pour que l'inscription reste testable en local —
  // jamais en production, ou il faut un vrai email.
  const exposeCode = !mailIsConfigured() && process.env.NODE_ENV !== 'production'
  return { delivered: delivery.delivered, devCode: exposeCode ? code : undefined }
}

// Cree le compte proprietaire (sans entreprise) et envoie le code de verification.
export const registerOwner = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      name: z.string().min(2),
      email: z.string().email(),
      password: z.string().min(10),
    }),
  )
  .handler(async ({ data }) => {
    const clientIp = getRequestIP({ xForwardedFor: true }) ?? 'unknown'
    if (!throttle(`register:ip:${clientIp}`, 5, 60 * 60 * 1000).allowed) {
      return { ok: false, message: 'Trop de tentatives. Reessaie plus tard.' }
    }

    // Accessible pour l'installation initiale, ou quand l'inscription publique est ouverte.
    if ((await isInstalled()) && !publicRegistrationEnabled()) {
      return { ok: false, message: 'Les inscriptions sont desactivees.' }
    }

    const email = data.email.toLowerCase().trim()
    const existing = await prisma.user.findUnique({ where: { email } })

    if (existing?.emailVerifiedAt) {
      return { ok: false, message: 'Un compte existe deja avec cet email.' }
    }

    try {
      // Compte non verifie deja present : l'inscription a ete abandonnee avant le
      // code. On reprend le meme compte plutot que de bloquer l'adresse a vie.
      const user = existing
        ? await prisma.user.update({
            where: { id: existing.id },
            data: { name: data.name.trim(), passwordHash: await hashPassword(data.password) },
          })
        : await prisma.user.create({
            data: {
              name: data.name.trim(),
              email,
              passwordHash: await hashPassword(data.password),
              isOwner: true,
            },
          })

      const { delivered, devCode } = await issueVerificationCode(user)
      return { ok: true, email: user.email, delivered, devCode }
    } catch (error: any) {
      // Course entre la verification et la creation (email pris entre-temps).
      if (error?.code === 'P2002') {
        return { ok: false, message: 'Un compte existe deja avec cet email.' }
      }
      console.error('registerOwner error:', error)
      return { ok: false, message: 'Impossible de creer le compte pour le moment.' }
    }
  })

export const resendVerificationCode = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ email: z.string().email() }))
  .handler(async ({ data }) => {
    const email = data.email.toLowerCase().trim()
    const clientIp = getRequestIP({ xForwardedFor: true }) ?? 'unknown'
    for (const key of [`verify:resend:${email}`, `verify:resend:ip:${clientIp}`]) {
      if (!throttle(key, 5, 60 * 60 * 1000).allowed) {
        return { ok: false, message: 'Trop de demandes. Reessaie dans une heure.' }
      }
    }

    const user = await prisma.user.findUnique({ where: { email } })
    // Reponse identique si le compte n'existe pas ou est deja verifie : /verify ne
    // doit pas servir a decouvrir quelles adresses sont inscrites.
    if (!user || user.emailVerifiedAt) {
      return { ok: true, delivered: true, devCode: undefined }
    }

    const { delivered, devCode } = await issueVerificationCode(user)
    return { ok: true, delivered, devCode }
  })

// Valide le code, marque l'email comme verifie et ouvre la session.
export const verifyEmailCode = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      email: z.string().email(),
      code: z.string().regex(/^[0-9]{6}$/),
    }),
  )
  .handler(async ({ data }) => {
    const email = data.email.toLowerCase().trim()
    const clientIp = getRequestIP({ xForwardedFor: true }) ?? 'unknown'
    const rateLimitKeys = [`verify:email:${email}`, `verify:ip:${clientIp}`]

    for (const key of rateLimitKeys) {
      const { blocked, retryAfterSeconds } = isBlocked(key)
      if (blocked) {
        const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60))
        return { ok: false, message: `Trop de tentatives. Reessaie dans ${minutes} min.` }
      }
    }

    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      rateLimitKeys.forEach(recordFailure)
      return { ok: false, message: 'Code invalide ou expire.' }
    }
    if (user.emailVerifiedAt) {
      return { ok: false, message: 'Cette adresse est deja verifiee.', alreadyVerified: true }
    }

    const token = await prisma.emailVerificationToken.findFirst({
      where: { userId: user.id, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    })

    if (!token) {
      rateLimitKeys.forEach(recordFailure)
      return { ok: false, message: 'Code expire. Demande un nouveau code.', expired: true }
    }

    // Un code a 6 chiffres se devine : au-dela de quelques essais on le brule.
    if (token.attempts >= verificationMaxAttempts) {
      await prisma.emailVerificationToken.update({ where: { id: token.id }, data: { consumedAt: new Date() } })
      return { ok: false, message: 'Trop d essais. Demande un nouveau code.', expired: true }
    }

    if (token.codeHash !== hashToken(data.code)) {
      rateLimitKeys.forEach(recordFailure)
      await prisma.emailVerificationToken.update({ where: { id: token.id }, data: { attempts: { increment: 1 } } })
      return { ok: false, message: 'Code invalide ou expire.' }
    }

    rateLimitKeys.forEach(recordSuccess)
    await prisma.$transaction([
      prisma.emailVerificationToken.update({ where: { id: token.id }, data: { consumedAt: new Date() } }),
      prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } }),
    ])

    await createSessionForUser(user.id)

    // Un compte invite peut deja avoir une entreprise : inutile de lui faire creer
    // une boutique, il repart sur son tableau de bord.
    const membership = await prisma.companyMembership.findFirst({
      where: { userId: user.id, status: 'ACTIVE' },
      include: { company: true },
      orderBy: { createdAt: 'asc' },
    })

    return { ok: true, redirectTo: membership ? `/${membership.company.slug}/dashboard` : '/onboarding' }
  })

// Etat de l'etape 2 : qui est connecte, a-t-il deja une boutique, quel domaine afficher.
export const getOnboardingState = createServerFn({ method: 'GET' }).handler(async () => {
  const auth = await readAuthState()
  return {
    user: auth.user,
    firstCompanySlug: auth.companies[0]?.slug ?? null,
    rootDomain: rootDomain(),
  }
})

export const checkSubdomainAvailability = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ subdomain: z.string().min(1).max(40) }))
  .handler(async ({ data }) => {
    const auth = await readAuthState()
    if (!auth.user) return { ok: false, available: false, message: 'Session expiree.' }

    const subdomain = data.subdomain.toLowerCase().trim()
    const validation = validateSubdomain(subdomain)
    if (!validation.ok) return { ok: true, available: false, message: validation.message }

    const taken = await prisma.company.findUnique({ where: { subdomain } })
    return {
      ok: true,
      available: !taken,
      subdomain,
      rootDomain: rootDomain(),
      message: taken ? 'Ce sous-domaine est deja pris.' : undefined,
    }
  })

// Etape 2 : cree le workspace et la premiere entreprise du proprietaire verifie.
export const completeOnboarding = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      companyName: z.string().min(2).max(80),
      subdomain: z.string().min(3).max(40),
      country: z.enum(countryCodes as [string, ...Array<string>]),
      currency: z.enum(currencyCodes as [string, ...Array<string>]),
      locale: z.enum(localeCodes as [string, ...Array<string>]),
    }),
  )
  .handler(async ({ data }) => {
    const auth = await readAuthState()
    if (!auth.user) return { ok: false, message: 'Session expiree. Reconnecte-toi.' }
    if (auth.companies.length > 0) {
      return { ok: false, message: 'Une boutique existe deja pour ce compte.', redirectTo: `/${auth.companies[0].slug}/dashboard` }
    }

    // La session n'existe qu'apres verification, mais l'etape 2 cree les donnees :
    // on revalide plutot que de faire confiance au parcours.
    const user = await prisma.user.findUnique({ where: { id: auth.user.id } })
    if (!user?.emailVerifiedAt) return { ok: false, message: 'Adresse email non verifiee.' }

    const subdomain = data.subdomain.toLowerCase().trim()
    const validation = validateSubdomain(subdomain)
    if (!validation.ok) return { ok: false, message: validation.message }

    try {
      await ensureCoreDefinitions()

      const workspace =
        (await prisma.workspace.findFirst({ where: { ownerId: user.id } })) ??
        (await prisma.workspace.create({
          data: {
            name: data.companyName.trim(),
            slug: await uniqueSlug(slugify(data.companyName), 'workspace'),
            ownerId: user.id,
          },
        }))

      const company = await createCompanyForOwner({
        workspaceId: workspace.id,
        ownerId: user.id,
        name: data.companyName.trim(),
        slug: await uniqueSlug(subdomain, 'company'),
        subdomain,
        country: data.country,
        currency: data.currency,
        locale: data.locale,
      })

      installationConfirmed = true
      invalidateSessionCache()
      return { ok: true, redirectTo: `/${company.slug}/dashboard` }
    } catch (error: any) {
      // Course entre la verification de disponibilite et la creation.
      if (error?.code === 'P2002') {
        return { ok: false, message: 'Ce sous-domaine vient d etre pris. Choisis-en un autre.' }
      }
      console.error('completeOnboarding error:', error)
      return { ok: false, message: 'Impossible de creer la boutique pour le moment.' }
    }
  })

export const logout = createServerFn({ method: 'POST' }).handler(async () => {
  const token = getCookie(sessionCookieName)
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } })
    invalidateSessionToken(token)
  }
  clearSessionCookie()
  return { ok: true }
})

export const createCompany = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      name: z.string().min(2),
      slug: z.string().min(2).regex(/^[a-z0-9-]+$/),
      legalName: z.string().optional(),
      logoUrl: optionalUrlInput,
      address: z.string().optional(),
      phone: z.string().optional(),
      email: optionalEmailInput,
      taxId: z.string().optional(),
      website: optionalUrlInput,
    }),
  )
  .handler(async ({ data }) => {
    const auth = await readAuthState()
    if (!auth.user?.isOwner) return { ok: false, message: 'Action reservee au proprietaire.' }

    const workspace = await prisma.workspace.findFirst({ where: { ownerId: auth.user.id } })
    if (!workspace) return { ok: false, message: 'Workspace introuvable.' }

    const exists = await prisma.company.findUnique({ where: { slug: data.slug } })
    if (exists) return { ok: false, message: 'Ce slug est deja utilise.' }

    await ensureCoreDefinitions()
    const company = await createCompanyForOwner({
      workspaceId: workspace.id,
      ownerId: auth.user.id,
      name: data.name.trim(),
      slug: data.slug,
      legalName: data.legalName?.trim(),
      logoUrl: data.logoUrl?.trim(),
      address: data.address?.trim(),
      phone: data.phone?.trim(),
      email: data.email?.trim(),
      taxId: data.taxId?.trim(),
      website: data.website?.trim(),
    })

    invalidateSessionCache()
    return { ok: true, companySlug: company.slug }
  })

export const getCompanyAdministration = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ companySlug: z.string().min(1) }))
  .handler(async ({ data }) => {
    const auth = await readAuthState()
    const companyAccess = auth.companies.find((company) => company.slug === data.companySlug)
    if (!auth.user || !companyAccess) {
      return { ok: false, message: 'Acces refuse.', users: [], roles: [], permissions: [] }
    }
    // Le panneau d'administration expose la liste des membres (emails), les roles
    // et les invitations : reserve aux gestionnaires, pas a tout membre de l'entreprise.
    if (!auth.user.isOwner && !companyAccess.permissions.includes('company.manage')) {
      return { ok: false, message: 'Permission insuffisante.', users: [], roles: [], permissions: [] }
    }

    const company = await prisma.company.findUnique({
      where: { slug: data.companySlug },
      include: {
        memberships: {
          include: {
            user: true,
            roles: { include: { role: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
        roles: {
          include: { permissions: { include: { permission: true } }, users: true },
          orderBy: { createdAt: 'asc' },
        },
        modules: { include: { module: true }, orderBy: { moduleId: 'asc' } },
      },
    })

    const [permissions, invitations] = await Promise.all([
      prisma.permission.findMany({ orderBy: { key: 'asc' } }),
      company
        ? prisma.companyInvitation.findMany({
            where: { companyId: company.id, acceptedAt: null, expiresAt: { gt: new Date() } },
            orderBy: { createdAt: 'desc' },
          })
        : Promise.resolve([]),
    ])

    return {
      ok: true,
      invitations: invitations.map((invitation) => ({
        id: invitation.id,
        email: invitation.email,
        roleName: invitation.roleName,
        expiresAt: invitation.expiresAt.toISOString(),
      })),
      company: company
        ? {
            id: company.id,
            name: company.name,
            slug: company.slug,
            currency: company.currency ?? defaultCurrency,
            locale: company.locale ?? defaultLocale,
            legalName: company.legalName ?? '',
            logoUrl: company.logoUrl ?? '',
            address: company.address ?? '',
            phone: company.phone ?? '',
            email: company.email ?? '',
            taxId: company.taxId ?? '',
            website: company.website ?? '',
          }
        : null,
      users:
        company?.memberships.map((membership) => ({
          id: membership.id,
          userId: membership.user.id,
          isOwner: membership.user.isOwner,
          name: membership.user.name,
          email: membership.user.email,
          status: membership.status,
          roles: membership.roles.map((role) => role.role.name),
          roleIds: membership.roles.map((role) => role.role.id),
          lastLoginAt: membership.user.lastLoginAt?.toISOString() ?? null,
        })) ?? [],
      roles:
        company?.roles.map((role) => ({
          id: role.id,
          name: role.name,
          description: role.description ?? '',
          systemKey: role.systemKey,
          users: role.users.length,
          permissions: role.permissions.map((permission) => permission.permission.key),
        })) ?? [],
      permissions: permissions.map((permission) => ({ id: permission.id, key: permission.key, moduleKey: permission.moduleKey })),
      modules: company?.modules.map((entry) => ({ key: entry.moduleId, name: entry.module.name, category: entry.module.category, description: entry.module.description ?? '', enabled: entry.enabled })) ?? [],
    }
  })

export const updateCompanyModule = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ companySlug: z.string().min(1), moduleKey: z.string().min(1), enabled: z.boolean() }))
  .handler(async ({ data }) => {
    const auth = await readAuthState()
    const access = auth.companies.find((company) => company.slug === data.companySlug)
    if (!auth.user || (!auth.user.isOwner && !access?.permissions.includes(data.enabled ? 'module.enable' : 'module.disable'))) return { ok: false, message: 'Permission insuffisante.' }
    if (data.moduleKey === 'settings' && !data.enabled) return { ok: false, message: 'Le module Administration doit rester actif.' }
    const company = await prisma.company.findUnique({ where: { slug: data.companySlug } })
    const definition = await prisma.moduleDefinition.findUnique({ where: { key: data.moduleKey } })
    if (!company || !definition) return { ok: false, message: 'Module ou entreprise introuvable.' }
    await prisma.companyModule.upsert({ where: { companyId_moduleId: { companyId: company.id, moduleId: data.moduleKey } }, update: { enabled: data.enabled }, create: { companyId: company.id, moduleId: data.moduleKey, enabled: data.enabled } })
    await prisma.auditLog.create({ data: { companyId: company.id, actorId: auth.user.id, action: data.enabled ? 'module.enabled' : 'module.disabled', entity: 'CompanyModule', entityId: data.moduleKey } })
    invalidateSessionCache()
    return { ok: true }
  })

export const getInstallationSettings = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ companySlug: z.string().min(1) }))
  .handler(async ({ data }) => {
    const auth = await readAuthState()
    const access = auth.companies.find((company) => company.slug === data.companySlug)
    if (!auth.user?.isOwner && !access?.permissions.includes('company.manage')) {
      return { ok: false, message: 'Permission insuffisante.' }
    }

    const { readFile } = await import('node:fs/promises')
    const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as {
      name?: string
      type?: string
      scripts?: Record<string, string>
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    const envExample = await readFile('.env.example', 'utf8').catch(() => '')
    const databaseUrl = process.env.DATABASE_URL || envExample.match(/DATABASE_URL="?([^"\r\n]+)"?/)?.[1] || ''

    return {
      ok: true,
      app: {
        name: packageJson.name ?? 'erp-platform',
        type: packageJson.type ?? 'module',
      },
      scripts: packageJson.scripts ?? {},
      runtime: {
        react: packageJson.dependencies?.react ?? '',
        vite: packageJson.devDependencies?.vite ?? '',
        prisma: packageJson.devDependencies?.prisma ?? packageJson.dependencies?.['@prisma/client'] ?? '',
        tanstackStart: packageJson.dependencies?.['@tanstack/react-start'] ?? '',
      },
      database: {
        provider: 'sqlite',
        url: maskDatabaseUrl(databaseUrl),
        envKey: 'DATABASE_URL',
        schema: 'prisma/schema.prisma',
        config: 'prisma.config.ts',
      },
      files: [
        { label: 'Variables environnement', path: '.env / .env.example' },
        { label: 'Schema base de donnees', path: 'prisma/schema.prisma' },
        { label: 'Base locale par defaut', path: 'prisma/dev.db' },
        { label: 'Configuration Prisma', path: 'prisma.config.ts' },
        { label: 'Build serveur', path: '.output/server/index.mjs' },
        { label: 'Manifest PWA', path: 'public/site.webmanifest' },
      ],
    }
  })

export const updateCompanyProfile = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      companySlug: z.string().min(1),
      name: z.string().min(2),
      currency: z.enum(currencyCodes as [string, ...Array<string>]),
      locale: z.enum(localeCodes as [string, ...Array<string>]),
      legalName: z.string().optional(),
      logoUrl: optionalUrlInput,
      address: z.string().optional(),
      phone: z.string().optional(),
      email: z.string().optional(),
      taxId: z.string().optional(),
      website: optionalUrlInput,
    }),
  )
  .handler(async ({ data }) => {
    const auth = await readAuthState()
    const access = auth.companies.find((company) => company.slug === data.companySlug)
    if (!auth.user?.isOwner && !access?.permissions.includes('company.manage')) {
      return { ok: false, message: 'Permission insuffisante.' }
    }

    const company = await prisma.company.findUnique({ where: { slug: data.companySlug } })
    if (!company) return { ok: false, message: 'Entreprise introuvable.' }

    const updated = await prisma.$transaction(async (tx) => {
      const updatedCompany = await tx.company.update({
        where: { id: company.id },
        data: {
          name: data.name.trim(),
          currency: data.currency,
          locale: data.locale,
          legalName: data.legalName?.trim() || null,
          logoUrl: data.logoUrl?.trim() || null,
          address: data.address?.trim() || null,
          phone: data.phone?.trim() || null,
          email: data.email?.trim() || null,
          taxId: data.taxId?.trim() || null,
          website: data.website?.trim() || null,
        },
      })

      await tx.quoteSettings.upsert({
        where: { companyId: updatedCompany.id },
        update: {
          logoUrl: updatedCompany.logoUrl,
          legalName: updatedCompany.legalName || updatedCompany.name,
          address: updatedCompany.address,
          phone: updatedCompany.phone,
          email: updatedCompany.email,
          taxId: updatedCompany.taxId,
        },
        create: {
          companyId: updatedCompany.id,
          logoUrl: updatedCompany.logoUrl,
          legalName: updatedCompany.legalName || updatedCompany.name,
          address: updatedCompany.address,
          phone: updatedCompany.phone,
          email: updatedCompany.email,
          taxId: updatedCompany.taxId,
        },
      })

      await tx.auditLog.create({
        data: {
          companyId: updatedCompany.id,
          actorId: auth.user?.id,
          action: 'company.profile_updated',
          entity: 'Company',
          entityId: updatedCompany.id,
          metadata: JSON.stringify({ name: updatedCompany.name, legalName: updatedCompany.legalName }),
        },
      })

      return updatedCompany
    })

    invalidateSessionCache()
    return {
      ok: true,
      company: {
        id: updated.id,
        name: updated.name,
        slug: updated.slug,
        currency: updated.currency ?? defaultCurrency,
        locale: updated.locale ?? defaultLocale,
        legalName: updated.legalName ?? '',
        logoUrl: updated.logoUrl ?? '',
        address: updated.address ?? '',
        phone: updated.phone ?? '',
        email: updated.email ?? '',
        taxId: updated.taxId ?? '',
        website: updated.website ?? '',
      },
    }
  })

export const createRole = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      companySlug: z.string().min(1),
      name: z.string().min(2),
      description: z.string().optional(),
      permissionKeys: z.array(z.string()).min(1),
    }),
  )
  .handler(async ({ data }) => {
    const auth = await readAuthState()
    const access = auth.companies.find((company) => company.slug === data.companySlug)
    if (!auth.user?.isOwner && !access?.permissions.includes('company.manage')) {
      return { ok: false, message: 'Permission insuffisante.' }
    }

    const company = await prisma.company.findUnique({ where: { slug: data.companySlug } })
    if (!company) return { ok: false, message: 'Entreprise introuvable.' }

    const existing = await prisma.role.findUnique({ where: { companyId_name: { companyId: company.id, name: data.name.trim() } } })
    if (existing) return { ok: false, message: 'Ce role existe deja.' }

    const permissions = await prisma.permission.findMany({ where: { key: { in: data.permissionKeys } } })
    await prisma.role.create({
      data: {
        companyId: company.id,
        name: data.name.trim(),
        description: data.description?.trim(),
        permissions: { create: permissions.map((permission) => ({ permissionId: permission.id })) },
      },
    })

    invalidateSessionCache()
    return { ok: true }
  })

const roleMutationInput = z.object({
  companySlug: z.string().min(1),
  roleId: z.string().min(1),
})

export const updateRole = createServerFn({ method: 'POST' })
  .inputValidator(
    roleMutationInput.extend({
      name: z.string().trim().min(2).max(80),
      description: z.string().trim().max(240).optional(),
      permissionKeys: z.array(z.string()).min(1),
    }),
  )
  .handler(async ({ data }) => {
    const auth = await readAuthState()
    const access = auth.companies.find((company) => company.slug === data.companySlug)
    if (!auth.user || (!auth.user.isOwner && !access?.permissions.includes('company.manage'))) {
      return { ok: false, message: 'Permission insuffisante.' }
    }
    const actorId = auth.user.id

    const role = await prisma.role.findFirst({
      where: { id: data.roleId, company: { slug: data.companySlug } },
    })
    if (!role) return { ok: false, message: 'Role introuvable.' }
    if (role.systemKey) return { ok: false, message: 'Les roles systeme ne peuvent pas etre modifies.' }

    const duplicate = await prisma.role.findFirst({
      where: { companyId: role.companyId, name: data.name, id: { not: role.id } },
    })
    if (duplicate) return { ok: false, message: 'Un role porte deja ce nom.' }

    const permissionKeys = Array.from(new Set(data.permissionKeys))
    const permissions = await prisma.permission.findMany({ where: { key: { in: permissionKeys } } })
    if (permissions.length !== permissionKeys.length) {
      return { ok: false, message: 'Une ou plusieurs permissions sont invalides.' }
    }

    await prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId: role.id } })
      await tx.role.update({
        where: { id: role.id },
        data: {
          name: data.name,
          description: data.description || null,
          permissions: { create: permissions.map((permission) => ({ permissionId: permission.id })) },
        },
      })
      await tx.auditLog.create({
        data: {
          companyId: role.companyId,
          actorId,
          action: 'role.updated',
          entity: 'Role',
          entityId: role.id,
          metadata: JSON.stringify({ name: data.name, permissionKeys }),
        },
      })
    })

    invalidateSessionCache()
    return { ok: true }
  })

export const deleteRole = createServerFn({ method: 'POST' })
  .inputValidator(roleMutationInput)
  .handler(async ({ data }) => {
    const auth = await readAuthState()
    const access = auth.companies.find((company) => company.slug === data.companySlug)
    if (!auth.user || (!auth.user.isOwner && !access?.permissions.includes('company.manage'))) {
      return { ok: false, message: 'Permission insuffisante.' }
    }
    const actorId = auth.user.id

    const role = await prisma.role.findFirst({
      where: { id: data.roleId, company: { slug: data.companySlug } },
      include: { _count: { select: { users: true } } },
    })
    if (!role) return { ok: false, message: 'Role introuvable.' }
    if (role.systemKey) return { ok: false, message: 'Les roles systeme ne peuvent pas etre supprimes.' }
    if (role._count.users > 0) {
      return { ok: false, message: 'Retire d abord ce role de tous les utilisateurs.' }
    }

    await prisma.$transaction(async (tx) => {
      await tx.auditLog.create({
        data: {
          companyId: role.companyId,
          actorId,
          action: 'role.deleted',
          entity: 'Role',
          entityId: role.id,
          metadata: JSON.stringify({ name: role.name }),
        },
      })
      await tx.role.delete({ where: { id: role.id } })
    })

    invalidateSessionCache()
    return { ok: true }
  })


// Renvoie un slug libre en suffixant un compteur si la base contient deja le slug.
async function uniqueSlug(base: string, kind: 'workspace' | 'company') {
  const root = base && base.length > 0 ? base : kind === 'company' ? 'entreprise' : 'espace'
  let candidate = root
  for (let n = 2; n < 1000; n += 1) {
    const taken =
      kind === 'workspace'
        ? await prisma.workspace.findUnique({ where: { slug: candidate } })
        : await prisma.company.findUnique({ where: { slug: candidate } })
    if (!taken) return candidate
    const suffix = `-${n}`
    candidate = `${root.slice(0, 60 - suffix.length)}${suffix}`
  }
  return `${root.slice(0, 51)}-${randomBytes(4).toString('hex')}`
}

async function createSessionForUser(userId: string) {
  const token = createSessionToken()
  const expiresAt = new Date(Date.now() + sessionDurationMs)

  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt,
      ip: getRequestIP({ xForwardedFor: true }) ?? null,
      userAgent: getRequestHeader('user-agent') ?? null,
    },
  })

  setSessionCookie(token, expiresAt)
}

async function createCompanyForOwner(input: {
  workspaceId: string
  ownerId: string
  name: string
  slug: string
  subdomain?: string
  country?: string
  currency?: string
  locale?: string
  legalName?: string
  logoUrl?: string
  address?: string
  phone?: string
  email?: string
  taxId?: string
  website?: string
}) {
  const company = await prisma.company.create({
    data: {
      workspaceId: input.workspaceId,
      name: input.name,
      slug: input.slug,
      subdomain: input.subdomain || null,
      country: input.country || null,
      currency: input.currency || null,
      locale: input.locale || null,
      legalName: input.legalName || null,
      logoUrl: input.logoUrl || null,
      address: input.address || null,
      phone: input.phone || null,
      email: input.email || null,
      taxId: input.taxId || null,
      website: input.website || null,
    },
  })

  await prisma.quoteSettings.create({
    data: {
      companyId: company.id,
      logoUrl: company.logoUrl,
      legalName: company.legalName || company.name,
      address: company.address,
      phone: company.phone,
      email: company.email,
      taxId: company.taxId,
    },
  })

  const modules = await prisma.moduleDefinition.findMany()
  await prisma.companyModule.createMany({
    data: modules.map((module) => ({
      companyId: company.id,
      moduleId: module.key,
      enabled: true,
    })),
  })

  const permissions = await prisma.permission.findMany()
  const ownerRole = await prisma.role.create({
    data: {
      companyId: company.id,
      name: 'Proprietaire',
      description: 'Controle total sur cette entreprise.',
      systemKey: 'owner',
      permissions: { create: permissions.map((permission: Permission) => ({ permissionId: permission.id })) },
    },
  })

  const adminRole = await prisma.role.create({
    data: {
      companyId: company.id,
      name: 'Administrateur',
      description: 'Gestion des modules, utilisateurs, roles et operations.',
      systemKey: 'admin',
      permissions: { create: permissions.map((permission: Permission) => ({ permissionId: permission.id })) },
    },
  })

  const accountantPermissions = permissions.filter((permission: Permission) =>
    ['invoice.', 'finance.', 'audit.'].some((prefix) => permission.key.startsWith(prefix)),
  )
  await prisma.role.create({
    data: {
      companyId: company.id,
      name: 'Comptable',
      description: 'Gestion finance, factures et rapports comptables.',
      systemKey: 'accountant',
      permissions: { create: accountantPermissions.map((permission: Permission) => ({ permissionId: permission.id })) },
    },
  })

  await prisma.role.create({
    data: {
      companyId: company.id,
      name: 'Lecture seule',
      description: 'Consultation sans modification.',
      systemKey: 'readonly',
      permissions: {
        create: permissions
          .filter((permission: Permission) => permission.key.endsWith('.read') || permission.key === 'audit.read')
          .map((permission: Permission) => ({ permissionId: permission.id })),
      },
    },
  })

  const membership = await prisma.companyMembership.create({
    data: {
      userId: input.ownerId,
      companyId: company.id,
      status: 'ACTIVE',
    },
  })

  await prisma.userRole.create({
    data: {
      membershipId: membership.id,
      roleId: ownerRole.id,
    },
  })

  void adminRole
  return company
}

async function ensureCoreDefinitions() {
  const modules = [
    { key: 'crm', name: 'CRM', category: 'Sales', permissions: ['customer.create', 'customer.read', 'customer.update', 'customer.delete'] },
    { key: 'sales', name: 'Ventes', category: 'Sales', permissions: ['invoice.create', 'invoice.read', 'invoice.update', 'invoice.delete'] },
    { key: 'inventory', name: 'Stock', category: 'Operations', permissions: ['inventory.read', 'inventory.update', 'inventory.manage'] },
    { key: 'finance', name: 'Finance', category: 'Finance', permissions: ['finance.read', 'finance.manage', 'audit.read'] },
    { key: 'hr', name: 'RH', category: 'People', permissions: ['employee.create', 'employee.read', 'employee.update', 'employee.delete'] },
    { key: 'settings', name: 'Administration', category: 'Core', permissions: ['company.read', 'company.manage', 'module.enable', 'module.disable'] },
  ]

  for (const module of modules) {
    await prisma.moduleDefinition.upsert({
      where: { key: module.key },
      update: { name: module.name, category: module.category },
      create: { key: module.key, name: module.name, category: module.category },
    })

    for (const permission of module.permissions) {
      await prisma.permission.upsert({
        where: { key: permission },
        update: { moduleKey: module.key },
        create: { key: permission, moduleKey: module.key },
      })
    }
  }
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}
