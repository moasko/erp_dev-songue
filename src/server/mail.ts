// Envoi d'emails transactionnels.
//
// Aucun transport n'est installe par defaut : sans configuration, le message est
// ecrit dans la console du serveur (suffisant en dev, et l'inscription reste
// fonctionnelle). Pour envoyer reellement, il suffit de renseigner RESEND_API_KEY
// dans .env — l'API Resend est appelee en HTTP, sans dependance supplementaire.
// Un autre fournisseur se branche en ajoutant un cas dans `resolveTransport`.

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

type Transport = 'resend' | 'console'

function resolveTransport(): Transport {
  if (process.env.RESEND_API_KEY) return 'resend'
  return 'console'
}

export function mailIsConfigured() {
  return resolveTransport() !== 'console'
}

function fromAddress() {
  return process.env.MAIL_FROM || 'Gestion PME <onboarding@resend.dev>'
}

export async function sendMail(message: MailMessage): Promise<MailResult> {
  const transport = resolveTransport()

  if (transport === 'console') {
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

  try {
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
      `${input.inviterName} vous invite à rejoindre ${input.companyName} sur Gestion PME`,
      `en tant que « ${input.roleName} ».`,
      '',
      'Créez votre compte ici :',
      input.inviteUrl,
      '',
      'Ce lien expire dans 7 jours.',
      "Si vous n'attendiez pas cette invitation, ignorez ce message.",
      '',
      'Gestion PME',
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
      'Gestion PME',
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
      'Gestion PME',
    ].join('\n'),
  }
}
