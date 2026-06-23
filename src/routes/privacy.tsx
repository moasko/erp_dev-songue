import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowLeft, Database, LockKeyhole, Mail, ShieldCheck } from 'lucide-react'

export const Route = createFileRoute('/privacy')({
  component: PrivacyPage,
})

const sections = [
  {
    title: 'Donnees collectees',
    body: "Repere Plus peut traiter les informations necessaires a la creation et a l'utilisation d'un espace de travail: nom, email, entreprise, role utilisateur, donnees clients, produits, ventes, factures, stocks et operations saisies dans l'application.",
  },
  {
    title: 'Utilisation des donnees',
    body: "Ces donnees sont utilisees pour fournir les fonctionnalites de gestion, securiser l'acces aux comptes, afficher les tableaux de bord, generer les documents commerciaux et ameliorer la fiabilite du service.",
  },
  {
    title: 'Conservation',
    body: "Les donnees sont conservees pendant la duree necessaire a l'exploitation du compte et aux obligations legales applicables. Un administrateur peut demander l'export ou la suppression des donnees de son espace, sous reserve des obligations de conservation.",
  },
  {
    title: 'Partage',
    body: "Repere Plus ne vend pas les donnees personnelles. Les donnees peuvent etre partagees uniquement avec des prestataires techniques indispensables au fonctionnement du service, ou lorsque la loi l'exige.",
  },
  {
    title: 'Droits des utilisateurs',
    body: "Chaque utilisateur peut demander l'acces, la rectification ou la suppression de ses donnees personnelles. Les demandes doivent etre adressees a l'administrateur de l'espace ou au contact de confidentialite indique ci-dessous.",
  },
]

function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#f5f5f7] px-5 py-6 text-[#1d1d1f]">
      <div className="mx-auto max-w-5xl">
        <header className="flex items-center justify-between gap-4 py-2">
          <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-[#1d1d1f] transition hover:text-[#0066cc]">
            <ArrowLeft size={17} aria-hidden="true" />
            Repere Plus
          </Link>
          <Link to="/login" search={{ redirect: undefined }} className="rounded-full bg-[#1d1d1f] px-4 py-2 text-sm font-semibold text-white transition hover:bg-black">
            Connexion
          </Link>
        </header>

        <section className="py-16 text-center sm:py-24">
          <p className="mx-auto inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#6e6e73] shadow-sm">
            <ShieldCheck size={16} aria-hidden="true" />
            Confidentialite et securite
          </p>
          <h1 className="mx-auto mt-7 max-w-3xl text-5xl font-semibold tracking-tight text-[#1d1d1f] sm:text-7xl">
            Politique de confidentialite
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-[#6e6e73] sm:text-xl">
            Cette page explique comment Repere Plus collecte, utilise, protege et conserve les donnees liees a
            votre espace de gestion.
          </p>
          <p className="mt-5 text-sm font-medium text-[#86868b]">Derniere mise a jour: 16 juin 2026</p>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <article className="rounded-[28px] bg-white p-7 shadow-sm">
            <LockKeyhole size={28} className="text-[#0071e3]" aria-hidden="true" />
            <h2 className="mt-8 text-2xl font-semibold">Acces controle</h2>
            <p className="mt-3 leading-7 text-[#6e6e73]">
              Les espaces sont proteges par des comptes utilisateurs, des roles et des permissions adaptees aux
              responsabilites de chaque equipe.
            </p>
          </article>
          <article className="rounded-[28px] bg-[#1d1d1f] p-7 text-white shadow-sm">
            <Database size={28} className="text-[#7dd3fc]" aria-hidden="true" />
            <h2 className="mt-8 text-2xl font-semibold">Donnees utiles</h2>
            <p className="mt-3 leading-7 text-[#d2d2d7]">
              Les informations traitees servent a faire fonctionner les modules metier: caisse, ventes, achats,
              stock, clients, finances et reporting.
            </p>
          </article>
          <article className="rounded-[28px] bg-white p-7 shadow-sm">
            <Mail size={28} className="text-[#0071e3]" aria-hidden="true" />
            <h2 className="mt-8 text-2xl font-semibold">Contact</h2>
            <p className="mt-3 leading-7 text-[#6e6e73]">
              Pour toute question ou demande relative aux donnees personnelles, contactez l'administrateur de votre
              espace Repere Plus.
            </p>
          </article>
        </section>

        <section className="mt-8 rounded-[32px] bg-white px-6 py-8 shadow-sm sm:px-10 sm:py-12">
          <div className="grid gap-8">
            {sections.map((section) => (
              <article key={section.title} className="border-b border-[#e8e8ed] pb-8 last:border-b-0 last:pb-0">
                <h2 className="text-2xl font-semibold tracking-tight">{section.title}</h2>
                <p className="mt-3 max-w-3xl leading-8 text-[#6e6e73]">{section.body}</p>
              </article>
            ))}
          </div>
        </section>

        <footer className="py-10 text-center text-sm text-[#86868b]">
          © 2026 Repere Plus. Tous droits reserves.
        </footer>
      </div>
    </main>
  )
}
