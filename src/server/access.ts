import { createHash } from 'node:crypto'
import { getCookie } from '@tanstack/react-start/server'
import { prisma } from './db'

const sessionCookieName = 'erp_session'

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export async function requireCompanyAccess(companySlug: string, permission?: string) {
  const token = getCookie(sessionCookieName)
  if (!token) throw new Error('Authentication required')

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      user: {
        include: {
          memberships: {
            where: { status: 'ACTIVE' },
            include: {
              company: true,
              roles: {
                include: {
                  role: {
                    include: {
                      permissions: { include: { permission: true } },
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

  if (!session || session.expiresAt <= new Date()) {
    throw new Error('Authentication required')
  }

  const membership = session.user.memberships.find((item) => item.company.slug === companySlug)
  if (!membership) throw new Error('Company access denied')

  const permissions = new Set(
    membership.roles.flatMap((userRole) =>
      userRole.role.permissions.map((rolePermission) => rolePermission.permission.key),
    ),
  )
  if (permission && !session.user.isOwner && !permissions.has(permission)) {
    throw new Error('Permission denied')
  }

  return {
    user: session.user,
    company: membership.company,
    permissions,
  }
}
