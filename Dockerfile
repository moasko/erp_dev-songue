# syntax=docker/dockerfile:1

# Image de production. Un Dockerfile explicite plutot que Nixpacks : Nixpacks
# devinait une version de Node trop ancienne pour Prisma (qui exige 20.19+ /
# 22.12+ / 24+), et servait l'application en statique via Caddy — or c'est une app
# a rendu serveur, il lui faut un process Node vivant.
#
# Aucun secret n'est necessaire pour construire l'image : le schema Prisma ne
# contient pas d'URL de base (elle est lue a l'execution) et le build ne fait que
# generer le client et compiler le front. Les cles (DATABASE_URL, R2_*, RESEND_*)
# se fournissent en variables d'ENVIRONNEMENT D'EXECUTION, jamais en build args :
# un build arg finit inscrit dans les couches de l'image et reste lisible par
# quiconque la recupere.

# `prisma.config.ts` fait `url: env("DATABASE_URL")`, evalue des le chargement du
# fichier : sans la variable, le CLI Prisma s'arrete — y compris `prisma generate`,
# qui n'a pourtant besoin d'aucune base. Les etapes qui generent le client
# recoivent donc une URL bidon.
#
# Portee globale (avant le premier FROM) et re-declaree dans chaque stage : un ARG
# declare dans un stage n'est PAS herite par ceux qui en derivent — il serait vide,
# et une chaine vide fait echouer env() exactement comme une variable absente.
ARG PRISMA_BUILD_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"


FROM node:22-bookworm-slim AS base
WORKDIR /app

# openssl : sans lui, Prisma n'arrive pas a detecter la version de libssl, part sur
# un defaut hasardeux et le moteur de migration peut ne pas fonctionner.
# ca-certificates : appels TLS sortants (Postgres, R2, Resend).
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*


# ─── Build ───
FROM base AS build
ARG PRISMA_BUILD_URL

# Le schema et la config sont copies avant l'installation : le postinstall du
# projet lance `prisma generate`, qui echoue sans eux.
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN DATABASE_URL="$PRISMA_BUILD_URL" npm ci

COPY . .

# prisma generate + vite build + tsc --noEmit
RUN DATABASE_URL="$PRISMA_BUILD_URL" npm run build


# ─── Runtime ───
FROM base AS runtime
ARG PRISMA_BUILD_URL

# Port 8080 plutot que 3000 : sur un hote Dokploy, le port 3000 est deja pris par
# le tableau de bord Dokploy lui-meme. Surchargeable via la variable PORT, mais
# elle doit alors correspondre au "Container Port" du domaine.
ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0

# Les node_modules de production ne servent qu'au CLI Prisma des migrations :
# l'application, elle, tourne entierement depuis .output. C'est pourquoi `prisma`
# est en dependencies et non en devDependencies.
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN DATABASE_URL="$PRISMA_BUILD_URL" npm ci --omit=dev && npm cache clean --force

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
