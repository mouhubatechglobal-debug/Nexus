/**
 * Prérequis techniques BullMQ/Redis pour les workers NEXUS.
 *
 * Cette étape ne définit aucun traitement métier : seules les briques
 * de connexion et de création de files sont fournies, sans effet de bord
 * à l'import (aucune connexion ouverte tant que les fabriques ne sont
 * pas appelées).
 */
import { Queue, Worker, type ConnectionOptions, type Job, type Processor } from 'bullmq';
import { Redis } from 'ioredis';

/** Noms canoniques des files (source de vérité partagée). */
export const QUEUE_NAMES = {
  tasks: 'nexus.tasks',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

/** Options de connexion BullMQ à partir d'une URL Redis. */
export function connectionOptions(redisUrl: string): ConnectionOptions {
  return {
    url: redisUrl,
    // Un worker doit attendre les jobs indéfiniment sans abandonner la connexion.
    maxRetriesPerRequest: null,
  };
}

/** Crée (sans connecter) un client Redis brut. */
export function createRedis(redisUrl: string): Redis {
  return new Redis(redisUrl, { maxRetriesPerRequest: null, lazyConnect: true });
}

/** Crée une file BullMQ productrice. */
export function createQueue(name: QueueName | string, redisUrl: string): Queue {
  return new Queue(name, { connection: connectionOptions(redisUrl) });
}

export interface CreateWorkerOptions {
  concurrency?: number;
}

/** Fabrique typée autour de `Worker` de BullMQ (paramétrage commun futur). */
export function createWorker<T, R>(
  name: QueueName | string,
  redisUrl: string,
  processor: Processor<T, R>,
  options: CreateWorkerOptions = {},
): Worker<T, R> {
  return new Worker<T, R>(name, processor, {
    connection: connectionOptions(redisUrl),
    concurrency: options.concurrency ?? 1,
  });
}

export type { Job };
