import { Image as ImageIcon, Loader2, Upload, X } from 'lucide-react'
import * as React from 'react'
import { createImageUploadUrl, getStorageState } from '~/server/storage'
import type { UploadKind } from '~/server/storage'

// Champ image : televerse le fichier directement vers R2 via une URL presignee,
// puis stocke l'URL publique. Si R2 n'est pas configure, le champ retombe sur la
// saisie manuelle d'une URL — le formulaire reste utilisable partout.

type StorageState = { enabled: boolean; maxUploadBytes: number }

// L'etat du stockage ne change pas pendant une session : une seule requete,
// partagee par tous les champs de la page.
let storageStatePromise: Promise<StorageState> | null = null

function loadStorageState() {
  if (!storageStatePromise) {
    storageStatePromise = getStorageState().catch(() => ({ enabled: false, maxUploadBytes: 0 }))
  }
  return storageStatePromise
}

const acceptedTypes = 'image/jpeg,image/png,image/webp,image/gif,image/avif'

export function ImageUploadField({
  label,
  companySlug,
  kind,
  hint,
  value,
  onChange,
  name,
  defaultValue,
}: {
  label: string
  companySlug: string
  kind: UploadKind
  hint?: string
  // Mode controle (formulaires a etat local).
  value?: string
  onChange?: (value: string) => void
  // Mode non controle (formulaires lus via FormData).
  name?: string
  defaultValue?: string
}) {
  const [internalValue, setInternalValue] = React.useState(defaultValue ?? '')
  const [storage, setStorage] = React.useState<StorageState | null>(null)
  const [isUploading, setIsUploading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const currentValue = value !== undefined ? value : internalValue

  React.useEffect(() => {
    let active = true
    void loadStorageState().then((state) => {
      if (active) setStorage(state)
    })
    return () => {
      active = false
    }
  }, [])

  function update(next: string) {
    setInternalValue(next)
    onChange?.(next)
  }

  async function uploadFile(file: File) {
    setError(null)

    // Verification cote client pour un retour immediat ; le serveur revalide de
    // toute facon avant de signer quoi que ce soit.
    if (storage && file.size > storage.maxUploadBytes) {
      setError(`Image trop lourde (max ${Math.floor(storage.maxUploadBytes / (1024 * 1024))} Mo).`)
      return
    }

    setIsUploading(true)
    try {
      const signed = await createImageUploadUrl({
        data: { companySlug, kind, contentType: file.type, size: file.size },
      })

      if (!signed.ok) {
        setError(signed.message)
        return
      }

      // Le Content-Type est signe : il doit correspondre exactement a celui
      // annonce au serveur, sinon R2 rejette la requete.
      const response = await fetch(signed.uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': signed.contentType },
      })

      if (!response.ok) {
        setError("L'envoi de l'image a echoue. Reessaie.")
        return
      }

      update(signed.publicUrl)
    } catch {
      setError("L'envoi de l'image a echoue. Verifie ta connexion.")
    } finally {
      setIsUploading(false)
      // Permet de re-selectionner le meme fichier apres un echec.
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  // R2 non configure : on n'affiche pas un bouton qui ne peut pas fonctionner.
  if (storage && !storage.enabled) {
    return (
      <label className="block">
        <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-400">{label}</span>
        <input
          name={name}
          value={currentValue}
          onChange={(event) => update(event.target.value)}
          placeholder="https://..."
          className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-slate-950"
        />
        <span className="mt-1 block text-xs text-slate-400">
          Colle l'adresse d'une image. L'upload de fichiers n'est pas configure sur ce serveur.
        </span>
      </label>
    )
  }

  return (
    <div className="block">
      <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-400">{label}</span>
      {name ? <input type="hidden" name={name} value={currentValue} /> : null}

      <div className="flex items-start gap-3">
        <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded border border-slate-200 bg-slate-50">
          {currentValue ? (
            <img src={currentValue} alt="" className="size-full object-contain" />
          ) : (
            <ImageIcon className="size-6 text-slate-300" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <input
            ref={inputRef}
            type="file"
            accept={acceptedTypes}
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void uploadFile(file)
            }}
          />

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={isUploading || !storage}
              className="inline-flex items-center gap-2 rounded border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isUploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              {isUploading ? 'Envoi...' : currentValue ? 'Remplacer' : 'Choisir une image'}
            </button>
            {currentValue && !isUploading ? (
              <button
                type="button"
                onClick={() => update('')}
                className="inline-flex items-center gap-2 rounded border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <X className="size-4" />
                Retirer
              </button>
            ) : null}
          </div>

          {error ? (
            <p role="alert" className="mt-1.5 text-xs font-semibold text-red-600">
              {error}
            </p>
          ) : (
            <p className="mt-1.5 text-xs text-slate-400">{hint ?? 'JPG, PNG, WEBP, GIF ou AVIF. 5 Mo maximum.'}</p>
          )}
        </div>
      </div>
    </div>
  )
}
