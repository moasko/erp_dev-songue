// Compteur compact commun a toutes les pages de l'application.
//
// Icone discrete a gauche (masquee sur mobile pour laisser la place au
// chiffre), valeur en avant, libelle en petites capitales dessous. Concu pour
// s'afficher a 2 colonnes sur mobile : ~64px de haut la ou les anciennes
// cartes empilees en prenaient ~130 chacune, soit un demi-ecran de compteurs
// avant d'atteindre le contenu.

export function StatCard({
  title,
  value,
  icon: Icon,
  detail,
  alert = false,
}: {
  title: string
  value: string
  icon?: any
  detail?: string
  alert?: boolean
}) {
  return (
    <div className="neon-surface flex items-center gap-3 rounded px-3.5 py-3 sm:px-4">
      {Icon ? (
        <div className={`hidden size-9 shrink-0 items-center justify-center rounded sm:flex ${alert ? 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400' : 'bg-slate-50 text-slate-400 dark:bg-slate-900 dark:text-slate-500'}`}>
          <Icon className="size-4" />
        </div>
      ) : null}
      <div className="min-w-0">
        {/* Pas de truncate sur la valeur : un montant coupe est un montant faux.
            Elle passe a la ligne si la carte est trop etroite. */}
        <p className={`break-words text-base font-bold leading-tight sm:text-lg ${alert ? 'text-amber-600 dark:text-amber-400' : 'text-slate-950 dark:text-white'}`}>
          {value}
        </p>
        <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-slate-400" title={detail ? `${title} — ${detail}` : title}>
          {title}
          {detail ? <span className="normal-case text-slate-400/80"> · {detail}</span> : null}
        </p>
      </div>
    </div>
  )
}
