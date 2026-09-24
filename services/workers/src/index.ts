/**
 * NEXUS Jobs — Queue / Job / Worker / JobResult (Redis + BullMQ).
 *
 * Flux : API → Queue → Redis → Worker → Job → Result.
 * - Driver « bullmq » : transport réel (production, Redis requis) ;
 * - Driver « memory » : MÊME contrat, en-process — utilisé pour les tests
 *   et les environnements sans Redis. Non persistant, jamais en prod.
 *
 * Aucun code utilisateur n'est exécuté ici : seuls des jobs internes
 * déclarés dans le registre le sont (voir services/sandbox pour
 * l'exécution de code tiers — toujours hors processus principal).
 */
import { Queue, Worker, type ConnectionOptions, type Job, type Processor } from 'bullmq';
import { Redis } from 'ioredis';
import {
  digestPayloadSchema,
  digestResultSchema,
  JOB_RETRY_POLICY,
  QUEUE_NAMES,
  type DigestPayload,
  type DigestResult,
  type JobStatus,
} from '@nexus/contracts';

export { QUEUE_NAMES };
export type { DigestPayload, DigestResult, JobStatus };

/** Options de connexion BullMQ depuis une URL Redis. */
export function connectionOptions(redisUrl: string): ConnectionOptions {
  return {
    url: redisUrl,
    // Un worker attend les jobs indéfiniment sans abandonner la connexion.
    maxRetriesPerRequest: null,
  };
}

/** Crée (sans connecter) un client Redis brut. */
export function createRedis(redisUrl: string): Redis {
  return new Redis(redisUrl, { maxRetriesPerRequest: null, lazyConnect: true });
}

/** Crée une file BullMQ productrice avec la politique de retry/backoff. */
export function createQueue(name: string, redisUrl: string): Queue {
  return new Queue(name, {
    connection: {
      ...connectionOptions(redisUrl),
      // Producteur : échec RAPIDE et honnête si Redis est injoignable
      // (pas de file d'attente offline qui ferait pendre la requête API).
      enableOfflineQueue: false,
    },
    defaultJobOptions: { ...JOB_RETRY_POLICY },
  });
}

export interface CreateWorkerOptions {
  concurrency?: number;
}

/** Fabrique typée d'un worker BullMQ (paramétrage commun). */
export function createWorker<T, R>(
  name: string,
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

/* ------------------------- Job interne : digest ----------------------- */

/** Dépendances injectées — le worker reste sans accès direct à la base. */
export interface DigestDeps {
  countProjects(organizationId: string): Promise<number>;
  countBrainEntries(organizationId: string): Promise<number>;
  countAnalyticsEvents(organizationId: string): Promise<number>;
}

/**
 * Processeur du job interne réel `nexus.digest` : agrège un instantané
 * par organisation, avec progression. Validé par tests.
 */
export function createDigestProcessor(deps: DigestDeps) {
  return async function processDigest(payload: DigestPayload, onProgress?: (p: number) => Promise<void> | void): Promise<DigestResult> {
    const input = digestPayloadSchema.parse(payload);
    await onProgress?.(10);
    const projects = await deps.countProjects(input.organizationId);
    await onProgress?.(40);
    const brainEntries = await deps.countBrainEntries(input.organizationId);
    await onProgress?.(70);
    const analyticsEvents = await deps.countAnalyticsEvents(input.organizationId);
    await onProgress?.(100);
    return digestResultSchema.parse({
      projects,
      brainEntries,
      analyticsEvents,
      computedAt: new Date().toISOString(),
    });
  };
}

/** Worker BullMQ prêt pour la production (à démarrer dans services/workers). */
export function startDigestWorker(
  redisUrl: string,
  deps: DigestDeps,
  options: CreateWorkerOptions = {},
): Worker<DigestPayload, DigestResult> {
  const processor = createDigestProcessor(deps);
  return createWorker<DigestPayload, DigestResult>(
    QUEUE_NAMES.digest,
    redisUrl,
    async (job) => processor(job.data, (progress) => job.updateProgress(progress)),
    options,
  );
}

/* ------------------- Driver mémoire (même contrat) -------------------- */

interface MemoryRecord {
  jobId: string;
  organizationId: string;
  status: JobStatus;
  progress: number;
  attempts: number;
  result: DigestResult | null;
  error: string | null;
}

/**
 * File en-process implémentant le même contrat que le driver BullMQ :
 * création, statut, progression, retry/backoff, erreurs. Utilisée pour
 * les tests et le développement sans Redis. JAMAIS en production.
 */
export class InProcessQueue {
  readonly name: string;
  private readonly records = new Map<string, MemoryRecord>();
  private readonly processor: (payload: DigestPayload, onProgress?: (p: number) => Promise<void> | void) => Promise<DigestResult>;
  /** File FIFO réelle : les jobs restent « queued » jusqu'à leur tour. */
  private pending: string[] = [];
  private readonly payloads = new Map<string, DigestPayload>();
  private pumping = false;
  private sequence = 0;

  constructor(name: string, processor: InProcessQueue['processor']) {
    this.name = name;
    this.processor = processor;
  }

  /**
   * Enfile le job (état « queued ») — l'exécution démarre dès que les jobs
   * précédents sont terminés (un worker à la fois, comme BullMQ en
   * concurrency 1). Les échecs respectent la politique de retry.
   */
  async enqueue(payload: DigestPayload): Promise<{ jobId: string }> {
    this.sequence += 1;
    const jobId = `mem_${this.sequence}_${Date.now().toString(36)}`;
    this.records.set(jobId, {
      jobId,
      organizationId: payload.organizationId,
      status: 'queued',
      progress: 0,
      attempts: 0,
      result: null,
      error: null,
    });
    this.pending.push(jobId);
    this.payloads.set(jobId, payload);
    void this.pump();
    return { jobId };
  }

  /**
   * Annule un job EN ATTENTE (jamais un job déjà en exécution —
   * le processor ne peut pas être interrompu en toute sécurité).
   * Renvoie false si le job est inconnu, annulé ou déjà démarré.
   */
  cancel(jobId: string): boolean {
    const record = this.records.get(jobId);
    if (!record || record.status !== 'queued') return false;
    record.status = 'cancelled';
    this.pending = this.pending.filter((id) => id !== jobId);
    this.payloads.delete(jobId);
    return true;
  }

  /** Boucle du worker : un job à la fois, les annulés sont ignorés. */
  private async pump(): Promise<void> {
    if (this.pumping) return;
    this.pumping = true;
    try {
      while (this.pending.length > 0) {
        const jobId = this.pending.shift()!;
        const record = this.records.get(jobId);
        const payload = this.payloads.get(jobId);
        this.payloads.delete(jobId);
        if (!record || !payload || record.status === 'cancelled') continue;
        await this.run(jobId, payload);
      }
    } finally {
      this.pumping = false;
    }
  }

  private async run(jobId: string, payload: DigestPayload): Promise<void> {
    const record = this.records.get(jobId);
    if (!record || record.status === 'cancelled') return;
    record.status = 'running';
    record.attempts += 1;
    try {
      const result = await this.processor(payload, async (progress) => {
        record.progress = progress;
      });
      record.result = result;
      record.status = 'completed';
      record.progress = 100;
    } catch (error) {
      if (record.attempts < JOB_RETRY_POLICY.attempts) {
        // Backoff exponentiel (réel mais réduit pour les tests : délai court).
        const delay = JOB_RETRY_POLICY.backoff.delay * 2 ** (record.attempts - 1);
        record.status = 'queued';
        setTimeout(() => {
          this.pending.push(jobId);
          this.payloads.set(jobId, payload);
          void this.pump();
        }, Math.min(delay, 50));
        return;
      }
      record.status = 'failed';
      record.error = error instanceof Error ? error.message : String(error);
    }
  }

  /** Statut/progression/résultat d'un job. */
  get(jobId: string): MemoryRecord | null {
    return this.records.get(jobId) ?? null;
  }
}
