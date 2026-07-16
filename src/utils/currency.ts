// Formatage monetaire. La devise n'est pas globale : chaque entreprise choisit la
// sienne a la creation (etape 2 de l'inscription) et la stocke dans `Company.currency`.
// Les composants passent donc toujours par `useMoney()` (voir ~/context/CompanyContext),
// qui lie ces fonctions a la devise de l'entreprise active.

export type CurrencyFormat = {
  // Symbole affiche apres le montant. Les francs CFA sont ecrits "FCFA" localement
  // plutot que "XOF"/"F CFA" comme le voudrait Intl.
  symbol: string
  // Les francs (CFA, guineen) n'ont pas de subdivision : afficher des centimes
  // n'aurait aucun sens.
  decimals: number
}

const currencyFormats: Record<string, CurrencyFormat> = {
  XOF: { symbol: 'FCFA', decimals: 0 },
  XAF: { symbol: 'FCFA', decimals: 0 },
  GNF: { symbol: 'FG', decimals: 0 },
  MGA: { symbol: 'Ar', decimals: 0 },
  CDF: { symbol: 'FC', decimals: 2 },
  GHS: { symbol: 'GH₵', decimals: 2 },
  NGN: { symbol: '₦', decimals: 2 },
  KES: { symbol: 'KSh', decimals: 2 },
  ZAR: { symbol: 'R', decimals: 2 },
  MAD: { symbol: 'DH', decimals: 2 },
  TND: { symbol: 'DT', decimals: 3 },
  DZD: { symbol: 'DA', decimals: 2 },
  EUR: { symbol: '€', decimals: 2 },
  USD: { symbol: '$', decimals: 2 },
  CAD: { symbol: '$ CA', decimals: 2 },
}

// Les entreprises creees avant que la devise soit configurable ont `currency = null`
// en base : elles gardent le comportement historique de l'application.
export const defaultCurrency = 'XOF'
export const defaultLocale = 'fr'

export type MoneyOptions = {
  currency?: string | null
  locale?: string | null
}

export function currencyFormat(currency?: string | null): CurrencyFormat {
  return currencyFormats[currency ?? ''] ?? currencyFormats[defaultCurrency]
}

export function currencySymbol(currency?: string | null) {
  return currencyFormat(currency).symbol
}

function intlLocale(locale?: string | null) {
  // `Company.locale` stocke une langue ("fr", "en"), pas une locale complete. On la
  // rattache a une region pour obtenir les separateurs attendus (espace insecable
  // et virgule en francais, virgule et point en anglais).
  return locale === 'en' ? 'en-GB' : 'fr-FR'
}

export function formatMoney(value: number, options: MoneyOptions = {}) {
  const { symbol, decimals } = currencyFormat(options.currency)
  const amount = value.toLocaleString(intlLocale(options.locale), {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
  return `${amount} ${symbol}`
}

export function formatSignedMoney(value: number, sign: '+' | '-' = '+', options: MoneyOptions = {}) {
  return `${sign}${formatMoney(value, options)}`
}
