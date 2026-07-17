// Montant en toutes lettres (francais), pour les documents fiscaux.
// Une facture opposable doit porter le total ecrit en lettres : c'est ce qui
// prime en cas de litige sur le montant chiffre.
//
// Regles francaises appliquees : "quatre-vingts" / "quatre-vingt-un",
// "cent" -> "cents" seulement au pluriel sans suivant, "mille" invariable,
// "million(s)"/"milliard(s)" variables. Trait d'union entre tous les mots
// (reforme de 1990, admise partout).

const units = [
  'zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf',
  'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize',
  'dix-sept', 'dix-huit', 'dix-neuf',
]

const tens = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', '', 'quatre-vingt', '']

// `beforeMille` : "cent" et "vingt" perdent leur s devant "mille" (adjectif
// numeral : deux-cent-mille, quatre-vingt-mille) mais le gardent devant
// million/milliard qui sont des noms (deux-cents-millions).
function threeDigitsToWords(n: number, beforeMille = false): string {
  if (n === 0) return ''
  const hundreds = Math.floor(n / 100)
  const rest = n % 100

  let out = ''
  if (hundreds > 0) {
    // "cent" prend un s au pluriel seulement s'il termine le groupe : deux-cents,
    // mais deux-cent-trois.
    out += hundreds === 1 ? 'cent' : `${units[hundreds]}-cent`
    if (hundreds > 1 && rest === 0 && !beforeMille) out += 's'
  }

  if (rest > 0) {
    if (out) out += '-'
    out += twoDigitsToWords(rest, beforeMille)
  }
  return out
}

function twoDigitsToWords(n: number, beforeMille = false): string {
  if (n < 20) return units[n]

  const t = Math.floor(n / 10)
  const u = n % 10

  // 70-79 et 90-99 : "soixante-dix", "quatre-vingt-dix", etc.
  if (t === 7 || t === 9) {
    const base = t === 7 ? 'soixante' : 'quatre-vingt'
    return `${base}-${units[10 + u]}`
  }

  let out = tens[t]
  if (u === 0) {
    // "quatre-vingts" prend un s seul (quatre-vingt-un n'en prend pas).
    if (t === 8 && !beforeMille) out += 's'
    return out
  }
  // "vingt-et-un", "trente-et-un"... mais "quatre-vingt-un" (pas de -et-).
  if (u === 1 && t !== 8) return `${out}-et-un`
  return `${out}-${units[u]}`
}

function integerToWords(n: number): string {
  if (n === 0) return 'zéro'

  const parts: string[] = []
  const scales: Array<{ value: number; singular: string; plural: string }> = [
    { value: 1_000_000_000, singular: 'milliard', plural: 'milliards' },
    { value: 1_000_000, singular: 'million', plural: 'millions' },
  ]

  let remainder = n
  for (const scale of scales) {
    const count = Math.floor(remainder / scale.value)
    if (count > 0) {
      // million/milliard sont des noms : ils s'accordent en nombre.
      parts.push(`${threeDigitsToWords(count)}-${count > 1 ? scale.plural : scale.singular}`)
      remainder %= scale.value
    }
  }

  const thousands = Math.floor(remainder / 1000)
  if (thousands > 0) {
    // "mille" est invariable, et "un mille" ne se dit pas : juste "mille".
    parts.push(thousands === 1 ? 'mille' : `${threeDigitsToWords(thousands, true)}-mille`)
    remainder %= 1000
  }

  if (remainder > 0) parts.push(threeDigitsToWords(remainder))

  return parts.join('-')
}

// Nom de la devise a la lettre. La subdivision (centimes) n'est ecrite que pour
// les devises qui en ont — le franc CFA n'a pas de centime.
const currencyWords: Record<string, { unit: string; unitPlural: string; sub?: string; subPlural?: string }> = {
  XOF: { unit: 'franc CFA', unitPlural: 'francs CFA' },
  XAF: { unit: 'franc CFA', unitPlural: 'francs CFA' },
  GNF: { unit: 'franc guinéen', unitPlural: 'francs guinéens' },
  MGA: { unit: 'ariary', unitPlural: 'ariary' },
  CDF: { unit: 'franc congolais', unitPlural: 'francs congolais', sub: 'centime', subPlural: 'centimes' },
  GHS: { unit: 'cedi', unitPlural: 'cedis', sub: 'pesewa', subPlural: 'pesewas' },
  NGN: { unit: 'naira', unitPlural: 'nairas', sub: 'kobo', subPlural: 'kobo' },
  KES: { unit: 'shilling', unitPlural: 'shillings', sub: 'cent', subPlural: 'cents' },
  ZAR: { unit: 'rand', unitPlural: 'rands', sub: 'cent', subPlural: 'cents' },
  MAD: { unit: 'dirham', unitPlural: 'dirhams', sub: 'centime', subPlural: 'centimes' },
  TND: { unit: 'dinar', unitPlural: 'dinars', sub: 'millime', subPlural: 'millimes' },
  DZD: { unit: 'dinar', unitPlural: 'dinars', sub: 'centime', subPlural: 'centimes' },
  EUR: { unit: 'euro', unitPlural: 'euros', sub: 'centime', subPlural: 'centimes' },
  USD: { unit: 'dollar', unitPlural: 'dollars', sub: 'cent', subPlural: 'cents' },
  CAD: { unit: 'dollar canadien', unitPlural: 'dollars canadiens', sub: 'cent', subPlural: 'cents' },
}

// Nombre de decimales de la devise, pour separer partie entiere et subdivision.
const currencyDecimals: Record<string, number> = {
  XOF: 0, XAF: 0, GNF: 0, MGA: 0,
  CDF: 2, GHS: 2, NGN: 2, KES: 2, ZAR: 2, MAD: 2, DZD: 2, EUR: 2, USD: 2, CAD: 2, TND: 3,
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

// `value` est exprime dans l'unite d'affichage (ex. 1500 => 1500 FCFA, ou 12.5 => 12,50 EUR).
export function amountInWords(value: number, currency: string | null | undefined = 'XOF'): string {
  const code = currency ?? 'XOF'
  const words = currencyWords[code] ?? currencyWords.XOF
  const decimals = currencyDecimals[code] ?? 0

  const rounded = Math.round(value * 10 ** decimals) / 10 ** decimals
  const integerPart = Math.floor(Math.abs(rounded))
  const fractionPart = Math.round((Math.abs(rounded) - integerPart) * 10 ** decimals)

  const sign = rounded < 0 ? 'moins ' : ''
  // "zéro franc" : le nom reste au singulier jusqu'a 1 inclus.
  let out = `${sign}${integerToWords(integerPart)} ${integerPart > 1 ? words.unitPlural : words.unit}`

  if (decimals > 0 && fractionPart > 0 && words.sub) {
    out += ` et ${integerToWords(fractionPart)} ${fractionPart === 1 ? words.sub : words.subPlural}`
  }

  return capitalize(out)
}
