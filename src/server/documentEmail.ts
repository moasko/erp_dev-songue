// Rendu HTML d'un document commercial (devis / facture) pour envoi par email.
//
// Le PDF n'est pas genere cote serveur (pas de navigateur headless embarque) :
// le client recoit le document en HTML fidele au modele imprime — memes
// mentions legales, meme ventilation HT/TVA/TTC, meme total en lettres — avec
// des styles inline comme l'exigent les clients mail.

import { amountInWords } from '~/utils/amountInWords'
import { computeDocumentTotals } from '~/utils/documentTotals'
import { formatMoney } from '~/utils/currency'
import type { MailMessage } from './mail'

export type EmailDocumentLine = {
  description: string
  quantity: number
  unitPrice: number
  totalCents: number
  vatRate?: number | null
}

export type EmailDocument = {
  kind: 'quote' | 'invoice'
  reference: string
  title?: string | null
  issueDate: Date
  deadline?: Date | null
  customerName: string
  lines: EmailDocumentLine[]
  discountRate: number
  taxRate: number
  notes?: string | null
  terms?: string | null
  paidCents?: number
}

export type EmailSettings = {
  legalName?: string | null
  address?: string | null
  phone?: string | null
  email?: string | null
  taxId?: string | null
  rccm?: string | null
  capital?: string | null
  taxRegime?: string | null
  footerNote?: string | null
  paymentTerms?: string | null
  accentColor?: string | null
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatDate(value: Date) {
  return value.toLocaleDateString('fr-FR')
}

export function documentEmail(input: {
  doc: EmailDocument
  settings: EmailSettings
  companyName: string
  currency?: string | null
  locale?: string | null
}): Omit<MailMessage, 'to'> {
  const { doc, settings, companyName } = input
  const money = (value: number) => formatMoney(value, { currency: input.currency, locale: input.locale })
  const isInvoice = doc.kind === 'invoice'
  const docLabel = isInvoice ? 'Facture' : 'Devis'
  const sellerName = settings.legalName || companyName
  const accent = settings.accentColor || '#0a1728'

  const totals = computeDocumentTotals(doc.lines, doc.discountRate, doc.taxRate)
  const showVat = totals.vatGroups.length > 1
  const paid = Math.min(doc.paidCents ?? 0, totals.total)
  const remaining = totals.total - paid
  const inWords = amountInWords(totals.total, input.currency ?? 'XOF')

  const legalLines = [
    settings.taxId ? `NCC/IFU : ${settings.taxId}` : null,
    settings.rccm ? `RCCM : ${settings.rccm}` : null,
    settings.capital ? `Capital : ${settings.capital}` : null,
    settings.taxRegime ? `Regime : ${settings.taxRegime}` : null,
  ].filter(Boolean) as string[]

  const deadlineLabel = isInvoice ? 'Echeance' : 'Valable jusqu\'au'

  const subject = `${docLabel} ${doc.reference} — ${sellerName}`

  const text = [
    `Bonjour ${doc.customerName},`,
    '',
    isInvoice
      ? `Veuillez trouver ci-dessous la facture ${doc.reference} de ${sellerName}.`
      : `Veuillez trouver ci-dessous le devis ${doc.reference} de ${sellerName}.`,
    '',
    `Objet    : ${doc.title || docLabel}`,
    `Emission : ${formatDate(doc.issueDate)}`,
    ...(doc.deadline ? [`${deadlineLabel} : ${formatDate(doc.deadline)}`] : []),
    '',
    ...doc.lines.map((line) => `- ${line.description} x${line.quantity} : ${money(line.totalCents)}`),
    '',
    `Total HT  : ${money(totals.subtotal)}`,
    ...(totals.discount > 0 ? [`Remise (${doc.discountRate}%) : -${money(totals.discount)}`] : []),
    `TVA       : ${money(totals.taxTotal)}`,
    `Total TTC : ${money(totals.total)}`,
    ...(isInvoice && paid > 0 ? [`Deja regle : ${money(paid)}`, `Reste a payer : ${money(remaining)}`] : []),
    '',
    `Soit : ${inWords}`,
    '',
    doc.terms || settings.paymentTerms || '',
    '',
    sellerName,
    [settings.phone, settings.email].filter(Boolean).join(' - '),
  ].join('\n')

  const linesHtml = doc.lines.map((line, index) => `
    <tr style="background:${index % 2 ? '#f8fafc' : '#ffffff'}">
      <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;">${escapeHtml(line.description)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;text-align:right;">${line.quantity}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;text-align:right;">${escapeHtml(money(line.unitPrice))}</td>
      ${showVat ? `<td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;text-align:right;">${line.vatRate ?? doc.taxRate}%</td>` : ''}
      <td style="padding:8px 10px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:600;">${escapeHtml(money(line.totalCents))}</td>
    </tr>`).join('')

  const vatRecapHtml = showVat ? `
    <table style="border-collapse:collapse;font-size:12px;margin-top:14px;">
      <tr>
        <td style="padding:4px 14px 4px 0;color:#64748b;text-transform:uppercase;font-size:10px;">Taux TVA</td>
        <td style="padding:4px 14px 4px 0;color:#64748b;text-transform:uppercase;font-size:10px;">Base HT</td>
        <td style="padding:4px 0;color:#64748b;text-transform:uppercase;font-size:10px;">Montant TVA</td>
      </tr>
      ${totals.vatGroups.map((group) => `
      <tr>
        <td style="padding:2px 14px 2px 0;">${group.rate}%</td>
        <td style="padding:2px 14px 2px 0;text-align:right;">${escapeHtml(money(group.base))}</td>
        <td style="padding:2px 0;text-align:right;">${escapeHtml(money(group.tax))}</td>
      </tr>`).join('')}
    </table>` : ''

  const totalRow = (label: string, value: string, strong = false) => `
    <tr>
      <td style="padding:4px 0;color:${strong ? '#0f172a' : '#475569'};${strong ? 'font-weight:700;border-top:2px solid ' + accent + ';padding-top:8px;' : ''}">${label}</td>
      <td style="padding:4px 0;text-align:right;font-weight:${strong ? '800' : '600'};color:#0f172a;${strong ? 'border-top:2px solid ' + accent + ';padding-top:8px;' : ''}">${escapeHtml(value)}</td>
    </tr>`

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;max-width:640px;margin:0 auto;border:1px solid #e2e8f0;border-top:4px solid ${accent};">
    <div style="padding:28px 32px;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="vertical-align:top;">
            <p style="margin:0;font-size:16px;font-weight:700;">${escapeHtml(sellerName)}</p>
            ${settings.address ? `<p style="margin:4px 0 0;font-size:12px;color:#475569;white-space:pre-line;">${escapeHtml(settings.address)}</p>` : ''}
            <p style="margin:4px 0 0;font-size:12px;color:#475569;">${escapeHtml([settings.phone, settings.email].filter(Boolean).join('  ·  '))}</p>
            ${legalLines.length ? `<p style="margin:4px 0 0;font-size:11px;color:#64748b;">${escapeHtml(legalLines.join('  ·  '))}</p>` : ''}
          </td>
          <td style="vertical-align:top;text-align:right;">
            <p style="margin:0;font-size:22px;font-weight:900;text-transform:uppercase;color:${accent};">${docLabel}</p>
            <p style="margin:4px 0 0;font-family:monospace;font-size:13px;font-weight:700;color:#334155;">N° ${escapeHtml(doc.reference)}</p>
            <p style="margin:10px 0 0;font-size:12px;color:#475569;">Emission : <b>${formatDate(doc.issueDate)}</b></p>
            ${doc.deadline ? `<p style="margin:2px 0 0;font-size:12px;color:#475569;">${deadlineLabel} : <b>${formatDate(doc.deadline)}</b></p>` : ''}
          </td>
        </tr>
      </table>

      <table style="width:100%;border-collapse:collapse;margin-top:22px;border:1px solid #e2e8f0;">
        <tr>
          <td style="padding:12px 14px;vertical-align:top;width:50%;">
            <p style="margin:0;font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;font-weight:700;">Destinataire</p>
            <p style="margin:4px 0 0;font-weight:700;">${escapeHtml(doc.customerName)}</p>
          </td>
          <td style="padding:12px 14px;vertical-align:top;">
            <p style="margin:0;font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;font-weight:700;">Objet</p>
            <p style="margin:4px 0 0;font-weight:600;">${escapeHtml(doc.title || (isInvoice ? 'Facture de vente' : 'Proposition commerciale'))}</p>
          </td>
        </tr>
      </table>

      <table style="width:100%;border-collapse:collapse;margin-top:20px;font-size:13px;">
        <tr style="background:${accent};color:#ffffff;font-size:11px;text-transform:uppercase;">
          <th style="padding:8px 10px;text-align:left;">Designation</th>
          <th style="padding:8px 10px;text-align:right;">Qte</th>
          <th style="padding:8px 10px;text-align:right;">P.U. HT</th>
          ${showVat ? '<th style="padding:8px 10px;text-align:right;">TVA</th>' : ''}
          <th style="padding:8px 10px;text-align:right;">Montant HT</th>
        </tr>
        ${linesHtml}
      </table>

      ${vatRecapHtml}

      <table style="border-collapse:collapse;font-size:13px;margin-top:16px;margin-left:auto;min-width:260px;">
        ${totalRow('Total HT', money(totals.subtotal))}
        ${totals.discount > 0 ? totalRow(`Remise (${doc.discountRate}%)`, `- ${money(totals.discount)}`) : ''}
        ${totalRow(`TVA${!showVat && totals.vatGroups.length === 1 ? ` (${totals.vatGroups[0].rate}%)` : ''}`, money(totals.taxTotal))}
        ${totalRow('Total TTC', money(totals.total), true)}
        ${isInvoice && paid > 0 ? totalRow('Deja regle', `- ${money(paid)}`) + totalRow('Reste a payer', money(remaining), true) : ''}
      </table>

      <div style="margin-top:18px;padding:10px 14px;background:#f8fafc;border:1px solid #e2e8f0;">
        <p style="margin:0;font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#94a3b8;font-weight:700;">
          ${isInvoice ? 'Arrete la presente facture a la somme de' : 'Arrete le present devis a la somme de'}
        </p>
        <p style="margin:3px 0 0;font-size:13px;font-weight:600;">${escapeHtml(inWords)}</p>
      </div>

      ${doc.notes ? `<p style="margin:16px 0 0;font-size:12px;color:#475569;white-space:pre-line;"><b>Note :</b> ${escapeHtml(doc.notes)}</p>` : ''}

      <div style="margin-top:20px;border-top:1px solid #e2e8f0;padding-top:14px;font-size:11px;color:#64748b;">
        <p style="margin:0;font-weight:600;color:#475569;">Conditions</p>
        <p style="margin:3px 0 0;white-space:pre-line;">${escapeHtml(doc.terms || settings.paymentTerms || '')}</p>
        ${settings.footerNote ? `<p style="margin:10px 0 0;font-style:italic;">${escapeHtml(settings.footerNote)}</p>` : ''}
        <p style="margin:12px 0 0;font-size:10px;color:#94a3b8;">
          ${isInvoice ? 'Facture etablie et payable selon les conditions ci-dessus.' : 'Ce devis ne constitue pas une facture.'}
          Document genere par Icomgest.
        </p>
      </div>
    </div>
  </div>`

  return { subject, text, html }
}

// Email de relance pour une facture echue : plus court, il rappelle le montant
// restant du et l'echeance depassee, sans re-detailler toutes les lignes.
export function invoiceReminderEmail(input: {
  reference: string
  customerName: string
  sellerName: string
  dueDate: Date | null
  remaining: number
  currency?: string | null
  locale?: string | null
  sellerPhone?: string | null
  sellerEmail?: string | null
}): Omit<MailMessage, 'to'> {
  const money = (value: number) => formatMoney(value, { currency: input.currency, locale: input.locale })
  const dueText = input.dueDate ? ` arrivee a echeance le ${formatDate(input.dueDate)}` : ''

  return {
    subject: `Rappel — facture ${input.reference} en attente de paiement`,
    text: [
      `Bonjour ${input.customerName},`,
      '',
      `Sauf erreur de notre part, la facture ${input.reference}${dueText} reste en attente de paiement.`,
      '',
      `Montant restant du : ${money(input.remaining)}`,
      '',
      'Si votre reglement est deja parti, merci de ne pas tenir compte de ce message.',
      'Pour toute question, repondez simplement a cet email.',
      '',
      input.sellerName,
      [input.sellerPhone, input.sellerEmail].filter(Boolean).join(' - '),
    ].join('\n'),
  }
}
