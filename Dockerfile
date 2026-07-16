# syntax=docker/dockerfile:1

# Image de production. Un Dockerfile explicite plutot que Nixpacks : Nixpacks
# devinait une version de Node trop ancienne pour Prisma (qui exige 20.19+ /
# 22.12+ / 24+), et le build echouait des `npm i`.
#
# Aucun secret n'est necessaire pour construire l'image : le schema Prisma ne
# contient pas d'URL de base (elle est lue a l'execution), et le build ne fait que
# generer le client et compiler le front. Les cles (DATABASE_URL, R2_*, RESEND_*)
# se fournissent en variables d'ENVIRONNEMENT D'EXECUTION, jamais en build args :
# un build arg finit inscrit dans les couches de l'image et reste lisible par
# quiconque la recupere.

FROM node:22-bookworm-slim AS base
WORKDIR /app


# ─── Build ───
FROM base AS build

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# prisma generate + vite build + tsc --noEmit
RUN npm run build


# ─── Runtime ───
FROM base AS runtime

# Port 8080 plutot que 3000 : sur un hote Dokploy, le port 3000 est deja pris par
# le tableau de bord Dokploy lui-meme. Tant qu'on passe par le reverse proxy, il
# n'y a pas de conflit (le conteneur a son propre reseau), mais publier 3000 sur
# l'hote ferait echouer le demarrage avec "port is already allocated".
# Surchargeable via la variable PORT.
ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0

# Certificats requis pour les appels TLS sortants (Postgres, R2, Resend).
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Le schema est copie avant l'installation : le postinstall du projet lance
# `prisma generate`, qui echouerait sans lui.
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci --omit=dev && npm cache clean --force

# Sortie Nitro autonome : elle embarque le client Prisma en WASM (aucun moteur
# natif a installer, donc aucun binaryTarget a gerer).
COPY --from=build /app/.output ./.output

COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

# L'application ne doit pas tourner en root.
USER node

EXPOSE 8080

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", ".output/server/index.mjs"]
