# Architecture NEXUS

**NEXUS — Digital Creation OS** est un monorepo TypeScript organisé pour
croître progressivement : applications, bibliothèques partagées, services.

## Vue d'ensemble

```
apps/
├── web/                 # Frontend React + Vite (port 5173)
└── api/                 # API HTTP Fastify (port 3001)

packages/
├── core/                # Types & utilitaires fondamentaux (sans dépendance)
├── contracts/           # Contrats Zod partagés (schémas API, types inférés)
├── db/                  # Accès PostgreSQL : Drizzle ORM + migrations
├── config/              # Config d'environnement (Zod) + tsconfigs partagés
└── observability/       # Logging pino (pretty en dev, JSON en prod)

services/
├── ai/                  # (à venir) capacités IA
├── agents/              # (à venir) orchestration d'agents
├── sandbox/             # (à venir) exécution isolée de code
└── workers/             # Workers BullMQ (fabriques prêtes, zéro métier)

docs/                    # Documentation d'architecture
tests/                   # Tests unitaires & d'intégration (Vitest)
infra/                   # Docker Compose (PostgreSQL 16 + Redis 7)
```

## Règles de dépendances

```
apps ──▶ packages ──▶ (aucune dépendance croisée imposée)
                ▲
services/workers ┘
```

- `@nexus/core` et `@nexus/contracts` ne dépendent de **rien** ;
- `@nexus/config` ne dépend que de `zod` ;
- `@nexus/db` encapsule **tout** accès PostgreSQL (personne d'autre ne
  touche à `pg`/Drizzle) ;
- `@nexus/observability` encapsule la journalisation ;
- le frontend ne parle jamais directement à PostgreSQL/Redis ;
- le frontend n'appelle que `/api/*` (même origine) — en dev, Vite
  proxifie vers l'API.

## Conventions techniques

| Sujet            | Choix                                                        |
| ---------------- | ------------------------------------------------------------ |
| Langage          | TypeScript 5 strict (`verbatimModuleSyntax`, `noUncheckedIndexedAccess`) |
| Modules          | ESM partout (`"type": "module"`)                             |
| Packages internes| Compilés vers `dist/` (tsc), exposés en `@nexus/*`           |
| Validation       | Zod — source de vérité dans `@nexus/contracts`               |
| Logs             | pino via `@nexus/observability`                              |
| Tests            | Vitest (alias `@nexus/*` → sources, pas besoin de build)     |

## Construction & développement

```bash
npm install            # installe tous les workspaces
npm run build:packages # compile les packages internes (dist/)
npm run dev            # API (3001) + Web (5173) en parallèle
npm run typecheck      # tsc --noEmit sur tous les workspaces
npm test               # Vitest
npm run build          # build complet (packages + api + web)
```

Le développeur doit lancer `npm run build:packages` après avoir modifié
un package interne (les apps consomment `dist/`). Les tests, eux, usent
des sources directement (alias Vitest).

## Environnement

Copier `.env.example` → `.env`. Toutes les valeurs ont des défauts de
développement : rien n'est requis pour démarrer. PostgreSQL/Redis sont
optionnels : `GET /health` les marque `down` le cas échéant.

## Modules métier (Prompts 07-16)

| Module | API | Rôle |
| --- | --- | --- |
| Multi-tenant | guards (`requireOrgAccess`, `requireProjectAccess`) | isolation anti-IDOR : MEMBER < ADMIN < OWNER, 404 sur org étrangère |
| Projets | `/v1/projects` (CRUD, pagination, recherche) | réels, persistés, liés à une organisation |
| NEXUS Brain | `/v1/projects/:id/brain` | mémoire structurée (contexte, objectifs, décisions…) |
| Forge | `/v1/projects/:id/files` | filesystem virtuel versionné, chemins validés (anti-traversal) |
| Studio | `/v1/projects/:id/studio` | document de conception JSON versionnable |
| Lab | `/v1/projects/:id/lab` | expériences & sources — source = URL obligatoire, non-vérifié explicite |
| Doctor | `/v1/projects/:id/audits` | audits PASS/WARN/FAIL/NOT_TESTED (honnêtes) |
| IA | `/v1/ai/complete` | provider OpenAI-compatible, timeout, clé via env |
| Agents | `services/agents` (`@nexus/agents`) | 7 agents à permissions fermées, aucun shell/secrets/fs global |

Base de données : 11 tables (`users`, `sessions`, `organizations`,
`organization_members`, `projects`, `brain_entries`, `project_files`,
`file_versions`, `studio_designs`, `lab_entries`, `project_audits`),
migrations Drizzle dans `packages/db/drizzle/`.

## Plateforme (Prompts 17-22)

### 17 — Jobs / BullMQ

`@nexus/workers` : `createQueue` (producteur, `enableOfflineQueue:false` →
échec rapide si Redis absent), `createWorker` (consommateur, retry 3,
backoff exponentiel 1 s), `InProcessQueue` (même contrat sans serveur,
défaut hors production). Job interne réel : `nexus.digest` (compte
projets/Brain/événements d'une organisation) — flux API → Queue → Worker →
Résultat persisté, consultable via `POST /v1/jobs/digest` (202) puis
`GET /v1/jobs/:jobId`. **Aucun code utilisateur dans le worker** : le seul
processor est interne et typé (`DigestPayload → DigestResult`).
`QUEUE_DRIVER` : `memory` (défaut) ou `bullmq` (Redis requis ; injoignable
→ 503 honnête, jamais d'attente infinie).

### 18 — Sandbox (ARCHITECTURE_ONLY)

`@nexus/sandbox` : contrat `Job → SandboxPolicy → Execution → Result` avec
bornes validées (CPU 32–1024 parts, RAM 64–2048 Mo, timeout 0,5–60 s,
filesystem `none|workspace`, réseau `none|bridged` — bridged interdit).
Les drivers `gvisor`/`firecracker`/`local-process` sont déclarés
`architectureOnly: true` : toute exécution lève
`SandboxUnavailableError('[ARCHITECTURE_ONLY] …')`. **Aucun code non fiable
n'est jamais exécuté dans le processus principal** ; l'application ne
prétend pas être sécurisée tant que l'isolation réelle n'existe pas.

### 19 — Déploiements

Pipeline `build → test → security → staging → production` persisté
(`deployment_stages` : statut, début, fin, logs horodatés, erreur).
L'étape SECURITY scanne réellement les fichiers du projet (clés privées,
`AKIA…`, certificats) et fait échouer le pipeline. **La production n'est
jamais automatique** : créer un déploiement production le laisse `pending`
jusqu'à `POST …/promote {confirm:true}` (réservé admin) ; `cancel` annule.
Environnement contrôlé uniquement : les étapes sont des simulations
honnêtes, aucun déploiement réel n'est déclenché.

### 20 — Analytics

`analytics_events` : organisation/projet/type (`^[a-z][a-z0-9._-]*$`)/
timestamp/metadata validée (≤ 25 clés, valeurs bornées)/environnement
`demo|live` **obligatoire — DEMO et LIVE ne sont jamais mélangés**.
API : `POST /v1/analytics/events` (anti-IDOR projet↔org), `GET …/events`
(pagination), `GET …/metrics?days≤90` (total, par type, par jour).
Interface : Dashboard et Analyse affichent les données réelles avec un
sélecteur d'environnement explicite.

### 21 — NEXUS Pay

Chaîne `PaymentProvider → Router → TransactionEngine → FeeEngine →
Ledger → WebhookHandler → Reconciliation → Payout`. Modèles
`merchants`, `payment_providers`, `transactions`, `ledger_entries`,
`payouts`. Adaptateurs **Mixx by Yas / Moov Money / Wave / MTN Money /
Carte = abstractions** (`configured:false`, aucun appel réseau fabriqué) ;
cartes : **jamais de PAN/CVV** (schémas `.strict()`, checkout tokenisé
`tok_…`). Commission **350 bps calculée côté serveur**
(100 000 → 3 500 frais → 96 500 net). Idempotence `(organisation, clé)`,
webhooks HMAC-SHA256 en temps constant + rejeu idempotent, grand livre en
partie double, réconciliation par comparaison de références, payouts
(tokenisés, admin, solde requis). Aucun paiement réel n'est testé ici.

### 22 — Audit final

Méthode : analyse d'abord, corrections ensuite (build → runtime →
sécurité → auth → multi-tenant → db → API → jobs → IA → paiements →
tests → production). Rapport dans `docs/audit-final.md` : constats
P0–P3 (fichier/problème/impact/solution), compteurs exacts (fichiers,
tests, builds, migrations), intégrations externes réellement
configurables, maturité justifiée — **aucun pourcentage inventé**.

Base de données : 19 tables (les 11 précédentes + `deployments`,
`deployment_stages`, `analytics_events`, `merchants`,
`payment_providers`, `transactions`, `ledger_entries`, `payouts`),
migrations Drizzle `0001` et `0002`.

## Déploiement

Local : `npm run dev` (API :3001 + web :5173, proxy `/api`).
Vercel : point d'entrée serverless `api/index.ts` + `vercel.json` —
analyse complète, étapes et limitations dans `docs/deploiement-vercel.md`
(PostgreSQL externe obligatoire ; `DB_DRIVER=embedded` refusé en
production ; migrations auto avec verrou consultatif).
