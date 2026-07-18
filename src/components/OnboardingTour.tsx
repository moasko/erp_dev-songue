import * as React from 'react'
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Check,
  LayoutDashboard,
  Search,
  Settings,
  ShoppingCart,
  X,
} from 'lucide-react'

// Tour de bienvenue affiche a la premiere arrivee sur le tableau de bord (juste
// apres la creation de compte). Il surligne les vrais elements de l'interface via
// l'attribut `data-tour` ; si la cible est absente ou masquee (ex. sidebar cachee
// sur mobile), l'etape se recentre en carte simple. L'etat « deja vu » est garde
// dans localStorage. On peut le relancer via l'evenement `icomgest:start-tour`.

const STORAGE_KEY = 'icomgest.tour.v1.done'
export const TOUR_START_EVENT = 'icomgest:start-tour'

type Step = {
  target?: string
  title: string
  body: string
  icon: React.ComponentType<{ className?: string }>
}

const STEPS: Step[] = [
  {
    title: 'Bienvenue sur Icomgest 👋',
    body: "Votre boutique est prete. Voici un tour express — moins d'une minute — pour reperer l'essentiel. Vous pourrez le relancer a tout moment.",
    icon: LayoutDashboard,
  },
  {
    target: 'new-sale',
    title: 'Encaisser une vente',
    body: "Le bouton Nouvelle vente ouvre la caisse : choisissez des articles, encaissez, imprimez le ticket. C'est le cœur de votre activite au quotidien.",
    icon: ShoppingCart,
  },
  {
    target: 'sidebar-nav',
    title: 'Tout est range ici',
    body: 'Ventes, devis, factures, stock, achats, argent et clients : chaque univers a sa section dans le menu (icone ☰ en haut a gauche sur mobile).',
    icon: BarChart3,
  },
  {
    target: 'search',
    title: 'Retrouvez tout en un instant',
    body: 'La recherche trouve un produit, un client ou une facture sans naviguer dans les menus.',
    icon: Search,
  },
  {
    target: 'dashboard-metrics',
    title: 'Vos chiffres du jour',
    body: "Argent disponible, ventes, stock bas, clients a suivre : le tableau de bord donne le pouls de la boutique des la connexion.",
    icon: LayoutDashboard,
  },
  {
    target: 'settings',
    title: 'Reglez votre boutique',
    body: 'Logo, devise, taxes, informations legales : les Parametres personnalisent vos documents et vos calculs.',
    icon: Settings,
  },
  {
    title: "C'est parti ! 🚀",
    body: "Vous avez l'essentiel. Creez votre premier produit puis votre premiere vente. Pour revoir ce guide, cliquez sur « Revoir le guide » sur le tableau de bord.",
    icon: Check,
  },
]

const MARGIN = 12
const SPOT_PAD = 8

export function OnboardingTour() {
  const [active, setActive] = React.useState(false)
  const [index, setIndex] = React.useState(0)
  const [rect, setRect] = React.useState<DOMRect | null>(null)
  const [cardPos, setCardPos] = React.useState<{ top: number; left: number } | null>(null)
  const cardRef = React.useRef<HTMLDivElement>(null)
  const rafRef = React.useRef(0)

  const step = STEPS[index]
  const total = STEPS.length

  // Demarrage : premiere visite du tableau de bord, ou relance explicite.
  React.useEffect(() => {
    const start = () => {
      setIndex(0)
      setActive(true)
    }
    window.addEventListener(TOUR_START_EVENT, start)

    let timer = 0
    const alreadySeen = window.localStorage.getItem(STORAGE_KEY)
    const onDashboard = window.location.pathname.split('/').filter(Boolean)[1] === 'dashboard'
    if (!alreadySeen && onDashboard) {
      // Laisse la mise en page se stabiliser avant de mesurer les cibles.
      timer = window.setTimeout(start, 700)
    }

    return () => {
      window.removeEventListener(TOUR_START_EVENT, start)
      if (timer) window.clearTimeout(timer)
    }
  }, [])

  const updateRect = React.useCallback(() => {
    const selector = STEPS[index]?.target
    if (!selector) {
      setRect(null)
      return
    }
    const el = document.querySelector<HTMLElement>(`[data-tour="${selector}"]`)
    // getClientRects vide = element display:none (marche aussi pour position:fixed).
    if (!el || el.getClientRects().length === 0) {
      setRect(null)
      return
    }
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) {
      setRect(null)
      return
    }
    setRect(r)
  }, [index])

  // Recalcule la position de la cible au changement d'etape, au scroll et au resize.
  React.useLayoutEffect(() => {
    if (!active) return
    const el = STEPS[index]?.target
      ? document.querySelector<HTMLElement>(`[data-tour="${STEPS[index].target}"]`)
      : null
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })

    const schedule = () => {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(updateRect)
    }
    // Mesure synchrone : requestAnimationFrame est gele dans un onglet en
    // arriere-plan, on ne peut donc pas s'y fier pour la mesure initiale.
    updateRect()
    window.addEventListener('resize', schedule)
    window.addEventListener('scroll', schedule, true)
    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('resize', schedule)
      window.removeEventListener('scroll', schedule, true)
    }
  }, [active, index, updateRect])

  // Positionne la carte pres de la cible (a cote si elle est haute, sinon dessous
  // ou dessus), en la gardant dans l'ecran. Sans cible : carte centree.
  React.useLayoutEffect(() => {
    if (!active) return
    const card = cardRef.current
    if (!card) return
    if (!rect) {
      setCardPos(null)
      return
    }
    const cw = card.offsetWidth
    const ch = card.offsetHeight
    const vw = window.innerWidth
    const vh = window.innerHeight

    if (rect.height > vh * 0.6) {
      // Element haut (sidebar) : carte sur le cote.
      let left = rect.right + MARGIN
      if (left + cw > vw - MARGIN) left = Math.max(MARGIN, rect.left - cw - MARGIN)
      const top = Math.max(MARGIN, Math.min(vh / 2 - ch / 2, vh - ch - MARGIN))
      setCardPos({ top, left })
      return
    }

    let left = rect.left + rect.width / 2 - cw / 2
    left = Math.max(MARGIN, Math.min(left, vw - cw - MARGIN))
    let top = rect.bottom + MARGIN
    if (top + ch > vh - MARGIN) {
      const above = rect.top - ch - MARGIN
      top = above >= MARGIN ? above : Math.max(MARGIN, vh - ch - MARGIN)
    }
    setCardPos({ top, left })
  }, [active, index, rect])

  const close = React.useCallback((markSeen = true) => {
    if (markSeen) window.localStorage.setItem(STORAGE_KEY, '1')
    setActive(false)
  }, [])

  const goNext = React.useCallback(() => {
    setIndex((i) => {
      if (i >= total - 1) {
        close()
        return i
      }
      return i + 1
    })
  }, [close, total])

  const goPrev = React.useCallback(() => setIndex((i) => Math.max(0, i - 1)), [])

  // Clavier : Echap ferme, fleches naviguent.
  React.useEffect(() => {
    if (!active) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
      else if (event.key === 'ArrowRight' || event.key === 'Enter') goNext()
      else if (event.key === 'ArrowLeft') goPrev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, close, goNext, goPrev])

  if (!active || !step) return null

  const Icon = step.icon
  const isLast = index === total - 1

  return (
    <div role="dialog" aria-modal="true" aria-label="Guide de demarrage">
      {/* Capteur plein ecran : bloque l'interaction avec l'app. Le voile vient du
          box-shadow du spot quand une cible est surlignee, sinon de ce fond. */}
      <div
        aria-hidden
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 100,
          background: rect ? 'transparent' : 'rgba(2, 6, 23, 0.66)',
        }}
      />

      {rect ? (
        <div
          aria-hidden
          style={{
            position: 'fixed',
            top: rect.top - SPOT_PAD,
            left: rect.left - SPOT_PAD,
            width: rect.width + SPOT_PAD * 2,
            height: rect.height + SPOT_PAD * 2,
            borderRadius: 14,
            boxShadow: '0 0 0 9999px rgba(2, 6, 23, 0.66)',
            outline: '2px solid var(--app-accent)',
            outlineOffset: 2,
            transition: 'top 220ms cubic-bezier(0.32,0.72,0,1), left 220ms cubic-bezier(0.32,0.72,0,1), width 220ms, height 220ms',
            pointerEvents: 'none',
            zIndex: 101,
          }}
        />
      ) : null}

      <div
        style={
          cardPos
            ? { position: 'fixed', top: cardPos.top, left: cardPos.left, zIndex: 102 }
            : {
                position: 'fixed',
                inset: 0,
                zIndex: 102,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: MARGIN,
                pointerEvents: 'none',
              }
        }
      >
        <div
          ref={cardRef}
          className="neon-surface w-[min(360px,calc(100vw-1.5rem))] rounded-2xl p-5"
          style={{ pointerEvents: 'auto' }}
        >
          <div className="flex items-start gap-3">
            <span
              className="grid size-10 shrink-0 place-items-center rounded-xl"
              style={{ background: 'rgba(0, 254, 104, 0.14)', color: 'var(--app-accent)' }}
            >
              <Icon className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-bold text-slate-950">{step.title}</h2>
            </div>
            <button
              type="button"
              onClick={() => close()}
              aria-label="Fermer le guide"
              className="tap-scale -mr-1 -mt-1 grid size-8 shrink-0 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-950"
            >
              <X className="size-4" />
            </button>
          </div>

          <p className="mt-3 text-sm leading-6 text-slate-600">{step.body}</p>

          <div className="mt-5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5" aria-hidden>
              {STEPS.map((_, dot) => (
                <span
                  key={dot}
                  className="size-1.5 rounded-full transition-colors"
                  style={{
                    background:
                      dot === index ? 'var(--app-accent)' : 'color-mix(in srgb, var(--app-muted) 45%, transparent)',
                  }}
                />
              ))}
            </div>

            <div className="flex items-center gap-2">
              {index > 0 ? (
                <button
                  type="button"
                  onClick={goPrev}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950"
                >
                  <ArrowLeft className="size-4" />
                  Precedent
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => close()}
                  className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-semibold text-slate-500 transition-colors hover:text-slate-950"
                >
                  Passer
                </button>
              )}
              <button
                type="button"
                onClick={goNext}
                className="tap-scale inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-950 px-4 text-sm font-bold text-white transition-colors hover:bg-slate-800"
              >
                {isLast ? 'Terminer' : 'Suivant'}
                {isLast ? <Check className="size-4" /> : <ArrowRight className="size-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
