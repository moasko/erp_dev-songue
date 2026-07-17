// Calcul des totaux d'un document commercial (devis, facture) avec TVA par ligne.
//
// La MEME fonction sert a la creation (serveur), a l'apercu du formulaire et a
// l'impression : le total stocke en base et les montants affiches sur le
// document sont donc toujours issus du meme algorithme et se reconcilient.
//
// Cas particulier voulu : quand toutes les lignes partagent le meme taux, la
// base du groupe est exactement le net apres remise et la TVA vaut
// round(net * taux) — identique a l'ancien calcul mono-taux, donc les documents
// existants restent coherents.

export type DocumentLineInput = {
  quantity: number
  unitPrice: number
  // null/undefined = la ligne suit le taux par defaut du document
  vatRate?: number | null
}

export type VatGroup = {
  rate: number
  base: number // net HT apres remise, part de ce taux
  tax: number
}

export type DocumentTotals = {
  subtotal: number // total HT avant remise
  discount: number
  taxable: number // net HT apres remise
  vatGroups: VatGroup[] // tries par taux croissant ; seuls les groupes avec base > 0
  taxTotal: number
  total: number // TTC
}

export function lineTotal(line: DocumentLineInput): number {
  return Math.round(line.quantity * line.unitPrice)
}

export function computeDocumentTotals(
  lines: DocumentLineInput[],
  discountRate: number,
  defaultVatRate: number = 0,
): DocumentTotals {
  const subtotal = lines.reduce((sum, line) => sum + lineTotal(line), 0)
  const discount = Math.round(subtotal * (discountRate / 100))
  const taxable = Math.max(0, subtotal - discount)

  // Montant HT brut par taux effectif.
  const grossByRate = new Map<number, number>()
  for (const line of lines) {
    const rate = line.vatRate ?? defaultVatRate
    grossByRate.set(rate, (grossByRate.get(rate) ?? 0) + lineTotal(line))
  }

  // La remise est repartie au prorata de chaque groupe, puis l'ecart d'arrondi
  // residuel est impute au groupe le plus gros : la somme des bases vaut
  // exactement le net apres remise (le document se reconcilie ligne a ligne).
  const rates = Array.from(grossByRate.keys()).sort((a, b) => a - b)
  const bases = rates.map((rate) => {
    const gross = grossByRate.get(rate) ?? 0
    return subtotal === 0 ? 0 : Math.round((gross * taxable) / subtotal)
  })
  const roundingGap = taxable - bases.reduce((sum, base) => sum + base, 0)
  if (roundingGap !== 0 && bases.length > 0) {
    const largestIndex = bases.indexOf(Math.max(...bases))
    bases[largestIndex] += roundingGap
  }

  const vatGroups: VatGroup[] = rates
    .map((rate, index) => ({
      rate,
      base: bases[index],
      tax: Math.round(bases[index] * (rate / 100)),
    }))
    .filter((group) => group.base > 0)

  const taxTotal = vatGroups.reduce((sum, group) => sum + group.tax, 0)

  return {
    subtotal,
    discount,
    taxable,
    vatGroups,
    taxTotal,
    total: taxable + taxTotal,
  }
}
