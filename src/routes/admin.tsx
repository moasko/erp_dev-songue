import { createFileRoute, Link, Outlet, redirect, useNavigate, useRouterState } from '@tanstack/react-router'
import {
  Activity,
  Building2,
  LayoutDashboard,
  LogOut,
  Moon,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sun,
  Users,
} from 'lucide-react'
import * as React from 'react'
import { logout } from '~/server/auth'
import { getPlatformAdminState } from '~/server/platformAdmin'

export const Route = createFileRoute('/admin')({
  beforeLoad: async ({ location }) => {
    const state = await getPlatformAdminState()
    if (!state.authenticated) {
      throw redirect({ to: '/login', search: { redirect: location.href } })
    }
    // Connecte mais pas super admin : on ne revele pas l'existence de l'espace,
    // on renvoie vers l'application normale (ou la connexion si aucune entreprise).
    if (!state.isSuperAdmin) {
      if (state.firstCompanySlug) {
        throw redirect({ to: '/$companySlug/dashboard', params: { companySlug: state.firstCompanySlug } })
      }
      throw redirect({ to: '/login', search: { redirect: undefined } })
    }
    return { admin: state.user }
  },
  component: AdminLayout,
})

const adminNav = [
  { to: '/admin', label: 'Vue globale', icon: LayoutDashboard, exact: true },
  { to: '/admin/companies', label: 'Entreprises', icon: Building2, exact: false },
  { to: '/admin/users', label: 'Utilisateurs', icon: Users, exact: false },
  { to: '/admin/roles', label: 'Roles & permissions', icon: ShieldCheck, exact: false },
  { to: '/admin/activity', label: 'Activite', icon: Activity, exact: false },
  { to: '/admin/settings', label: 'Parametres globaux', icon: Sliders, exact: false },
]

function AdminLayout() {
  const navigate = useNavigate()
  const context = Route.useRouteContext() as { admin?: { name: string; email: string } | null }
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const [theme, setTheme] = React.useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'dark'
    return window.localStorage.getItem('erp-theme') === 'light' ? 'light' : 'dark'
  })

  React.useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('theme-light', theme === 'light')
    root.classList.toggle('theme-dark', theme === 'dark')
    root.style.colorScheme = theme
    window.localStorage.setItem('erp-theme', theme)
  }, [theme])

  const admin = context.admin

  return (
    <div className="neon-grid min-h-screen text-slate-950">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[17rem] border-r border-slate-200 bg-white lg:flex lg:flex-col">
        <div className="flex items-center gap-2.5 border-b border-slate-200 px-4 py-3">
          <span className="flex size-9 items-center justify-center rounded bg-slate-950 text-white">
            <ShieldAlert className="size-5" />
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-bold text-slate-950">Super admin</span>
            <span className="truncate text-[10px] font-semibold uppercase tracking-wider text-slate-500">Console plateforme</span>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-3">
          <div className="space-y-1">
            {adminNav.map((item) => {
              const Icon = item.icon
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  activeOptions={{ exact: item.exact }}
                  className="flex items-center gap-2.5 rounded px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950"
                  activeProps={{ className: 'flex items-center gap-2.5 rounded px-3 py-2 text-sm font-bold bg-slate-100 text-slate-950' }}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                </Link>
              )
            })}
          </div>
        </nav>

        <div className="border-t border-slate-200 p-3">
          <button
            onClick={() => window.history.length > 1 ? window.history.back() : navigate({ to: '/' })}
            className="mb-1 flex w-full items-center gap-2.5 rounded px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950"
          >
            <LayoutDashboard className="size-4" />
            Retour a l'application
          </button>
          <button
            onClick={async () => {
              await logout()
              await navigate({ to: '/login', search: { redirect: undefined } })
            }}
            className="flex w-full items-center gap-2.5 rounded px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950"
          >
            <LogOut className="size-4" />
            Deconnexion
          </button>
        </div>
      </aside>

      <div className="lg:pl-[17rem]">
        <header className="app-header safe-top sticky top-0 z-10 border-b shadow-sm backdrop-blur-xl">
          <div className="flex h-14 items-center justify-between gap-2 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-2 lg:hidden">
              <span className="flex size-8 items-center justify-center rounded bg-slate-950 text-white">
                <ShieldAlert className="size-4" />
              </span>
              <span className="truncate text-sm font-bold text-slate-950">Super admin</span>
            </div>
            <div className="hidden items-center gap-2 lg:flex">
              <span className="rounded bg-slate-100 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-600">
                Console plateforme
              </span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
                className="inline-flex h-9 items-center gap-2 rounded border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-950"
                aria-label={theme === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre'}
              >
                {theme === 'dark' ? <Moon className="size-4" /> : <Sun className="size-4" />}
                <span className="hidden sm:inline">{theme === 'dark' ? 'Sombre' : 'Clair'}</span>
              </button>
              <div
                className="flex size-9 items-center justify-center rounded bg-slate-950 text-xs font-bold text-white"
                title={admin?.email ?? ''}
              >
                {(admin?.email ?? 'A').slice(0, 1).toUpperCase()}
              </div>
            </div>
          </div>

          {/* Navigation mobile : onglets horizontaux scrollables. */}
          <div className="flex gap-1.5 overflow-x-auto border-t border-slate-100 px-4 py-2 lg:hidden">
            {adminNav.map((item) => {
              const active = item.exact
                ? pathname === item.to
                : pathname === item.to || pathname.startsWith(`${item.to}/`)
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  activeOptions={{ exact: item.exact }}
                  className={`shrink-0 rounded border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    active
                      ? 'border-slate-950 bg-slate-950 text-white'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  {item.label}
                </Link>
              )
            })}
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
