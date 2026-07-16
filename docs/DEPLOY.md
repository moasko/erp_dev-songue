# Deploiement (Dokploy / Docker)

## Pourquoi un Dockerfile plutot que Nixpacks

Nixpacks choisissait une version de Node trop ancienne et le build echouait des
`npm i` :

```
Prisma only supports Node.js versions 20.19+, 22.12+, 24.0+.
```

Le `Dockerfile` fixe Node 22 et rend le build reproductible. `package.json`
declare aussi `engines.node >= 22.12`, ce que Nixpacks lit — mais le Dockerfile
reste la reference.

Dans Dokploy : **Application > Build Type > Dockerfile** (chemin `./Dockerfile`).

## Les secrets vont en variables d'execution, jamais en build args

Le build precedent passait les cles R2 en `ARG`/`ENV`, et Docker le signalait :

```
SecretsUsedInArgOrEnv: Do not use ARG or ENV instructions for sensitive data (ENV "R2_SECRET_ACCESS_KEY")
```

Un build arg **reste inscrit dans les couches de l'image** : quiconque recupere
l'image peut le relire, meme si la variable n'est plus utilisee ensuite. Ces cles
sont des secrets d'execution.

**Aucun secret n'est necessaire pour construire l'image.** Le schema Prisma ne
contient pas d'URL de base (elle est lue a l'execution) et le build ne fait que
generer le client et compiler le front. Dans Dokploy, tout se renseigne dans
l'onglet **Environment** (execution), et rien dans les build args.

## Variables d'environnement

`.env` n'entre **pas** dans l'image (exclu par `.dockerignore`). De plus, le
serveur compile ne lit pas `.env` du tout : `import 'dotenv/config'` est supprime
au bundling (`sideEffects: false`). En production, les variables viennent donc
uniquement de l'environnement — ce que Dokploy fournit.

| Variable | Requis | Role |
| --- | --- | --- |
| `DATABASE_URL` | oui | Postgres. Sans elle, le conteneur s'arrete au demarrage. |
| `APP_BASE_URL` | oui | URL publique, sans slash final. Sert aux liens des emails. **Obligatoire en production** : sans elle, aucun email d'invitation ni de reinitialisation n'est envoye (voir plus bas). |
| `APP_ROOT_DOMAIN` | non | Domaine affiche a l'inscription (defaut `icomgest.cloud`). |
| `ALLOW_PUBLIC_REGISTRATION` | non | `"true"` pour ouvrir `/register` en self-service. Defaut : ferme. |
| `RESEND_API_KEY` | non | Sans elle, aucun email ne part : le code de verification s'ecrit dans les logs. |
| `MAIL_FROM` | non | Expediteur, domaine verifie chez Resend. |
| `R2_*` | non | Upload d'images. Sans elles, les champs image retombent sur la saisie d'URL. Voir `R2.md`. |
| `DATABASE_POOL_MAX` | non | Taille du pool (defaut 10). |
| `PORT` | non | Defaut 8080 (deja expose par l'image). Le port 3000 de l'hote est pris par Dokploy lui-meme. |
| `RUN_MIGRATIONS` | non | `"false"` pour ne pas migrer au demarrage. |

`APP_BASE_URL` merite une explication : pour construire un lien absolu, le
reflexe serait de lire l'en-tete `Host` — mais il est fourni par le client. Un
attaquant peut forcer un `Host` qui lui appartient, declencher une
reinitialisation, et le lien envoye a la victime pointe alors chez lui. En
production le `Host` est donc ignore et `APP_BASE_URL` est obligatoire.

## Migrations

Elles sont appliquees au demarrage par `docker-entrypoint.sh`
(`prisma migrate deploy`) : sur Dokploy il n'y a pas d'etape de deploiement
separee, et un schema en retard sur le code casse l'application silencieusement.

`migrate deploy` n'applique que les migrations existantes, ne genere rien et ne
detruit rien. Prisma pose un verrou : plusieurs instances qui demarrent en meme
temps ne se marchent pas dessus. Mettre `RUN_MIGRATIONS=false` pour migrer a la
main.

## Ce que contient l'image

- `.output` : sortie Nitro autonome. Le client Prisma y est embarque **en WASM**,
  donc aucun moteur natif a installer et aucun `binaryTarget` a gerer.
- `node_modules` de production : necessaires uniquement pour le CLI Prisma des
  migrations. C'est pourquoi `prisma` est en `dependencies` et non en
  `devDependencies` : `npm ci --omit=dev` doit le conserver.
- L'application tourne sous l'utilisateur `node`, pas en root.

## Verifier apres deploiement

1. Les logs doivent afficher `application des migrations...` puis
   `Listening on: http://0.0.0.0:8080/`.
2. `GET /` doit renvoyer une redirection (307) et non une erreur 500 : une 500 a
   ce stade signifie presque toujours un `DATABASE_URL` absent ou faux.
3. Creer le premier compte via `/register` (accessible tant qu'aucune entreprise
   n'existe).
