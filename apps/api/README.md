# apps/api — API NEXUS (Fastify)

API HTTP du **Digital Creation OS**.

## Rôle à cette étape (Prompt 01)

- Serveur **Fastify** typé TypeScript, prêt à évoluer ;
- Logging **pino** via `@nexus/observability` ;
- Validation/sérialisation via les schémas **Zod** de `@nexus/contracts` ;
- Sonde `GET /health` (statut global + état PostgreSQL / Redis, non bloquante) ;
- CORS configuré pour le frontend Vite.

## Endpoints

| Route         | Description                                              |
| ------------- | -------------------------------------------------------- |
| `GET /`       | Carte d'identité du service                              |
| `GET /health` | Sonde standardisée (schéma `healthResponseSchema`)       |

## Scripts

```bash
npm run dev:api       # depuis la racine — tsx watch
npm run build -w @nexus/api
npm run start -w @nexus/api
```

## Notes

- Écoute sur `0.0.0.0:${PORT}` (défaut 3001) ;
- PostgreSQL et Redis sont **optionnels au démarrage** : `/health` les
  marque `down` s'ils sont injoignables, sans faire tomber le service.
