# tests — Stratégie de test NEXUS

Tests exécutés avec **Vitest** (`npm test` depuis la racine).
Les alias `@nexus/*` pointent vers les **sources** des packages
(voir `vitest.config.ts`) : aucun build préalable n'est nécessaire.

## Organisation

```
tests/
├── unit/           # Tests purs : packages core, contracts…
└── integration/    # Tests d'app : API Fastify via fastify.inject (sans réseau)
```

## À venir

- tests end-to-end (Playwright) contre `apps/web` + `apps/api` ;
- tests de charge des workers BullMQ.
