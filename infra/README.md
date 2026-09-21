# infra — Infrastructure NEXUS

Infrastructure de développement et, plus tard, de déploiement.

## Contenu actuel

- `docker-compose.yml` : **PostgreSQL 16** + **Redis 7** pour le
  développement local, avec volumes persistants et healthchecks.

## Utilisation

```bash
npm run compose:up     # démarre postgres + redis en arrière-plan
npm run compose:down   # arrête et supprime les conteneurs (données conservées)
```

> L'API NEXUS démarre même sans cette infrastructure : la sonde
> `GET /health` marque alors PostgreSQL/Redis comme `down`.

## À venir

- Dockerfiles de production (web, api, workers) ;
- configuration de déploiement.
