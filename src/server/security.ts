import { createHash, randomBytes } from 'node:crypto'
import { createServerFn } from '@tanstack/react-start'
import { getCookie, getRequestHeader, getRequestIP, setCookie } from '@tanstack/react-start/server'
import { z } from 'zod'
import { prisma } from './db'
import { getSessionContext, invalidateSessionCache, requireCompanyAccess } from './access'
import { appBaseUrl, invitationEmail, passwordResetEmail, sendMail } from './mail'
import { hashPassword, verifyPassword } from './password'
import { isBlocked, recordFailure, recordSuccess, throttle } from './rateLimit'
import { generateTotpSecret, totpUri, verifyTotp } from './totp'

const sessionCookieName = 'erp_session'
const sessionDurationMs = 1000 * 60 * 60 * 24 * 7
const invitationDurationMs = 1000 * 60 * 60 * 24 * 7 // 7 jours
const resetDurationMs = 1000 * 60 * 30 // 30 minutes
const minPasswordLength = 10

async function createSessionForUser(userId: string) {
  const token = createToken()
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
  setCookie(sessionCookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  })
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function createToken() {
  return randomBytes(32).toString('base64url')
}

function clientIp() {
  return getRequestIP({ xForwardedFor: true }) ?? 'unknown'
}

function maskEmail(email: string) {
  const [local, domain] = email.split('@')
  if (!domain) return email
  const visible = local.slice(0, 2)
  return `${visible}${'*'.repeat(Math.max(1, local.length - 2))}@${domain}`
}

async function requireUser() {
  const context = await getSessionContext()
  if (!context) throw new Error('Authentication required')
  const user = await prisma.user.findUnique({ where: { id: context.user.id } })
  if (!user) throw new Error('Authentication required')
  return user
}

function currentTokenHash() {
  const token = getCookie(sessionCookieName)
  return token ? hashToken(token) : null
}

// ---------------------------------------------------------------------------
// Invitations par lien (chantier B)
// ---------------------------------------------------------------------------

export const createInvitation = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    companySlug: z.string().min(1),
    email: z.string().email(),
    roleId: z.string().min(1),
  }))
  .handler(async ({ data }) => {
    const { user, company } = await requireCompanyAccess(data.companySlug, 'company.manage')

    const role = await prisma.role.findFirst({ where: { id: data.roleId, companyId: company.id } })
    if (!role) return { ok: false as const, message: 'Role introuvable.' }

    const email = data.email.toLowerCase().trim()
    const existingMember = await prisma.companyMembership.findFirst({
      where: { companyId: company.id, status: 'ACTIVE', user: { email } },
    })
    if (existingMember) return { ok: false as const, message: 'Cette personne est deja membre de l entreprise.' }

    const token = createToken()
    await prisma.companyInvitation.create({
      data: {
        companyId: company.id,
        inviterId: user.id,
        email,
        roleName: role.name,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + invitationDurationMs),
      },
    })

    await prisma.auditLog.create({
      data: {
        companyId: company.id,
        actorId: user.id,
        action: 'membership.invitation_created',
        entity: 'CompanyInvitation',
        entityId: email,
        metadata: JSON.stringify({ email, role: role.name }),
      },
    })

    const invitePath = `/invite/${token}`
    const baseUrl = appBaseUrl()

    // Sans email envoye (pas de transport, ou APP_BASE_URL absent en production),
    // le lien reste affiche dans l'interface : l'invitation est transmise a la main
    // plutot que perdue. Le token n'est jamais stocke en clair, ce lien est donc
    // la seule occasion de le lire.
    const delivery = baseUrl
      ? await sendMail({
          to: email,
          ...invitationEmail({
            inviteUrl: `${baseUrl}${invitePath}`,
            companyName: company.name,
            roleName: role.name,
            inviterName: user.name,
          }),
        })
      : null

    if (!baseUrl) {
      console.warn('createInvitation: APP_BASE_URL manquant, invitation non envoyee par email.')
    }

    return { ok: true as const, invitePath, delivered: Boolean(delivery?.delivered) }
  })

export const getInvitationInfo = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ token: z.string().min(1) }))
  .handler(async ({ data }) => {
    // Anti-scan : borne les consultations de tokens par IP.
    const probe = throttle(`invite-info:ip:${clientIp()}`, 30, 5 * 60 * 1000)
    if (!probe.allowed) return { ok: false as const, message: 'Trop de requetes. Reessaie dans quelques minutes.' }

    const invitation = await prisma.companyInvitation.findUnique({
      where: { tokenHash: hashToken(data.token) },
      include: { company: true, inviter: true },
    })
    if (!invitation) return { ok: false as const, message: 'Invitation introuvable ou revoquee.' }
    if (invitation.acceptedAt) return { ok: false as const, message: 'Cette invitation a deja ete utilisee.' }
    if (invitation.expiresAt <= new Date()) return { ok: false as const, message: 'Cette invitation a expire.' }

    const existingUser = await prisma.user.findUnique({ where: { email: invitation.email } })
    return {
      ok: true as const,
      companyName: invitation.company.name,
      email: invitation.email,
      roleName: invitation.roleName,
      inviterName: invitation.inviter.name,
      hasAccount: Boolean(existingUser),
    }
  })

export const acceptInvitation = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    token: z.string().min(1),
    name: z.string().optional(),
    password: z.string().optional(),
  }))
  .handler(async ({ data }) => {
    const rateKey = `invite:ip:${clientIp()}`
    const { blocked, retryAfterSeconds } = isBlocked(rateKey)
    if (blocked) {
      const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60))
      return { ok: false as const, message: `Trop de tentatives. Reessaie dans ${minutes} min.` }
    }

    const invitation = await prisma.companyInvitation.findUnique({
      where: { tokenHash: hashToken(data.token) },
      include: { company: true },
    })
    if (!invitation || invitation.acceptedAt || invitation.expiresAt <= new Date()) {
      recordFailure(rateKey)
      return { ok: false as const, message: 'Invitation invalide, expiree ou deja utilisee.' }
    }

    let user = await prisma.user.findUnique({ where: { email: invitation.email } })
    const isNewUser = !user
    if (!user) {
      const name = data.name?.trim()
      if (!name || name.length < 2) return { ok: false as const, message: 'Renseigne ton nom.' }
      if (!data.password || data.password.length < minPasswordLength) {
        return { ok: false as const, message: `Mot de passe de ${minPasswordLength} caracteres minimum.` }
      }
      user = await prisma.user.create({
        data: {
          name,
          email: invitation.email,
          passwordHash: await hashPassword(data.password),
          // Le lien d'invitation a ete recu sur cette adresse : elle est donc deja
          // prouvee. Sans cette date, le compte serait renvoye vers /verify.
          emailVerifiedAt: new Date(),
        },
      })
    }

    const role = await prisma.role.findFirst({
      where: { companyId: invitation.companyId, name: invitation.roleName },
    })

    await prisma.$transaction(async (tx) => {
      const membership = await tx.companyMembership.upsert({
        where: { userId_companyId: { userId: user.id, companyId: invitation.companyId } },
        update: { status: 'ACTIVE' },
        create: { userId: user.id, companyId: invitation.companyId, status: 'ACTIVE' },
      })
      if (role) {
        await tx.userRole.upsert({
          where: { membershipId_roleId: { membershipId: membership.id, roleId: role.id } },
          update: {},
          create: { membershipId: membership.id, roleId: role.id },
        })
      }
      await tx.companyInvitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      })
      await tx.auditLog.create({
        data: {
          companyId: invitation.companyId,
          actorId: user.id,
          action: 'membership.invitation_accepted',
          entity: 'CompanyMembership',
          entityId: membership.id,
          metadata: JSON.stringify({ email: invitation.email, role: invitation.roleName }),
        },
      })
    })

    recordSuccess(rateKey)
    invalidateSessionCache()

    // Auto-connexion uniquement pour un compte qui vient d'etre cree (l'identite
    // est prouvee par le choix du mot de passe). Un compte existant doit se
    // connecter normalement.
    if (isNewUser) {
      await createSessionForUser(user.id)
      return { ok: true as const, redirectTo: `/${invitation.company.slug}/dashboard` }
    }
    return { ok: true as const, requiresLogin: true, redirectTo: `/login` }
  })

export const revokeInvitation = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ companySlug: z.string().min(1), invitationId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const { user, company } = await requireCompanyAccess(data.companySlug, 'company.manage')
    const deleted = await prisma.companyInvitation.deleteMany({
      where: { id: data.invitationId, companyId: company.id, acceptedAt: null },
    })
    if (deleted.count > 0) {
      await prisma.auditLog.create({
        data: {
          companyId: company.id,
          actorId: user.id,
          action: 'membership.invitation_revoked',
          entity: 'CompanyInvitation',
          entityId: data.invitationId,
        },
      })
    }
    return { ok: true as const }
  })

// ---------------------------------------------------------------------------
// Reinitialisation de mot de passe par lien (chantier A)
// ---------------------------------------------------------------------------

export const createPasswordResetLink = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ companySlug: z.string().min(1), email: z.string().email() }))
  .handler(async ({ data }) => {
    const { user: requester, company } = await requireCompanyAccess(data.companySlug, 'company.manage')

    const email = data.email.toLowerCase().trim()
    const target = await prisma.user.findUnique({
      where: { email },
      include: { memberships: { where: { companyId: company.id, status: 'ACTIVE' } } },
    })
    if (!target || target.memberships.length === 0) {
      return { ok: false as const, message: 'Aucun membre actif avec cet email dans cette entreprise.' }
    }
    // Seul le proprietaire peut reinitialiser le mot de passe d'un proprietaire.
    if (target.isOwner && !requester.isOwner) {
      return { ok: false as const, message: 'Seul le proprietaire peut reinitialiser ce compte.' }
    }

    const token = createToken()
    await prisma.passwordResetToken.create({
      data: {
        userId: target.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + resetDurationMs),
        createdBy: requester.id,
      },
    })

    await prisma.auditLog.create({
      data: {
        companyId: company.id,
        actorId: requester.id,
        action: 'user.password_reset_link_created',
        entity: 'User',
        entityId: target.id,
        metadata: JSON.stringify({ email }),
      },
    })

    const resetPath = `/reset/${token}`
    const expiresInMinutes = Math.round(resetDurationMs / 60000)
    const baseUrl = appBaseUrl()

    const delivery = baseUrl
      ? await sendMail({
          to: target.email,
          ...passwordResetEmail({
            resetUrl: `${baseUrl}${resetPath}`,
            name: target.name,
            expiresInMinutes,
          }),
        })
      : null

    if (!baseUrl) {
      console.warn('createPasswordResetLink: APP_BASE_URL manquant, lien non envoye par email.')
    }

    return { ok: true as const, resetPath, expiresInMinutes, delivered: Boolean(delivery?.delivered) }
  })

export const getResetInfo = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ token: z.string().min(1) }))
  .handler(async ({ data }) => {
    // Anti-scan : borne les consultations de tokens par IP.
    const probe = throttle(`reset-info:ip:${clientIp()}`, 30, 5 * 60 * 1000)
    if (!probe.allowed) return { ok: false as const, message: 'Trop de requetes. Reessaie dans quelques minutes.' }

    const reset = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(data.token) },
      include: { user: true },
    })
    if (!reset || reset.usedAt || reset.expiresAt <= new Date()) {
      return { ok: false as const, message: 'Lien invalide, expire ou deja utilise.' }
    }
    return { ok: true as const, maskedEmail: maskEmail(reset.user.email) }
  })

export const resetPassword = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ token: z.string().min(1), password: z.string().min(1) }))
  .handler(async ({ data }) => {
    const rateKey = `reset:ip:${clientIp()}`
    const { blocked, retryAfterSeconds } = isBlocked(rateKey)
    if (blocked) {
      const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60))
      return { ok: false as const, message: `Trop de tentatives. Reessaie dans ${minutes} min.` }
    }

    if (data.password.length < minPasswordLength) {
      return { ok: false as const, message: `Mot de passe de ${minPasswordLength} caracteres minimum.` }
    }

    const reset = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(data.token) },
    })
    if (!reset || reset.usedAt || reset.expiresAt <= new Date()) {
      recordFailure(rateKey)
      return { ok: false as const, message: 'Lien invalide, expire ou deja utilise.' }
    }

    const passwordHash = await hashPassword(data.password)
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: reset.userId },
        data: { passwordHash, mustChangePassword: false },
      })
      await tx.passwordResetToken.update({
        where: { id: reset.id },
        data: { usedAt: new Date() },
      })
      // Toute session existante est revoquee : un eventuel voleur de session
      // est deconnecte en meme temps que le mot de passe change.
      await tx.session.deleteMany({ where: { userId: reset.userId } })
    })

    recordSuccess(rateKey)
    invalidateSessionCache()
    return { ok: true as const }
  })

// ---------------------------------------------------------------------------
// Compte : changement de mot de passe et sessions actives (chantier C)
// ---------------------------------------------------------------------------

export const changePassword = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(1),
  }))
  .handler(async ({ data }) => {
    const user = await requireUser()
    if (!(await verifyPassword(data.currentPassword, user.passwordHash))) {
      return { ok: false as const, message: 'Mot de passe actuel incorrect.' }
    }
    if (data.newPassword.length < minPasswordLength) {
      return { ok: false as const, message: `Mot de passe de ${minPasswordLength} caracteres minimum.` }
    }

    const tokenHash = currentTokenHash()
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash: await hashPassword(data.newPassword), mustChangePassword: false },
      })
      // Les autres sessions sont revoquees, la session courante reste valide.
      await tx.session.deleteMany({
        where: { userId: user.id, ...(tokenHash ? { tokenHash: { not: tokenHash } } : {}) },
      })
    })

    invalidateSessionCache()
    return { ok: true as const }
  })

export const listMySessions = createServerFn({ method: 'GET' }).handler(async () => {
  const user = await requireUser()
  const tokenHash = currentTokenHash()
  const sessions = await prisma.session.findMany({
    where: { userId: user.id, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  })
  return sessions.map((session) => ({
    id: session.id,
    createdAt: session.createdAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
    ip: session.ip,
    userAgent: session.userAgent,
    current: session.tokenHash === tokenHash,
  }))
})

export const revokeSession = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ sessionId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const user = await requireUser()
    await prisma.session.deleteMany({ where: { id: data.sessionId, userId: user.id } })
    invalidateSessionCache()
    return { ok: true as const }
  })

export const revokeOtherSessions = createServerFn({ method: 'POST' }).handler(async () => {
  const user = await requireUser()
  const tokenHash = currentTokenHash()
  await prisma.session.deleteMany({
    where: { userId: user.id, ...(tokenHash ? { tokenHash: { not: tokenHash } } : {}) },
  })
  invalidateSessionCache()
  return { ok: true as const }
})

// ---------------------------------------------------------------------------
// Double authentification TOTP (chantier C)
// ---------------------------------------------------------------------------

export const getSecurityOverview = createServerFn({ method: 'GET' }).handler(async () => {
  const user = await requireUser()
  return {
    totpEnabled: Boolean(user.totpEnabledAt),
    email: user.email,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
  }
})

export const startTotpSetup = createServerFn({ method: 'POST' }).handler(async () => {
  const user = await requireUser()
  if (user.totpEnabledAt) return { ok: false as const, message: 'La double authentification est deja active.' }

  const secret = generateTotpSecret()
  await prisma.user.update({ where: { id: user.id }, data: { totpSecret: secret, totpEnabledAt: null } })
  return { ok: true as const, secret, uri: totpUri(secret, user.email) }
})

export const confirmTotpSetup = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ code: z.string().min(1) }))
  .handler(async ({ data }) => {
    const user = await requireUser()
    if (!user.totpSecret) return { ok: false as const, message: 'Aucune configuration en cours.' }
    if (!verifyTotp(user.totpSecret, data.code)) {
      return { ok: false as const, message: 'Code invalide. Verifie l heure de ton telephone et reessaie.' }
    }
    await prisma.user.update({ where: { id: user.id }, data: { totpEnabledAt: new Date() } })
    return { ok: true as const }
  })

export const disableTotp = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ code: z.string().min(1) }))
  .handler(async ({ data }) => {
    const user = await requireUser()
    if (!user.totpSecret || !user.totpEnabledAt) {
      return { ok: false as const, message: 'La double authentification n est pas active.' }
    }
    if (!verifyTotp(user.totpSecret, data.code)) {
      return { ok: false as const, message: 'Code invalide.' }
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { totpSecret: null, totpEnabledAt: null },
    })
    return { ok: true as const }
  })
