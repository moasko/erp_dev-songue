#!/bin/sh
set -e

# Les migrations sont appliquees au demarrage : sur Dokploy il n'y a pas d'etape
# de deploiement separee, et un schema en retard sur le code casse l'application
# de facon silencieuse. `migrate deploy` n'applique que les migrations existantes,
# ne genere rien et ne detruit rien ; Prisma pose un verrou, plusieurs instances
# qui demarrent en meme temps ne se marchent pas dessus.
#
# RUN_MIGRATIONS=false permet de sauter cette etape (si tu preferes migrer a la main).
if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  if [ -z "${DATABASE_URL}" ]; then
    echo "docker-entrypoint: DATABASE_URL manquant, impossible de migrer." >&2
    exit 1
  fi
  echo "docker-entrypoint: application des migrations..."
  ./node_modules/.bin/prisma migrate deploy
fi

exec "$@"
