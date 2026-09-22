# Déploiement NEXUS sur Vercel — analyse et guide

Analyse honnête du projet au regard du modèle Vercel (serverless + statique),
avec le scaffolding ajouté pour rendre le déploiement possible. **Aucune
intégration externe n'est prétendue fonctionnante tant qu'elle n'est pas
configurée** (cf. tableau final).

## Verdict en une phrase

L'**interface** et **l'API complète** (auth, multi-tenant, projets, Brain,
Forge, Studio, Lab, Doctor, analytics, NEXUS Pay, pipeline deploy) se
déploient sur Vercel avec un **PostgreSQL externe obligatoire** ; la **file
de jobs** fonctionne en mode dégradé honnête (`memory`) ; **BullMQ/Redis,
l'exécution sandbox et les workers persistants ne sont pas possibles sur
Vercel** (voir limitations).

## Analyse composant par composant

| Composant | Sur Vercel | Détail |
| --- | --- | --- |
| Interface (Vite/React, routeur par hash) | ✅ tel quel | build statique servi par Vercel (`apps/web/dist`) ; routeur à fragment → aucun fallback serveur nécessaire ; appelle `/api/...` en même origine (cookies HttpOnly OK) |
| API Fastify (toutes routes `/v1/*`) | ✅ via `api/index.ts` | pont serverless ajouté : app construite une fois par instance froide, `app.routing()` par requête, préfixe `/api` retiré comme le proxy Vite ; vérifié en local par `scripts/verify-vercel-handler.ts` |
| Base de données | ⚠️ externe obligatoire | `DB_DRIVER=embedded` (PGlite sur disque) **refusé en production** par la config — filesystem éphémère en serverless = perte de données. Il faut `DB_DRIVER=postgres` + `DATABASE_URL` (Vercel Postgres/Neon/Supabase…) |
| Migrations | ✅ automatiques | appliquées au premier démarrage de l'instance, protégées par verrou consultatif PostgreSQL (sûres même si plusieurs instances démarrent en parallèle) ; le dossier `packages/db/drizzle` est embarqué via `includeFiles` |
| Sessions (cookies + table `sessions`) | ✅ | état en base → partagé entre toutes les instances |
| Rate limiting | ⚠️ par instance | `@fastify/rate-limit` est en mémoire : les compteurs ne sont pas partagés entre instances froides (protection réelle mais non globale) |
| Jobs (`nexus.digest`) | ⚠️ dégradé honnête | `QUEUE_DRIVER=memory` (défaut) : le job s'exécute vraiment, mais l'état vit dans l'instance qui a reçu le POST — `GET /v1/jobs/:jobId` peut tomber sur une autre instance (404 possible). BullMQ exige Redis + un worker persistant : **pas exécutable dans une fonction Vercel** |
| Sandbox (Prompt 18) | ➖ inchangé | `ARCHITECTURE_ONLY` : rien à déployer, aucune exécution de code utilisateur, ici comme ailleurs |
| Deploy (Prompt 19) | ✅ | pipeline simulé en environnement contrôlé, production sur action explicite — aucun déploiement réel, comme conçu |
| Analytics (Prompt 20) | ✅ | 100 % base de données ; démo/live jamais mélangés |
| NEXUS Pay (Prompt 21) | ✅ métier / ❌ encaissement | chaîne complète fonctionnelle en base (frais 350 bps, idempotence, ledger, webhooks HMAC signés — l'URL publique Vercel est exploitable par un provider réel) ; **aucun provider n'est configuré : rien n'encaisse** |
| IA (Prompt 11) | ✅ pont | le provider OpenAI-compatible est appelé côté serveur ; sans `AI_BASE_URL` joignable → erreurs honnêtes (`AI_PROVIDER_ERROR`/`AI_TIMEOUT`) |
| Webhooks pay `POST /v1/pay/webhooks/:provider` | ✅ | fonction publique signée — compatible avec l'URL de production Vercel |

## Ce qu'il faut faire (pas à pas)

1. **PostgreSQL managé** — créer une base (Vercel Postgres, Neon,
   Supabase…). Copier la chaîne de connexion (ajouter `?sslmode=require`
   si le provider l'exige).
2. **Importer le dépôt** — Vercel → *Add New Project* → ce dépôt Git. Le
   `vercel.json` à la racine pilote tout (framework « Other ») :
   - `installCommand` : `npm install` (workspaces)
   - `buildCommand` : `npm run build` (packages internes + API + web)
   - sortie statique : `apps/web/dist`
   - fonction Node : `api/index.ts` (`maxDuration` 60 s)
3. **Variables d'environnement** (Project → Settings → Environment Variables) :

   | Variable | Valeur | Obligatoire |
   | --- | --- | --- |
   | `DATABASE_URL` | `postgres://…` (étape 1) | ✅ |
   | `DB_DRIVER` | `postgres` | ✅ (le refus d'`embedded` en production est voulu) |
   | `COOKIE_SECRET` | `openssl rand -base64 32` | ✅ |
   | `PAY_WEBHOOK_SECRET` | `openssl rand -base64 32` | ✅ |
   | `CORS_ORIGIN` | `https://<ton-domaine>.vercel.app` (ou domaine custom) | conseillé |
   | `QUEUE_DRIVER` | `memory` (défaut) | non |
   | `REDIS_URL` | URL Redis si tu en as une (sinon sonde `down`, honnête) | non |
   | `AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL` | provider OpenAI-compatible réel | non |

   `NODE_ENV=production` est posé par Vercel automatiquement.
4. **Déployer** — le premier appel de l'API applique les migrations, puis
   `GET /api/health` doit répondre `"database": "up"`.
5. **Vérifier** — créer un compte sur l'interface déployée, créer un
   projet, déclencher un déploiement staging : tout est persisté dans le
   PostgreSQL externe.

Alternative CLI : `npm i -g vercel && vercel` (le CLI lit `vercel.json`) ;
`vercel env add DATABASE_URL` puis `vercel --prod`.

## Vérification locale du pont serverless (déjà exécutée)

```bash
npx tsx scripts/verify-vercel-handler.ts
```

Simule Vercel (serveur HTTP brut → handler exporté, préfixe `/api`) et
valide : santé, enregistrement, session, création de projet (persistance),
transaction pay (100 000/3 500/96 500), job digest (202). Résultat : **TOUT
OK**, deux exécutions de suite.

## Limitations honnêtes (aucune contournement automatique)

1. **Jobs** : sur `memory`, l'état des jobs est par instance (404 possible
   sur `GET /v1/jobs/:jobId` si une autre instance répond). Pour du réel :
   Redis (Upstash…) + **worker BullMQ hébergé hors Vercel** (VM, container,
   cron d'un autre provider) — c'est une architecture volontairement non
   simulée ici.
2. **Rate limit** : compteurs par instance (non globaux).
3. **BullMQ dans la fonction** : possible en PRODUCTEUR si Redis est
   joignable, mais aucun consommateur persistant ne peut vivre sur Vercel.
4. **Sandbox** : reste `ARCHITECTURE_ONLY` — rien n'exécute de code
   utilisateur, sur Vercel comme en local.
5. **Paiements** : les adaptateurs restent `configured:false` tant qu'aucun
   identifiant provider n'est intégré ; aucun test de paiement réel n'a été
   fait.
6. **`@node-rs/argon2`** : binaire natif avec builds Linux officiels
   (glibc/musl) — censé fonctionner sur le runtime Vercel ; à confirmer au
   premier déploiement (un échec serait explicite dans les logs de fonction).

## Maturité après déploiement

**MVP déployé** : tout ce qui est présenté comme réel (comptes, projets,
contenus, analytics, chaîne pay métier, pipeline contrôlé) tourne réellement
sur l'URL Vercel avec persistance PostgreSQL externe ; les limites ci-dessus
sont documentées et visibles dans l'application elle-même (sondes, badge
Redis `down`, adaptateurs « non configuré »).
