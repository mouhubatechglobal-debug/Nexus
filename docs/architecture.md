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
