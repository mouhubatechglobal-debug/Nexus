# NEXUS — Digital Creation OS

Monorepo TypeScript **React · Vite · Fastify · PostgreSQL · Drizzle · Zod · Redis · BullMQ**.

> État : **Prompt 01 — structure de base** (fondations uniquement, aucune
> fonctionnalité métier). Voir [`docs/architecture.md`](docs/architecture.md)
> pour les règles et la feuille de route.

## Structure

```
apps/
├── web/                 # Frontend React 19 + Vite 6 (port 5173)
└── api/                 # API Fastify 5 (port 3001, sonde /health)

packages/
├── core/                # Utilitaires fondamentaux (Result, ids…)
├── contracts/           # Contrats Zod partagés client ↔ serveur
├── db/                  # PostgreSQL via Drizzle ORM (+ drizzle-kit)
├── config/              # Environnement Zod + tsconfigs partagés
└── observability/       # Logging pino

services/
├── ai/                  # (à venir)
├── agents/              # (à venir)
├── sandbox/             # (à venir)
└── workers/             # Briques BullMQ/Redis (fabriques, zéro métier)

docs/  tests/  infra/    # Documentation, Vitest, Docker Compose (PG16 + Redis7)
```

## Démarrage rapide

```bash
# 0. Prérequis : Node ≥ 20.10 (voir .nvmrc)
nvm use

# 1. Installer tous les workspaces
npm install

# 2. (optionnel) PostgreSQL + Redis en local
npm run compose:up            # docker compose -f infra/docker-compose.yml up -d

# 3. Variables d'environnement (défauts sûrs : étape facultative)
cp .env.example .env

# 4. Développement (API 3001 + Web 5173 en parallèle)
npm run dev
```

- Frontend : http://localhost:5173 (affiche l'état de la plateforme)
- API : http://localhost:3001/health

> PostgreSQL/Redis sont **optionnels** : sans eux, `/health` répond
> `degraded` et le frontend l'affiche — l'API reste debout.

## Scripts racine

| Commande              | Rôle                                                        |
| --------------------- | ----------------------------------------------------------- |
| `npm run dev`         | API (tsx watch) + Web (Vite) en parallèle                    |
| `npm run dev:api`     | API seule                                                    |
| `npm run dev:web`     | Frontend seul                                                |
| `npm run build`       | Build complet (packages → api → web)                         |
| `npm run typecheck`   | `tsc --noEmit` sur tous les workspaces                       |
| `npm test`            | Tests Vitest (unitaires + intégration API)                   |
| `npm run db:generate` | Génère les migrations Drizzle (quand des tables existeront)  |
| `npm run db:push`     | Applique le schéma à PostgreSQL                              |
| `npm run compose:up`  | Démarre PostgreSQL 16 + Redis 7 (Docker)                     |

## Workspaces

Packages internes exposés sous le scope `@nexus/*` : `core`, `contracts`,
`db`, `config`, `observability`, `workers` — ainsi que les apps `api` et `web`.

Après modification d'un package interne : `npm run build:packages`
(les apps consomment `dist/`). Les tests utilisent les sources directement.

## Licence

Projet privé — tous droits réservés.
