# apps/api — API NEXUS (Fastify)

Backend HTTP du **Digital Creation OS** — Prompts 04 à 06.

## Architecture

```
src/
├── index.ts              # Entrée : .env, écoute 0.0.0.0, arrêt gracieux
├── app.ts                # Assemblage : plugins, CORS, rate limit, routes
├── config/               # Configuration résolue (env validée Zod)
├── routes/
│   ├── health.ts         # GET /health · GET /ready
│   └── v1/auth.ts        # /v1/auth/* (montage préfixé)
├── controllers/          # Couche HTTP : validation + réponses
├── services/             # Logique métier : health, auth
├── middleware/           # Erreurs normalisées, garde d'authentification
├── schemas/              # Schémas Zod des entrées
└── version.ts
```

## Endpoints

| Route                  | Auth | Description                                    |
| ---------------------- | ---- | ---------------------------------------------- |
| `GET /health`          | —    | Liveness : toujours 200, état des composants   |
| `GET /ready`           | —    | Readiness : 200 base prête / 503 sinon         |
| `POST /v1/auth/register` | —  | Inscription (Argon2id + session + org. perso)  |
| `POST /v1/auth/login`  | —    | Connexion (cookie opaque HttpOnly)             |
| `POST /v1/auth/logout` | 🍪   | Révocation de session, effacement du cookie    |
| `GET /v1/auth/me`      | 🍪   | Utilisateur courant (garde de session)         |

## Erreurs — format unique

```json
{
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "E-mail ou mot de passe incorrect.",
    "details": [{ "path": "password", "message": "…" }],
    "requestId": "uuid-de-corrélation"
  }
}
```

Codes : `VALIDATION_ERROR`, `UNAUTHENTICATED`, `INVALID_CREDENTIALS`,
`EMAIL_TAKEN`, `NOT_FOUND`, `RATE_LIMITED`, `INTERNAL_ERROR`.

## Sécurité

- Mots de passe **Argon2id** (19 MiB, t=2, p=1 — OWASP), jamais en clair ;
- **Sessions opaques** : jeton 256 bits côté cookie, **SHA-256** en base,
  expiration + révocation, purge des sessions expirées ;
- Cookie `HttpOnly` · `SameSite=Lax` · `Secure` en production — jamais de
  localStorage ;
- **Rate limiting** global et renforcé sur l'authentification (429
  normalisé) ; temps de vérification égalisé (anti-énumération d'e-mails) ;
- **CORS strict** : liste d'origines exacte (jamais `*`), credentials ;
- Validation **Zod** de toutes les entrées ; secrets via variables
  d'environnement uniquement (jamais dans le code).

## Base de données

- Driver `postgres` (pool `pg` + Drizzle) ou `embedded` (**PGlite**, sans
  serveur — tests, CI, démo) via `DB_DRIVER` ;
- Migrations générées (`npm run db:generate`) et appliquées
  (`npm run db:migrate`) — même SQL pour les deux drivers.

```bash
npm run dev:api         # tsx watch (charge .env à la racine)
npm run build -w @nexus/api
npm test                # inclut les tests d'intégration API/auth/db
```
