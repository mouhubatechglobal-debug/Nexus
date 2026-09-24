# Audit final NEXUS — Prompts 01 à 22

Méthode respectée : **analyse d'abord, corrections ensuite** (ordre : build →
runtime → sécurité → auth → multi-tenant → db → API → jobs → IA → paiements →
tests → production). Ce rapport ne contient **aucun pourcentage inventé** :
chaque affirmation est vérifiable par un test, un build ou une lecture du code.

---

## Corrections appliquées pendant l'audit

| Prio | Fichier | Problème | Impact | Solution |
| --- | --- | --- | --- | --- |
| P1 | `apps/api/src/services/payService.ts` | `createPayout` passait `merchant.id` à `availableBalance(organizationId)` | Solde toujours 0 → **tout payout rejeté 409**, même avec encaissement | Passage du bon identifiant + test d'intégration (409 insuffisant → 201 après encaissement) |
| P1 | `packages/config/src/index.ts` + `services/workers` | `QUEUE_DRIVER` par défaut `bullmq` : sans Redis, `queue.add()` **pendant indéfiniment** (offline queue ioredis) | Toute requête jobs pouvait bloquer le serveur | Défaut `memory` ; producteur BullMQ avec `enableOfflineQueue:false` → **échec rapide honnête (503)** si Redis absent |
| P2 | `apps/api/src/services/jobService.ts` + routes jobs | `GET /v1/jobs/:jobId` sans vérification d'appartenance | Un utilisateur authentifié pouvait lire le résultat (compteurs) du job d'une autre org | `organizationId` stocké sur le job + contrôle `organization_members` → **404** sinon ; test d'intégration anti-fuite ajouté |
| P2 | `apps/web/src/pages/SettingsPage.tsx` | Formulaire profil affichait « Préférences enregistrées ✓ » sans aucune persistance (faux succès) | Contrevient à la règle « aucun faux succès » | Pré-remplissage avec les données réelles de session + sauvegarde locale libellée honnêtement ; boutons de la zone sensible **désactivés** (aucune route de suppression n'existe) |
| P3 | `docs/architecture.md` | Compte de tables inexistant (20 au lieu de 19) | Documentation imprécise | Corrigé (19 tables, liste exacte) |

---

## FRONTEND

**État : MVP.** 14 pages, identité graphique intacte (palette `#04060f`,
`#0a1020`, `#4f8dff`, `#8b5cf6`, `#22d3ee` ; Space Grotesk / Inter /
JetBrains Mono ; navigation inchangée). Pages connectées à des données
réelles : Projects, Code (Forge + Brain), Research (Lab), Amélioration
(Doctor), **Deploy (pipeline réel)**, **Dashboard (projets + analytics réels,
sélecteur démo/live)**, **Analyse (analytics réels paginés)**, **Settings →
NEXUS Pay (adaptateurs, transactions réelles, payout admin)**. Le navigateur
ne parle jamais à PostgreSQL directement (client `lib/api.ts` typé, cookies
same-origin). Responsive : audit automatisé **108/108** (9 breakpoints, zéro
débordement, zéro erreur console).

Réserves honnêtes : Idea, Conception, Library, Test et une partie de
Amélioration restent des **écrans de conception** (données d'exemple du
Prompt 02, non connectées) — voir ERREURS RESTANTES (P2).

## BACKEND

**État : MVP avancé.** Fastify + structure routes/controllers/services/
middleware/schemas/config ; format d'erreur unique enveloppé `error.code` ;
secrets exclusivement par variables d'environnement ; cookies HttpOnly +
`secure` en production + rate limit dédié auth ; guards `requireOrgAccess` /
`requireProjectAccess` systématiques (member/admin/owner). Typecheck
TypeScript **0 erreur** sur tout le monorepo.

## DATABASE

**État : MVP (stack embarquée).** 19 tables, 2 migrations Drizzle (`0001`,
`0002`) — contraintes d'unicité vérifiées : `deployment_stages (deployment_id,
name)`, `merchants (organization_id)`, `payment_providers (code)`,
`transactions (organization_id, idempotency_key)`. Driver embarqué PGlite
(WASM) utilisé ici ; le driver `postgres` existe mais **n'a pas été testé
contre un serveur PostgreSQL réel** (aucun serveur dans le sandbox).

## AUTH

**État : MVP avancé.** Register/login/logout/me, sessions serveur, scoping
systématique, tests multi-tenant (isolation absolue : 404/403 sur org
étrangère, anti-IDOR analytics vérifié par test).

## AI

**État : PROTOTYPE.** Contrat provider OpenAI-compatible complet (timeout,
clé par env, erreurs `AI_PROVIDER_ERROR`/`AI_TIMEOUT` honnêtes) testé avec
un mock. **Aucun provider IA réel n'est joignable ici** — rien n'est
présenté comme fonctionnant en externe.

## AGENTS

**État : MVP.** 7 agents à permissions fermées (union de 11 valeurs),
aucun shell/secrets/fichiers globaux/toutes orgs par construction ; tests.

## FORGE

**État : MVP.** Filesystem virtuel versionné, validation de chemins stricte
(path traversal rejeté et testé : `..`, encodages `%2e/%2f/%5c`, `\0`),
lecture/écriture réelles persistées.

## STUDIO

**État : MVP.** Document de conception JSON versionné, persistance réelle.
Studio ≠ générateur de code (règle respectée).

## LAB

**État : MVP.** Expériences/notes ; source = URL obligatoire, statut
« non vérifié » explicite ; jamais de source inventée.

## DOCTOR

**État : MVP.** Audits réels PASS/WARN/FAIL/NOT_TESTED — le statut
NOT_TESTED est utilisé quand un contrôle ne peut pas être exécuté
(honnêteté) ; exécution réelle exigée pour un PASS.

## JOBS

**État : PROTOTYPE avancé.** Contrat Queue/Job/Worker/JobResult ; job interne
réel `nexus.digest` validé de bout en bout (API 202 → queue → worker →
résultat persisté consultable, vérifié **en live** : `{projects, brainEntries,
analyticsEvents, computedAt}`) ; retry 3, backoff exponentiel ; driver
`memory` (défaut, même contrat) et driver `bullmq` compilé — **non testé
contre un Redis réel** (Redis absent du sandbox). Aucun code utilisateur
dans le worker.

## SANDBOX

**État : PROTOTYPE — ARCHITECTURE_ONLY.** Contrat Policy→Execution→Result
avec bornes validées (CPU, RAM, timeout, filesystem, réseau ; `bridged`
interdit). Drivers `gvisor`/`firecracker`/`local-process` déclarés
`architectureOnly` : toute exécution lève `SandboxUnavailableError`. **Aucun
code non fiable n'est exécuté dans le processus principal**, et l'application
ne prétend pas être sécurisée tant que l'isolation réelle n'existe pas.

## DEPLOY

**État : PROTOTYPE (environnement contrôlé).** Pipeline
`build→test→security→staging→production` persisté avec statuts/début/fin/
logs/erreurs ; étape SECURITY réelle (détection de clés privées/`AKIA`/
certificats, testée : un secret fait échouer le pipeline) ; **production
jamais automatique** — création en `pending`, promotion `confirm:true` admin,
annulation ; re-promotion rejetée 409. Les étapes build/test/staging sont
des simulations honnêtes : **aucun déploiement réel** n'est déclenché.

## ANALYTICS

**État : MVP.** Événements réels persistés ; type/metadata validés ;
environnement `demo|live` obligatoire et **jamais mélangé** (testé) ;
pagination (max 100/page) ; métriques agrégées (total, par type, par jour,
≤ 90 jours) ; anti-IDOR projet↔org (404 testé) ; Dashboard + Analyse
connectés avec sélecteur d'environnement.

## NEXUS PAY

**État : PROTOTYPE (métier complet, intégrations externes absentes).** Chaîne
Provider→Router→TransactionEngine→FeeEngine→Ledger→Webhook→Reconciliation→
Payout implémentée et testée : commission **350 bps côté serveur**
(100 000 → 3 500 → 96 500, testé) ; idempotence `(org, clé)` (replay 200,
un seul enregistrement, testé) ; **aucune donnée de carte** (schémas
`.strict()` — `pan`/`cvv` rejetés 400, testé) ; webhook HMAC-SHA256 en temps
constant (401 sans signature valide, rejeu idempotent, testé) ; grand livre
en partie double équilibré (testé) ; réconciliation matched/unknown/
mismatched (testé) ; payouts tokenisés admin, solde insuffisant → 409
(testé). Les 5 adaptateurs (Mixx by Yas, Moov Money, Wave, MTN Money, Carte)
sont des **abstractions `configured:false`** : aucune API réelle n'est appelée
ni simulée comme fonctionnante ; aucun paiement réel n'a été testé.

## SECURITY

- Secrets : uniquement via env (`.env.example` documenté, rien en dur —
  balayage `grep` négatif).
- Isolation tenant : systématique (projects/brain/files/studio/lab/audits/
  analytics/pay/deployments/jobs) — y compris `availableBalance` scopée org
  et scoping des jobs ajouté à l'audit.
- Webhooks pay : signature obligatoire + temps constant ; routes publiques
  limitées à `/health` et au webhook signé.
- Cookies : HttpOnly, SameSite=Lax, Secure selon `cookieSecure` (production).
- Rate limit global + dédié auth ; CORS en liste explicite (jamais `*`).
- Pas de `eval`/`child_process` dans l'API ; code utilisateur jamais exécuté
  sans sandbox (qui est ARCHITECTURE_ONLY → donc jamais exécuté).
- Path traversal : validation stricte + tests.

## TESTS

**114 tests, 114 réussis, 0 échoué** (14 fichiers : 8 intégration API sur
base embarquée réelle, 4 unitaires, 1 interface jsdom, 1 contrats/core).
Typecheck **0 erreur**. Audit responsive **108/108**. Persistance E2E validée
en live (projet → déploiement → événement → transaction → job digest).

## BUILD

`build:packages` (8 packages) ✓ — `npm run build` (web) ✓ — 2 migrations
appliquées au boot ✓. Travail isolé : `node_modules` hors snapshot, aucune
donnée générée committée.

## Intégrations externes à configurer (aucune prétendue fonctionnante)

1. **Redis** (`REDIS_URL` + `QUEUE_DRIVER=bullmq`) — file persistante.
2. **PostgreSQL serveur** (`DATABASE_URL` + `DB_DRIVER=postgres`) — non testé
   contre un serveur réel.
3. **Provider IA** (`AI_BASE_URL`/`AI_API_KEY`) — mock uniquement à ce jour.
4. **Providers paiement** (Mixx by Yas, Moov Money, Wave, MTN Money, carte) —
   adaptateurs en attente d'identifiants ; `PAY_WEBHOOK_SECRET` fort requis.
5. **Isolation sandbox réelle** (gVisor ou Firecracker) — ARCHITECTURE_ONLY.
6. **Secrets de production** (`COOKIE_SECRET`, `PAY_WEBHOOK_SECRET`).

## ERREURS RESTANTES

| Prio | Fichier | Problème | Impact | Solution |
| --- | --- | --- | --- | --- |
| P2 | `IdeaPage`, `ConceptionPage`, `LibraryPage`, `TestPage`, part de `AmeliorationPage` | Écrans de conception alimentés par `data/mock` (données d'exemple du Prompt 02) | Risque de confusion démo/réel | Les connecter (même schéma que les pages déjà branchées) ou les étiqueter explicitement « aperçu de conception » |
| P2 | Driver BullMQ | Jamais exécuté contre un Redis réel (indisponible dans le sandbox) | Comportement production non constaté | Tester sur un environnement avec Redis avant toute mise en production |
| P2 | `DB_DRIVER=postgres` | Non testé contre un serveur PostgreSQL réel | Migrations/SQL non constatés sur PG natif | Exécuter la suite d'intégration avec `DB_DRIVER=postgres` sur un serveur réel |
| P3 | Driver `memory` jobs | Jobs non persistants (perdus au redémarrage), non visibles entre processus | Suivi de jobs limité hors Redis | Utiliser `QUEUE_DRIVER=bullmq` en production (défaut déjà `memory` volontairement) |
| P3 | `GET /v1/pay/payouts` (liste) absente | L'interface ne peut pas lister les payouts (seule création) | Suivi des retraits incomplet | Ajouter la route paginée scopée org + panneau UI |
| P3 | `x-org-id` sur `POST /v1/pay/transactions` | Repli sur la première org de l'utilisateur si l'en-tête manque | UX multi-org perfectible | Sélecteur d'organisation explicite dans l'UI Pay |

## Maturité globale justifiée

**MVP — démonstration complète et honnête sur stack embarquée** (et non
PRÉ-PRODUCTION), car :

- Tout ce qui est présenté comme réel l'est réellement (auth, multi-tenant,
  projets, Brain, Forge, Studio, Lab, Doctor, analytics, chaîne pay métier,
  pipeline deploy contrôlé, job digest) — couvert par 114 tests verts.
- Trois piliers de production ne sont **pas** validés ici : Redis réel,
  PostgreSQL serveur réel, isolation sandbox réelle — ils sont explicitement
  marqués comme à configurer/plutôt que prétendus fonctionnants.
- Les paiements n'encaissent rien tant qu'aucun provider n'est configuré :
  c'est documenté dans l'interface elle-même.

Passage à PRÉ-PRODUCTION attendu une fois : Redis + PostgreSQL réels testés,
providers paiement configurés (webhooks signés), sandbox réelle branchée,
écrans de conception restants connectés.
