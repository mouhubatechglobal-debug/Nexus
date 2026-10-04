# Canaux de messagerie — copilote (étape 1)

Architecture et règles du module `@nexus/channels`. Synthétique volontairement.

## Statuts réels (à la livraison étape 1)

| Canal    | Réception webhook            | Envoi                         |
| -------- | ---------------------------- | ----------------------------- |
| mock     | RÉEL (testé en CI)           | RÉEL (en mémoire, testé)      |
| telegram | code RÉEL, exécution BLOCKED (sandbox sans Internet + `TELEGRAM_BOT_TOKEN` requis) | idem |
| whatsapp | code RÉEL (signature testée), exécution BLOCKED (accès Meta requis) | idem |

BLOCKED = dépendance externe absente. Commandes d'activation :
`TELEGRAM_BOT_TOKEN` (Bot API officielle), `WHATSAPP_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID` (Cloud API officielle).

## Architecture

```
Provider → POST /v1/channels/webhooks/:channel
             1. verifySignature (HMAC, temps constant)  → 401 si invalide
             2. parseWebhook → InboundMessage           → 400 si malformé
             3. ChannelService.handleInbound            → doublon ignoré
             4. réponse envoyée via adapter.send
```

- `services/channels/src/adapter.ts` — adaptateurs (contrat : verifySignature/parseWebhook/send/sendTemplate).
- `services/channels/src/service.ts` — liaison, idempotence, consentement, commandes, journal d'accès.
- `services/channels/src/i18n.ts` — FR par défaut, EN disponible (aucune chaîne codée en dur).
- `apps/api/src/routes/v1/channels.ts` — routes (webhooks + liaison web + diagnostic).

## Tables (migration `0004_*`)

- `channel_identities` — liaison tenant↔compte externe, UNIQUE (canal, external_id), consentement.
- `channel_seen_messages` — **idempotence globale** : réservation atomique de l'identifiant externe AVANT toute résolution d'identité (un rejeu n'est jamais traité deux fois, même pendant la liaison). Sans FK, sans contenu.
- `channel_messages` — **métadonnées uniquement** (jamais le contenu) ; UNIQUE (direction, external_message_id) = double filet au niveau tenant.
- `channel_link_codes` — code 6 chiffres, usage unique, 10 min.
- `deletion_requests` — demandes /supprimer (scope canal ou tout).
- `access_logs` — action + IP **hachée** (SHA-256 + sel), jamais de contenu.

## Liaison par code (app web → bot)

1. L'utilisateur génère un code : `POST /v1/channels/link-codes` (session + rôle member requis).
2. Il envoie le code depuis SA messagerie au bot (message texte à 6 chiffres).
3. `consumeLinkCode` rattache l'identité externe au tenant de l'utilisateur (usage unique).
   Code invalide/expiré/réutilisé → réponse neutre, aucun indice.

## Commandes bot

`/aide` (aide), `/export` (compteurs de métadonnées), `/supprimer` (→ `deletion_requests`), `/stop` (révocation du consentement). Un expéditeur sans consentement `granted` n'est jamais destinataire d'un envoi.

## Règles WhatsApp (Cloud API)

- **Fenêtre 24 h** : un message libre n'est autorisé que dans les 24 h après le dernier message de l'utilisateur. Hors fenêtre, `sendTo` lève `WHATSAPP_WINDOW_EXPIRED` → utiliser `sendTemplate` avec un **modèle approuvé côté Meta** (rappels hors fenêtre, étape 3).
- Signature entrante obligatoire : `x-hub-signature-256` (HMAC-SHA256 du corps brut avec l'App Secret).

## Secrets (environnement uniquement, jamais en dépôt)

`CHANNEL_MOCK_SECRET`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_BOT_TOKEN`,
`WHATSAPP_APP_SECRET`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`.
Diagnostic honnête : `GET /v1/channels/diagnostic` (session requise) — `ok` seulement si le token est réellement présent, sinon `blocked` + raison.

## Limites connues (honnêtes)

- Voix : kind reconnu ; **transcription non implémentée** (option étape 2, avec fournisseur OCR/STT à choisir).
- Les accusés de réception sont honnêtes : le rangement/extraction arrive à l'étape 2 (@nexus/vault).
- Les webhooks Telegram/WhatsApp ne peuvent pas être exécutés dans ce sandbox (pas d'Internet, pas de token) — code testé via les adaptateurs au mock et signatures réelles calculées en tests.
