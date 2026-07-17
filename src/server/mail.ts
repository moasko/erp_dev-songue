// Envoi d'emails transactionnels.
//
// Aucun transport n'est installe par defaut : sans configuration, le message est
// ecrit dans la console du serveur (suffisant en dev, et l'inscription reste
// fonctionnelle). Pour envoyer reellement, il suffit de renseigner une cle d'API
// dans .env :
//   - RESEND_API_KEY  -> Resend  (offre gratuite : 3 000 emails/mois, 100/jour)
//   - BREVO_API_KEY   -> Brevo   (offre gratuite : 300 emails/jour, ~9 000/mois)
// Les deux fournisseurs sont appeles en HTTP, sans dependance supplementaire.
// Resend est prioritaire si les deux cles sont presentes. Un autre fournisseur se
// branche en ajoutant un cas dans `resolveTransport` et une fonction d'envoi.

import { getRequestHeader } from '@tanstack/react-start/server'

export type MailMessage = {
  to: string
  subject: string
  text: string
  html?: string
}

export type MailResult = {
  ok: boolean
  // `true` quand aucun transport n'est configure : l'appelant peut alors afficher
  // le code directement dans l'interface pour ne pas bloquer le developpement.
  delivered: boolean
  message?: string
}

type Transport = 'resend' | 'brevo' | 'console'

function resolveTransport(): Transport {
  if (process.env.RESEND_API_KEY) return 'resend'
  if (process.env.BREVO_API_KEY) return 'brevo'
  return 'console'
}

export function mailIsConfigured() {
  return resolveTransport() !== 'console'
}

function fromAddress() {
  return process.env.MAIL_FROM || 'Icomgest <onboarding@resend.dev>'
}

// Decoupe "Nom <email@domaine>" en { name, email }. Resend accepte la chaine
// telle quelle, mais Brevo exige un expediteur structure.
function parseFrom(): { name?: string; email: string } {
  const raw = fromAddress()
  const match = raw.match(/^\s*(.*?)\s*<([^>]+)>\s*$/)
  if (match) return { name: match[1] || undefined, email: match[2].trim() }
  return { email: raw.trim() }
}

function logToConsole(message: MailMessage): MailResult {
  console.info(
    [
      '',
      '─── Email non envoye (aucun transport configure) ───',
      `A       : ${message.to}`,
      `Sujet   : ${message.subject}`,
      '',
      message.text,
      '───────────────────────────────────────────────────',
      '',
    ].join('\n'),
  )
  return { ok: true, delivered: false }
}

async function sendViaResend(message: MailMessage): Promise<MailResult> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromAddress(),
      to: [message.to],
      subject: message.subject,
      text: message.text,
      ...(message.html ? { html: message.html } : {}),
    }),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    console.error('sendMail: envoi refuse par Resend', response.status, detail)
    return { ok: false, delivered: false, message: "L'email n'a pas pu etre envoye." }
  }

  return { ok: true, delivered: true }
}

async function sendViaBrevo(message: MailMessage): Promise<MailResult> {
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': process.env.BREVO_API_KEY as string,
      'Content-Type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender: parseFrom(),
      to: [{ email: message.to }],
      subject: message.subject,
      textContent: message.text,
      ...(message.html ? { htmlContent: message.html } : {}),
    }),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    console.error('sendMail: envoi refuse par Brevo', response.status, detail)
    return { ok: false, delivered: false, message: "L'email n'a pas pu etre envoye." }
  }

  return { ok: true, delivered: true }
}

export async function sendMail(message: MailMessage): Promise<MailResult> {
  const transport = resolveTransport()

  if (transport === 'console') return logToConsole(message)

  try {
    return transport === 'brevo' ? await sendViaBrevo(message) : await sendViaResend(message)
  } catch (error) {
    console.error('sendMail: erreur reseau', error)
    return { ok: false, delivered: false, message: "L'email n'a pas pu etre envoye." }
  }
}

// Construit l'URL absolue d'un lien envoye par email.
//
// L'en-tete Host est fourni par le client : le deduire en production permettrait
// d'empoisonner un lien de reinitialisation (l'attaquant force un Host qui lui
// appartient, la victime clique, le token part chez lui). On l'accepte donc en
// developpement seulement ; en production APP_BASE_URL est obligatoire.
export function appBaseUrl(): string | null {
  const configured = process.env.APP_BASE_URL?.trim().replace(/\/+$/, '')
  if (configured) return configured
  if (process.env.NODE_ENV === 'production') return null

  const host = getRequestHeader('host')
  if (!host) return null
  return `http://${host}`
}

export function invitationEmail(input: {
  inviteUrl: string
  companyName: string
  roleName: string
  inviterName: string
}): Omit<MailMessage, 'to'> {
  return {
    subject: `${input.inviterName} vous invite à rejoindre ${input.companyName}`,
    text: [
      'Bonjour,',
      '',
      `${input.inviterName} vous invite à rejoindre ${input.companyName} sur Icomgest`,
      `en tant que « ${input.roleName} ».`,
      '',
      'Créez votre compte ici :',
      input.inviteUrl,
      '',
      'Ce lien expire dans 7 jours.',
      "Si vous n'attendiez pas cette invitation, ignorez ce message.",
      '',
      'Icomgest',
    ].join('\n'),
  }
}

export function passwordResetEmail(input: {
  resetUrl: string
  name: string
  expiresInMinutes: number
}): Omit<MailMessage, 'to'> {
  return {
    subject: 'Réinitialisation de votre mot de passe',
    text: [
      `Bonjour ${input.name},`,
      '',
      'Voici le lien pour définir un nouveau mot de passe :',
      input.resetUrl,
      '',
      `Ce lien expire dans ${input.expiresInMinutes} minutes et ne fonctionne qu'une fois.`,
      "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message :",
      "votre mot de passe actuel reste valable.",
      '',
      'Icomgest',
    ].join('\n'),
  }
}

export function verificationCodeEmail(input: { code: string; name: string }): Omit<MailMessage, 'to'> {
  return {
    subject: `${input.code} — votre code de verification`,
    text: [
      `Bonjour ${input.name},`,
      '',
      'Voici le code pour confirmer votre adresse email :',
      '',
      `    ${input.code}`,
      '',
      'Ce code expire dans 15 minutes.',
      "Si vous n'etes pas a l'origine de cette demande, ignorez ce message.",
      '',
      'Icomgest',
    ].join('\n'),
  }
}
