// Relance des factures impayees.
//
// Deux entrees : le bouton « Relancer les impayes » de la page Factures
// (server function) et, si un ordonnanceur externe est branche, un appel
// periodique. La logique vit ici pour etre identique dans les deux cas.

import { prisma } from './db'
import { sendMail } from './mail'
import { invoiceReminderEmail } from './documentEmail'

// Une relance tous les 3 jours au plus : relancer un client chaque nuit
// serait contre-productif.
const reminderCooldownMs = 3 * 24 * 60 * 60 * 1000

export type ReminderRun = {
  markedOverdue: number
  reminded: number
  // Factures echues sans email client : impossibles a relancer automatiquement.
  missingEmail: number
}

export async function processOverdueInvoices(companyId: string, actorId: string | null = null): Promise<ReminderRun> {
  const now = new Date()

  // 1. Toute facture envoyee dont l'echeance est depassee passe « en retard ».
  const marked = await prisma.salesInvoice.updateMany({
    where: {
      companyId,
      status: { in: ['Sent', 'PartiallyPaid'] },
      dueDate: { lt: now },
    },
    data: { status: 'Overdue' },
  })

  // 2. Relance par email des factures en retard non soldees.
  const [company, settings, candidates] = await Promise.all([
    prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true, currency: true, locale: true },
    }),
    prisma.quoteSettings.findUnique({ where: { companyId } }),
    prisma.salesInvoice.findMany({
      where: { companyId, status: 'Overdue' },
      include: { customer: { select: { name: true, email: true } } },
    }),
  ])
  if (!company) return { markedOverdue: marked.count, reminded: 0, missingEmail: 0 }

  let reminded = 0
  let missingEmail = 0

  for (const invoice of candidates) {
    const remaining = invoice.totalCents - invoice.paidCents
    if (remaining <= 0) continue
    if (invoice.lastReminderAt && now.getTime() - invoice.lastReminderAt.getTime() < reminderCooldownMs) continue
    if (!invoice.customer?.email) {
      missingEmail += 1
      continue
    }

    const message = invoiceReminderEmail({
      reference: invoice.number,
      customerName: invoice.customer.name,
      sellerName: settings?.legalName || company.name,
      dueDate: invoice.dueDate,
      remaining,
      currency: company.currency,
      locale: company.locale,
      sellerPhone: settings?.phone,
      sellerEmail: settings?.email,
    })
    const result = await sendMail({ to: invoice.customer.email, ...message })
    if (!result.ok) continue

    await prisma.salesInvoice.update({
      where: { id: invoice.id },
      data: { lastReminderAt: now },
    })
    await prisma.auditLog.create({
      data: {
        companyId,
        actorId,
        action: 'invoice.reminder_sent',
        entity: 'SalesInvoice',
        entityId: invoice.id,
        metadata: JSON.stringify({ number: invoice.number, remaining, to: invoice.customer.email }),
      },
    })
    reminded += 1
  }

  return { markedOverdue: marked.count, reminded, missingEmail }
}
