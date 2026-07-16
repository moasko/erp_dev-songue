import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

// TOTP (RFC 6238) sans dependance externe : compatible Google Authenticator,
// Aegis, 1Password, etc. SHA1 / 6 chiffres / periode 30 s (parametres standard).

const base32Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function base32Encode(buffer: Buffer) {
  let bits = 0
  let value = 0
  let output = ''
  for (const byte of buffer) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += base32Alphabet[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) output += base32Alphabet[(value << (5 - bits)) & 31]
  return output
}

function base32Decode(input: string) {
  let bits = 0
  let value = 0
  const bytes: number[] = []
  for (const char of input.replace(/=+$/, '').toUpperCase()) {
    const index = base32Alphabet.indexOf(char)
    if (index === -1) continue
    value = (value << 5) | index
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}

function hotp(secret: Buffer, counter: number) {
  const counterBuffer = Buffer.alloc(8)
  counterBuffer.writeBigUInt64BE(BigInt(counter))
  const digest = createHmac('sha1', secret).update(counterBuffer).digest()
  const offset = digest[digest.length - 1] & 0xf
  const code =
    ((digest[offset] & 0x7f) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3]
  return String(code % 1_000_000).padStart(6, '0')
}

export function generateTotpSecret() {
  return base32Encode(randomBytes(20))
}

export function verifyTotp(secret: string, code: string, windowSteps = 1) {
  const normalized = code.replace(/\s+/g, '')
  if (!/^\d{6}$/.test(normalized)) return false

  const secretBuffer = base32Decode(secret)
  const step = Math.floor(Date.now() / 1000 / 30)
  let valid = false
  // Fenetre de tolerance +/- 1 pas (30 s) pour absorber la derive d'horloge.
  for (let offset = -windowSteps; offset <= windowSteps; offset++) {
    const expected = hotp(secretBuffer, step + offset)
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(normalized))) valid = true
  }
  return valid
}

export function totpUri(secret: string, accountEmail: string, issuer = 'Icomgest') {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(accountEmail)}`
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`
}
