// Referentiel partage par le formulaire de creation de boutique (etape 2) et par
// la validation cote serveur : les deux doivent accepter exactement les memes
// valeurs, donc la liste ne vit qu'ici.

export type CountryOption = {
  code: string
  name: string
  currency: string
  locale: string
}

export const countries: Array<CountryOption> = [
  { code: 'CI', name: "Côte d'Ivoire", currency: 'XOF', locale: 'fr' },
  { code: 'SN', name: 'Sénégal', currency: 'XOF', locale: 'fr' },
  { code: 'BJ', name: 'Bénin', currency: 'XOF', locale: 'fr' },
  { code: 'BF', name: 'Burkina Faso', currency: 'XOF', locale: 'fr' },
  { code: 'ML', name: 'Mali', currency: 'XOF', locale: 'fr' },
  { code: 'NE', name: 'Niger', currency: 'XOF', locale: 'fr' },
  { code: 'TG', name: 'Togo', currency: 'XOF', locale: 'fr' },
  { code: 'GW', name: 'Guinée-Bissau', currency: 'XOF', locale: 'fr' },
  { code: 'CM', name: 'Cameroun', currency: 'XAF', locale: 'fr' },
  { code: 'GA', name: 'Gabon', currency: 'XAF', locale: 'fr' },
  { code: 'CG', name: 'Congo', currency: 'XAF', locale: 'fr' },
  { code: 'TD', name: 'Tchad', currency: 'XAF', locale: 'fr' },
  { code: 'CF', name: 'Centrafrique', currency: 'XAF', locale: 'fr' },
  { code: 'GQ', name: 'Guinée équatoriale', currency: 'XAF', locale: 'fr' },
  { code: 'GN', name: 'Guinée', currency: 'GNF', locale: 'fr' },
  { code: 'MA', name: 'Maroc', currency: 'MAD', locale: 'fr' },
  { code: 'TN', name: 'Tunisie', currency: 'TND', locale: 'fr' },
  { code: 'DZ', name: 'Algérie', currency: 'DZD', locale: 'fr' },
  { code: 'CD', name: 'RD Congo', currency: 'CDF', locale: 'fr' },
  { code: 'MG', name: 'Madagascar', currency: 'MGA', locale: 'fr' },
  { code: 'GH', name: 'Ghana', currency: 'GHS', locale: 'en' },
  { code: 'NG', name: 'Nigeria', currency: 'NGN', locale: 'en' },
  { code: 'KE', name: 'Kenya', currency: 'KES', locale: 'en' },
  { code: 'ZA', name: 'Afrique du Sud', currency: 'ZAR', locale: 'en' },
  { code: 'FR', name: 'France', currency: 'EUR', locale: 'fr' },
  { code: 'BE', name: 'Belgique', currency: 'EUR', locale: 'fr' },
  { code: 'CA', name: 'Canada', currency: 'CAD', locale: 'fr' },
]

export type CurrencyOption = {
  code: string
  label: string
}

export const currencies: Array<CurrencyOption> = [
  { code: 'XOF', label: 'XOF — Franc CFA (BCEAO)' },
  { code: 'XAF', label: 'XAF — Franc CFA (BEAC)' },
  { code: 'GNF', label: 'GNF — Franc guinéen' },
  { code: 'GHS', label: 'GHS — Cedi ghanéen' },
  { code: 'NGN', label: 'NGN — Naira nigérian' },
  { code: 'KES', label: 'KES — Shilling kényan' },
  { code: 'ZAR', label: 'ZAR — Rand sud-africain' },
  { code: 'MAD', label: 'MAD — Dirham marocain' },
  { code: 'TND', label: 'TND — Dinar tunisien' },
  { code: 'DZD', label: 'DZD — Dinar algérien' },
  { code: 'CDF', label: 'CDF — Franc congolais' },
  { code: 'MGA', label: 'MGA — Ariary malgache' },
  { code: 'EUR', label: 'EUR — Euro' },
  { code: 'USD', label: 'USD — Dollar américain' },
  { code: 'CAD', label: 'CAD — Dollar canadien' },
]

export type LocaleOption = {
  code: string
  label: string
}

export const locales: Array<LocaleOption> = [
  { code: 'fr', label: 'Français' },
  { code: 'en', label: 'English' },
]

export const defaultCountry = 'CI'

export const countryCodes = countries.map((country) => country.code)
export const currencyCodes = currencies.map((currency) => currency.code)
export const localeCodes = locales.map((locale) => locale.code)

// Le domaine affiche a droite du champ sous-domaine. Cote client, la valeur est
// injectee par le serveur (les variables d'env ne sont pas lisibles au navigateur).
export const fallbackRootDomain = 'icomgest.cloud'

export function slugifySubdomain(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

// Sous-domaines qui ne doivent jamais etre attribues a une boutique : ils sont
// soit deja utilises par la plateforme, soit trop trompeurs pour un client.
const reservedSubdomains = new Set([
  'admin', 'api', 'app', 'assets', 'auth', 'billing', 'blog', 'cdn', 'dashboard',
  'dev', 'docs', 'files', 'ftp', 'help', 'localhost', 'mail', 'media', 'new',
  'onboarding', 'pay', 'register', 'root', 'shop', 'smtp', 'staging', 'static',
  'status', 'store', 'support', 'test', 'www',
])

export type SubdomainCheck = { ok: true } | { ok: false; message: string }

export function validateSubdomain(value: string): SubdomainCheck {
  if (value.length < 3) return { ok: false, message: 'Au moins 3 caractères.' }
  if (value.length > 40) return { ok: false, message: '40 caractères maximum.' }
  if (!/^[a-z0-9-]+$/.test(value)) return { ok: false, message: 'Lettres, chiffres et tirets uniquement.' }
  if (value.startsWith('-') || value.endsWith('-')) return { ok: false, message: 'Ne peut pas commencer ni finir par un tiret.' }
  if (reservedSubdomains.has(value)) return { ok: false, message: 'Ce sous-domaine est réservé.' }
  return { ok: true }
}
