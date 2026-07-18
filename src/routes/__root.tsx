/// <reference types="vite/client" />
import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import * as React from 'react'
import { DefaultCatchBoundary } from '~/components/DefaultCatchBoundary'
import { NotFound } from '~/components/NotFound'
import appCss from '~/styles/app.css?url'
import { seo } from '~/utils/seo'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1, viewport-fit=cover',
      },
      { name: 'mobile-web-app-capable', content: 'yes' },
      { name: 'apple-mobile-web-app-capable', content: 'yes' },
      { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
      { name: 'theme-color', content: '#060e1a' },
      ...seo({
        title: 'Icomgest',
        description: 'Application web simple pour ventes, caisse, stock, clients et factures.',
      }),
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
      { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32x32.png' },
      { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/favicon-16x16.png' },
      { rel: 'manifest', href: '/site.webmanifest' },
      { rel: 'icon', href: '/favicon.ico' },
    ],
  }),
  errorComponent: DefaultCatchBoundary,
  notFoundComponent: () => <NotFound />,
  shellComponent: RootDocument,
})

// Charge les devtools uniquement en dev : le composant est retire du bundle
// de production (import dynamique elimine par import.meta.env.PROD).
const TanStackRouterDevtools = import.meta.env.PROD
  ? () => null
  : React.lazy(() =>
      import('@tanstack/react-router-devtools').then((module) => ({
        default: module.TanStackRouterDevtools,
      })),
    )

function RootDocument({ children }: { children: React.ReactNode }) {
  // Apres un redeploy, les chunks hashes changent de nom : un onglet deja ouvert
  // qui charge une route en lazy demande un ancien fichier qui n'existe plus (404)
  // -> "Failed to fetch dynamically imported module". Vite emet `vite:preloadError`
  // dans ce cas : on recharge une seule fois pour recuperer le HTML et les assets
  // frais (garde anti-boucle si le chunk manque toujours apres rechargement).
  React.useEffect(() => {
    function onPreloadError(event: Event) {
      const key = 'chunk-reload-at'
      const last = Number(sessionStorage.getItem(key) ?? 0)
      if (Date.now() - last < 10000) return
      sessionStorage.setItem(key, String(Date.now()))
      event.preventDefault()
      window.location.reload()
    }
    window.addEventListener('vite:preloadError', onPreloadError)
    return () => window.removeEventListener('vite:preloadError', onPreloadError)
  }, [])

  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <React.Suspense>
          <TanStackRouterDevtools position="bottom-right" />
        </React.Suspense>
        <Scripts />
      </body>
    </html>
  )
}
