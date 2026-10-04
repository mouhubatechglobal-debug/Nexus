# NEXUS — Digital Creation OS

**NEXUS** est une plateforme de création assistée par IA, multi-tenant et
auto-hébergeable : chaque organisation dispose de son espace isolé pour
gérer des **projets**, leur **mémoire contextuelle (Brain)**, leurs
**fichiers (Forge)**, leurs **maquettes (Studio)**, leurs **expériences
(Lab)**, leurs **audits qualité (Doctor)**, ses **idées**, ses
**analytics** et ses **paiements (NEXUS Pay)** — le tout piloté par une
interface unique au design sombre « glassmorphism ».

> **État réel, sans prétention** : tout ce qui est décrit comme fonctionnel
> l'est réellement, exécuté et couvert par des tests. Ce qui exige une
> infrastructure externe (Redis réel, PostgreSQL serveur, providers de
> paiement, provider IA, isolation sandbox) est explicitement marqué
> **BLOCKED** ou **ARCHITECTURE_ONLY** tant que ce n'est pas configuré.
> Détail complet : [`docs/final-completion-report.md`](docs/final-completion-report.md).

---

## 1. Stack technique

| Couche | Technologie |
| --- | --- |
| Frontend | React 19 + Vite 6, TypeScript strict, CSS artisanal (aucun framework UI) |
| Backend | Fastify 5 (Node ≥ 20.10), Zod, pino |
| Base de données | PostgreSQL via Drizzle ORM — ou PGlite embarquée (dev/CI, zéro service requis) |
| Authentification | Argon2id (`@node-rs/argon2`), sessions opaques en base, cookies HttpOnly |
| Files de jobs | BullMQ (Redis) **ou** driver mémoire au même contrat |
| Tests | Vitest — intégration API sur vraie base embarquée, unitaires, interface jsdom |
| CI | GitHub Actions : install → build → typecheck → tests → build web |

## 2. Architecture

```
┌─────────────────────────────┐        ┌──────────────────────────────┐
│  apps/web (React, :5173)    │  /api  │  apps/api (Fastify, :3001)   │
│  14 pages, client typé,     │──────▶ │  routes → services → Drizzle │
│  cookies same-origin        │ proxy  │  guards Zod + multi-tenant   │
└─────────────────────────────┘        └──────────────┬───────────────┘
                                                      │
        ┌───────────────┬──────────────┬──────────────┼──────────────┐
        ▼               ▼              ▼              ▼              ▼
   PostgreSQL      files jobs     agents (7)     sandbox        provider IA
   (20 tables,     (BullMQ ou     permissions    (JAMAIS        (OpenAI-
   4 migrations)   memory)        fermées        exécuté        compatible,
                                  par design     sans isol.)    clé via env
```

Packages internes `@nexus/*` : `config` (env Zod), `contracts` (contrats
partagés client↔serveur), `core` (Result, ids), `db` (schéma + migrations),
`observability` (pino), `workers` (fabriques BullMQ/queue mémoire) — plus
`services/agents` et `services/sandbox`.

## 3. Fonctionnalités réelles (exécutées et testées)

### Interface (14 pages)
Dashboard · Projects · Idea · Research · Conception · Code · Test · Deploy ·
Analyse · Amélioration · Library · Settings — navigation en 14 destinations,
responsive validé sur 9 breakpoints (320→1920 px, 108/108 vérifications),
identité graphique fixe : fond `#04060f`/`#0a1020`, accents bleu
`#4f8dff`, violet `#8b5cf6`, cyan `#22d3ee`, polices Space Grotesk / Inter /
JetBrains Mono, logo « N » ruban dégradé (sidebar, connexion, favicon).

### Comptes & organisations
Inscription, connexion, déconnexion, `/me` ; sessions expirables et purgées ;
rôles `member < admin < owner` vérifiés côté serveur sur chaque route.

### Projets & Brain & Forge
CRUD projets réel (pagination, recherche, slug unique) ; Brain structuré
(contexte, objectifs, contraintes, décisions, architecture, préférences,
connaissances) ; Forge : filesystem virtuel **versionné** (créer, lire,
écrire, renommer, supprimer), chemins validés contre le path traversal
(`..`, `%2e/%2f/%5c`, `\0`, chemins absolus — testés).

### Studio, Lab, Doctor
Studio : document de design JSON **versionnable** (≠ générateur de code).
Lab : expériences/hypothèses/sources — source = URL obligatoire, statut
« non vérifié » explicite, jamais de source inventée. Doctor : audits
réels PASS/WARN/FAIL/**NOT_TESTED** — un contrôle non exécutable n'est
jamais compté comme PASS.

### Idées
Backlog persistant par organisation (`ideas`), votes **atomiques côté
serveur**, validation Zod, isolation inter-organisations testée.

### Jobs (nexus.digest)
Flux API → Queue → Worker → Résultat consultable (`POST /v1/jobs/digest`,
`GET /v1/jobs/:jobId`). Retry 3, backoff exponentiel. Annulation admin
(`DELETE /v1/jobs/:jobId`) : un job en attente passe `cancelled` et **n'est
jamais exécuté**. Deux drivers au même contrat : `memory` (défaut, tests/dev)
et `bullmq` (production, exige Redis ; injoignable → 503 honnête, jamais
d'attente infinie). **Aucun code utilisateur dans le worker.**

### Déploiements
Pipeline `build → test → security → staging → production` persisté (statuts,
début/fin, logs horodatés, erreurs). L'étape SECURITY scanne réellement les
fichiers (clés privées, `AKIA…`, certificats) et fait échouer le pipeline.
**La production n'est jamais automatique** : création en `pending`,
promotion `confirm:true` réservée admin, annulation possible.

### Analytics
Événements réels persistés, type et métadonnées validés, environnement
`demo|live` **obligatoire et jamais mélangé**, pagination, métriques agrégées
(total, par type, par jour ≤ 90 j), anti-IDOR projet↔organisation.
Dashboard et Analyse affichent ces données réelles avec sélecteur
d'environnement.

### NEXUS Pay
Chaîne complète Provider → Router → TransactionEngine → FeeEngine → Ledger →
WebhookHandler → Reconciliation → Payout :
- commission **3,5 % (350 bps) calculée côté serveur** (100 000 → 3 500
  frais → 96 500 net) ;
- **idempotence** `(organisation, clé)` résistante aux requêtes concurrentes
  (replay 200, jamais 500) ;
- **aucune donnée carte** : schémas `.strict()` rejettent PAN/CVV, checkout
  tokenisé `tok_…` ;
- webhooks HMAC-SHA256 en temps constant, idempotents, rejouables ;
- grand livre en **partie double** équilibré (testé) ;
- payouts tokenisés, admin, **transactionnels** (verrou consultatif par
  organisation : deux payouts concurrents ne peuvent pas décrocher le même
  solde) ;
- adaptateurs Mixx by Yas / Moov Money / Wave / MTN Money / Carte = 
  **abstractions `configured:false`** — aucune API fabriquée, aucun
  encaissement tant que les contrats officiels ne sont pas intégrés.

### IA & Agents
Provider OpenAI-compatible abstrait (`AI_BASE_URL`, `AI_MODEL`, `AI_API_KEY`
via environnement uniquement), timeout, erreurs honnêtes
(`AI_PROVIDER_ERROR`/`AI_TIMEOUT`). 7 agents (Architect, Developer,
Designer, Researcher, Tester, Auditor, Marketing) à **permissions fermées**
(union de 11 valeurs) : aucun shell, aucun secret, aucun fichier global,
aucune org complète — par construction.

### Sécurité
Isolation multi-tenant systématique (guards `requireOrgAccess` /
`requireProjectAccess`, 404 anti-énumération, scoping y compris jobs et
soldes), validation Zod sur toutes les entrées, rate limiting global +
renforcé sur /v1/auth, CORS en liste explicite, cookies HttpOnly/SameSite/
Secure-prod, secrets exclusivement via variables d'environnement,
`DB_DRIVER=embedded` **refusé en production**, aucun secret dans Git
(balayage vérifié).

## 4. Base de données

20 tables, 4 migrations Drizzle (`0000`→`0003`) : users, sessions,
organizations, organization_members, projects, brain_entries, project_files,
file_versions, studio_designs, lab_entries, project_audits, deployments,
deployment_stages, analytics_events, ideas, merchants, payment_providers,
transactions, ledger_entries, payouts. Migrations appliquées automatiquement
au démarrage (verrou consultatif PostgreSQL : sûr en serverless
multi-instances). Driver embarqué **PGlite** pour dev/CI (aucun service à
installer) ; driver `postgres` pour la production.

## 5. Démarrage

```bash
npm install
cp .env.example .env        # défauts sûrs ; DB_DRIVER=embedded par défaut ici
npm run dev                 # API :3001 + interface :5173
```

Sondes : `GET /health` (status + database + redis), `GET /ready`.
Interface : http://localhost:5173 — API : http://localhost:3001/health

| Commande | Rôle |
| --- | --- |
| `npm run dev` | API (tsx watch) + Web (Vite) |
| `npm run build` | packages internes → API → web |
| `npm run typecheck` | TypeScript strict, zéro erreur |
| `npm test` | 121 tests (15 fichiers) |
| `npm run audit:responsive` | 108 vérifications, 9 breakpoints (Playwright) |
| `npm run db:generate` | génère une migration Drizzle |

## 6. Déploiement Vercel

Prêt : `vercel.json` + pont serverless `api/index.ts` (app Fastify singleton,
préfixe `/api` retiré, migrations auto verrouillées) — **validé par
simulation locale du bundling** (`scripts/verify-vercel-bundle.mjs`) et du
handler (`scripts/verify-vercel-handler.ts`). Exigences : PostgreSQL managé
(`DATABASE_URL`, `DB_DRIVER=postgres`), `COOKIE_SECRET` et
`PAY_WEBHOOK_SECRET` forts, `CORS_ORIGIN` = domaine final. Guide complet :
[`docs/deploiement-vercel.md`](docs/deploiement-vercel.md).

## 7. Limites honnêtes

| Élément | État | Ce qui manque |
| --- | --- | --- |
| Sandbox (gVisor/Firecracker) | **ARCHITECTURE_ONLY** | isolation réelle — aucun code utilisateur n'est exécuté, ici ou ailleurs |
| BullMQ/Redis réel | **BLOCKED** | serveur Redis (driver compilé, non testé contre un vrai) |
| PostgreSQL serveur | **BLOCKED** (non testé ici) | serveur réel — le driver existe et les migrations s'appliquent |
| Providers paiement | **BLOCKED** | contrats/API officiels — adaptateurs en attente, rien n'encaisse |
| Provider IA réel | **BLOCKED** | configuration `AI_*` (mock uniquement en test) |
| Rate limit / jobs `memory` | note | par instance en serverless (documenté) |

Autres docs : [`docs/architecture.md`](docs/architecture.md) ·
[`docs/final-completion-report.md`](docs/final-completion-report.md) ·
[`docs/audit-final.md`](docs/audit-final.md)

## Licence

Projet privé — tous droits réservés.
