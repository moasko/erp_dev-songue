import { Building2 } from 'lucide-react'
import { useMoney } from '~/context/CompanyContext'
import { amountInWords } from '~/utils/amountInWords'
import { computeDocumentTotals } from '~/utils/documentTotals'

// Rendu imprimable d'un document commercial (devis ou facture de vente).
// Meme gabarit pour les deux : en-tete legal du vendeur, lignes, ventilation
// HT / TVA / TTC (par taux si plusieurs), total en toutes lettres exige pour
// qu'un document soit opposable, conditions et pied de page.

export type PrintableLine = {
  id: string
  description: string
  quantity: number
  unitPrice: number
  totalCents: number
  vatRate?: number | null
}

export type PrintableDocument = {
  reference: string
  title?: string | null
  issueDate: string | Date
  // Devis : date de validite. Facture : date d'echeance.
  deadline?: string | Date | null
  customer?: { name: string; email?: string | null; phone?: string | null } | null
  lines: PrintableLine[]
  discountRate: number
  taxRate: number
  notes?: string | null
  terms?: string | null
  // Facture uniquement : montant deja regle, pour afficher le reste a payer.
  paidCents?: number
}

export type DocumentSettings = {
  logoUrl?: string | null
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

export function DocumentPrint({
  kind,
  doc,
  settings,
  companyName,
}: {
  kind: 'quote' | 'invoice'
  doc: PrintableDocument
  settings: DocumentSettings
  companyName: string
}) {
  const { formatMoney, currency } = useMoney()
  const isInvoice = kind === 'invoice'

  const totals = computeDocumentTotals(doc.lines, doc.discountRate, doc.taxRate)
  const showVatColumn = totals.vatGroups.length > 1
  const paid = doc.paidCents ?? 0
  const remaining = Math.max(0, totals.total - paid)

  const accent = settings.accentColor || '#0a1728'
  const legalLines = [
    settings.taxId ? `NCC/IFU : ${settings.taxId}` : null,
    settings.rccm ? `RCCM : ${settings.rccm}` : null,
    settings.capital ? `Capital : ${settings.capital}` : null,
    settings.taxRegime ? `Regime : ${settings.taxRegime}` : null,
  ].filter(Boolean) as string[]

  return (
    <div className="quote-print-area overflow-hidden bg-white text-slate-950" style={{ borderTop: `4px solid ${accent}` }}>
      {/* Le padding et les colonnes reduits ne concernent que les petits ecrans :
          une page A4 imprimee fait ~794px, les variantes sm: s'y appliquent. */}
      <div className="px-4 py-5 text-[13px] leading-relaxed sm:px-8 sm:py-7">
        {/* En-tete : identite vendeur a gauche, intitule du document a droite */}
        <div className="doc-keep flex flex-wrap items-start justify-between gap-4 sm:gap-8">
          <div className="min-w-0">
            {settings.logoUrl ? (
              <img src={settings.logoUrl} alt="" className="mb-3 h-14 max-w-44 object-contain" />
            ) : (
              <Building2 className="mb-3 size-9 text-slate-300" />
            )}
            <p className="text-base font-bold text-slate-950">{settings.legalName || companyName}</p>
            {settings.address ? <p className="mt-1 whitespace-pre-line text-xs leading-5 text-slate-600">{settings.address}</p> : null}
            <p className="mt-1 text-xs text-slate-600">{[settings.phone, settings.email].filter(Boolean).join('  ·  ')}</p>
            {legalLines.length ? (
              <p className="mt-1 text-[11px] leading-4 text-slate-500">{legalLines.join('  ·  ')}</p>
            ) : null}
          </div>
          <div className="shrink-0 text-right">
            <p className="text-2xl font-black uppercase tracking-tight" style={{ color: accent }}>
              {isInvoice ? 'Facture' : 'Devis'}
            </p>
            <p className="mt-1 font-mono text-sm font-bold text-slate-700">N° {doc.reference}</p>
            <div className="mt-3 text-xs text-slate-600">
              <p>Date d'emission : <span className="font-semibold text-slate-900">{formatDate(doc.issueDate)}</span></p>
              {doc.deadline ? (
                <p>{isInvoice ? 'Echeance :' : "Valable jusqu'au :"} <span className="font-semibold text-slate-900">{formatDate(doc.deadline)}</span></p>
              ) : null}
            </div>
          </div>
        </div>

        {/* Client + objet */}
        <div className="doc-keep mt-7 grid grid-cols-1 gap-4 rounded border border-slate-200 p-4 sm:grid-cols-2 sm:gap-6">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Destinataire</p>
            <p className="mt-1 font-bold text-slate-950">{doc.customer?.name ?? 'Client comptant'}</p>
            {doc.customer?.email ? <p className="text-xs text-slate-600">{doc.customer.email}</p> : null}
            {doc.customer?.phone ? <p className="text-xs text-slate-600">{doc.customer.phone}</p> : null}
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Objet</p>
            <p className="mt-1 font-semibold text-slate-950">{doc.title || (isInvoice ? 'Facture de vente' : 'Proposition commerciale')}</p>
          </div>
        </div>

        {/* Lignes. Le conteneur scrolle horizontalement sur petit ecran plutot
            que de couper les montants ; a l'impression tout tient en largeur. */}
        <div className="mt-6 overflow-x-auto">
        <table className="w-full border-collapse text-left text-[13px]">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-white" style={{ backgroundColor: accent }}>
              <th className="px-3 py-2 font-semibold">Designation</th>
              <th className="px-3 py-2 text-right font-semibold">Qte</th>
              <th className="px-3 py-2 text-right font-semibold">P.U. HT</th>
              {showVatColumn ? <th className="px-3 py-2 text-right font-semibold">TVA</th> : null}
              <th className="px-3 py-2 text-right font-semibold">Montant HT</th>
            </tr>
          </thead>
          <tbody>
            {doc.lines.map((line, index) => (
              <tr key={line.id} className={index % 2 ? 'bg-slate-50' : ''}>
                <td className="border-b border-slate-100 px-3 py-2.5 font-medium text-slate-900">{line.description}</td>
                <td className="border-b border-slate-100 px-3 py-2.5 text-right text-slate-700">{line.quantity}</td>
                <td className="border-b border-slate-100 px-3 py-2.5 text-right text-slate-700">{formatMoney(line.unitPrice)}</td>
                {showVatColumn ? (
                  <td className="border-b border-slate-100 px-3 py-2.5 text-right text-slate-700">{line.vatRate ?? doc.taxRate}%</td>
                ) : null}
                <td className="border-b border-slate-100 px-3 py-2.5 text-right font-semibold text-slate-950">{formatMoney(line.totalCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>

        {/* Ventilation par taux quand le document en melange plusieurs */}
        {showVatColumn ? (
          <div className="doc-keep mt-5">
            <table className="w-full max-w-sm border-collapse text-[12px]">
              <thead>
                <tr className="border-b border-slate-200 text-[10px] uppercase tracking-widest text-slate-400">
                  <th className="py-1.5 text-left font-bold">Taux TVA</th>
                  <th className="py-1.5 text-right font-bold">Base HT</th>
                  <th className="py-1.5 text-right font-bold">Montant TVA</th>
                </tr>
              </thead>
              <tbody>
                {totals.vatGroups.map((group) => (
                  <tr key={group.rate}>
                    <td className="py-1 text-slate-600">{group.rate}%</td>
                    <td className="py-1 text-right text-slate-700">{formatMoney(group.base)}</td>
                    <td className="py-1 text-right text-slate-700">{formatMoney(group.tax)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {/* Totaux */}
        <div className="doc-keep mt-5 flex justify-end">
          <table className="w-full max-w-xs text-[13px]">
            <tbody>
              <tr>
                <td className="py-1.5 text-slate-600">Total HT</td>
                <td className="py-1.5 text-right font-semibold text-slate-900">{formatMoney(totals.subtotal)}</td>
              </tr>
              {totals.discount > 0 ? (
                <tr>
                  <td className="py-1.5 text-slate-600">Remise ({doc.discountRate}%)</td>
                  <td className="py-1.5 text-right font-semibold text-slate-900">- {formatMoney(totals.discount)}</td>
                </tr>
              ) : null}
              <tr>
                <td className="py-1.5 text-slate-600">
                  TVA{!showVatColumn && totals.vatGroups.length === 1 ? ` (${totals.vatGroups[0].rate}%)` : ''}
                </td>
                <td className="py-1.5 text-right font-semibold text-slate-900">{formatMoney(totals.taxTotal)}</td>
              </tr>
              <tr>
                <td className="border-t-2 pt-2 text-sm font-bold text-slate-950" style={{ borderColor: accent }}>Total TTC</td>
                <td className="border-t-2 pt-2 text-right text-sm font-black text-slate-950" style={{ borderColor: accent }}>{formatMoney(totals.total)}</td>
              </tr>
              {isInvoice && paid > 0 ? (
                <>
                  <tr>
                    <td className="py-1.5 text-slate-600">Deja regle</td>
                    <td className="py-1.5 text-right font-semibold text-slate-900">- {formatMoney(Math.min(paid, totals.total))}</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 font-bold text-slate-950">Reste a payer</td>
                    <td className="py-1.5 text-right font-black text-slate-950">{formatMoney(remaining)}</td>
                  </tr>
                </>
              ) : null}
            </tbody>
          </table>
        </div>

        {/* Montant en toutes lettres */}
        <div className="doc-keep mt-5 rounded border border-slate-200 bg-slate-50 px-4 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            {isInvoice ? 'Arrete la presente facture a la somme de' : 'Arrete le present devis a la somme de'}
          </p>
          <p className="mt-0.5 text-sm font-semibold text-slate-900">{amountInWords(totals.total, currency)}</p>
        </div>

        {doc.notes ? (
          <div className="doc-keep mt-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Note</p>
            <p className="mt-1 whitespace-pre-line text-xs text-slate-600">{doc.notes}</p>
          </div>
        ) : null}

        <div className="doc-keep mt-5 border-t border-slate-200 pt-4 text-[11px] leading-5 text-slate-500">
          <p className="font-semibold text-slate-600">Conditions</p>
          <p className="mt-0.5 whitespace-pre-line">{doc.terms || settings.paymentTerms}</p>
          {settings.footerNote ? <p className="mt-2 italic">{settings.footerNote}</p> : null}
          <p className="mt-3 text-[10px] text-slate-400">
            {isInvoice
              ? 'Facture etablie et payable selon les conditions ci-dessus. Document genere par Icomgest.'
              : 'Ce devis ne constitue pas une facture. Document genere par Icomgest.'}
          </p>
        </div>
      </div>
    </div>
  )
}

function formatDate(value: string | Date) {
  return new Date(value).toLocaleDateString('fr-FR')
}
