import { randomUUID } from 'node:crypto'
import { createServerFn } from '@tanstack/react-start'
import { AwsClient } from 'aws4fetch'
import { z } from 'zod'
import { requireCompanyAccess } from './access'

// Stockage des images sur Cloudflare R2 (API compatible S3).
//
// Le navigateur televerse directement vers R2 via une URL presignee : les octets
// ne transitent jamais par le serveur applicatif. Le serveur ne fait que signer,
// apres avoir verifie les droits, le type et la taille annonces.
//
// Sans configuration R2, `storageIsConfigured()` renvoie false et l'interface
// retombe sur la saisie manuelle d'une URL — comme mail.ts avec la console.

export type UploadKind = 'product' | 'logo'

const uploadKinds: Array<UploadKind> = ['product', 'logo']

// Pas de SVG : un SVG est un document capable d'embarquer du script, et il serait
// servi depuis le domaine public du bucket.
const allowedContentTypes: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
}

export const maxUploadBytes = 5 * 1024 * 1024

// L'URL presignee est a usage unique et immediat : quelques minutes suffisent.
const uploadUrlTtlSeconds = 300

type R2Config = {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
  publicBaseUrl: string
}

function readConfig(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  const bucket = process.env.R2_BUCKET
  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBaseUrl) return null

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    publicBaseUrl: publicBaseUrl.replace(/\/+$/, ''),
  }
}

export function storageIsConfigured() {
  return readConfig() !== null
}

// Indique a l'interface si l'upload est disponible, sans jamais exposer les cles.
export const getStorageState = createServerFn({ method: 'GET' }).handler(async () => {
  return { enabled: storageIsConfigured(), maxUploadBytes }
})

export const createImageUploadUrl = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      companySlug: z.string().min(1),
      kind: z.enum(uploadKinds as [UploadKind, ...Array<UploadKind>]),
      contentType: z.string().min(1),
      size: z.number().int().positive(),
    }),
  )
  .handler(async ({ data }) => {
    const config = readConfig()
    if (!config) return { ok: false as const, message: "L'upload d'images n'est pas configure." }

    // Televerser une image revient a ecrire dans l'entreprise : on exige le meme
    // droit que pour modifier son contenu.
    let access
    try {
      access = await requireCompanyAccess(data.companySlug)
    } catch {
      return { ok: false as const, message: 'Acces refuse.' }
    }

    const extension = allowedContentTypes[data.contentType]
    if (!extension) {
      return { ok: false as const, message: 'Format non supporte. Utilise JPG, PNG, WEBP, GIF ou AVIF.' }
    }
    if (data.size > maxUploadBytes) {
      return { ok: false as const, message: `Image trop lourde (max ${Math.floor(maxUploadBytes / (1024 * 1024))} Mo).` }
    }

    // La cle est derivee de l'entreprise et d'un UUID : une entreprise ne peut pas
    // ecrire sur les images d'une autre, et un nom de fichier fourni par le client
    // ne peut pas remonter l'arborescence.
    const key = `companies/${access.company.id}/${data.kind}/${randomUUID()}.${extension}`
    const url = new URL(`https://${config.accountId}.r2.cloudflarestorage.com/${config.bucket}/${key}`)

    // X-Amz-Expires fait partie de la chaine signee : il doit etre pose avant la
    // signature, sinon l'URL est rejetee (et aws4fetch retomberait sur 24 h).
    url.searchParams.set('X-Amz-Expires', String(uploadUrlTtlSeconds))

    const client = new AwsClient({
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      service: 's3',
      region: 'auto',
    })

    // `signQuery` met la signature dans l'URL : le navigateur n'a aucun en-tete
    // d'authentification a produire. `allHeaders` force la signature de
    // Content-Type (qu'aws4fetch ignore par defaut) : le PUT doit alors envoyer
    // exactement le type annonce ici, sinon R2 refuse. C'est ce qui empeche de
    // faire valider un JPEG puis de televerser un text/html a la place.
    const signed = await client.sign(url.toString(), {
      method: 'PUT',
      headers: { 'content-type': data.contentType },
      aws: { signQuery: true, allHeaders: true },
    })

    return {
      ok: true as const,
      uploadUrl: signed.url,
      publicUrl: `${config.publicBaseUrl}/${key}`,
      key,
      contentType: data.contentType,
    }
  })
