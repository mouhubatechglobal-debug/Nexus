# services/workers — Workers BullMQ

Workers de traitement asynchrone de NEXUS (jobs longs, tâches de fond),
adossés à **Redis + BullMQ**.

## État (Prompt 01)

Contenu volontairement minimal : fabriques de connexion (`createQueue`,
`createWorker`, `createRedis`) et noms de files canoniques (`QUEUE_NAMES`).
Aucun traitement métier — le process worker réel et ses files seront
implémentés dans un prompt ultérieur.

## Démarrage futur

```bash
npm run dev -w @nexus/workers
```
