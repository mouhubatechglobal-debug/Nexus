import { and, count, eq } from 'drizzle-orm';
import type { Env } from '../config/index.js';
import { AppError } from '../middleware/errors.js';
import { ERROR_CODES } from '@nexus/contracts';
import type { DigestPayload, DigestResult, JobView } from '@nexus/contracts';
import type { Database } from '@nexus/db';
import { analyticsEvents, brainEntries, organizationMembers, projects } from '@nexus/db';
import {
  InProcessQueue,
  createDigestProcessor,
  createQueue,
  QUEUE_NAMES,
  type DigestDeps,
} from '@nexus/workers';

/**
 * Service de jobs : API → Queue → (Redis | mémoire) → Worker → Job → Result.
 * - driver « bullmq » : file BullMQ réelle (Redis requis ; indisponible →
 *   503 honnête, jamais de faux succès) ;
 * - driver « memory » : même contrat en-process (tests/sandbox).
 */
export function createJobService(config: Pick<Env, 'QUEUE_DRIVER' | 'REDIS_URL'>, db: Database) {
  const deps: DigestDeps = {
    async countProjects(organizationId) {
      const [row] = await db.select({ value: count() }).from(projects).where(eq(projects.organizationId, organizationId));
      return Number(row?.value ?? 0);
    },
    async countBrainEntries(organizationId) {
      const [row] = await db
        .select({ value: count() })
        .from(brainEntries)
        .innerJoin(projects, eq(projects.id, brainEntries.projectId))
        .where(eq(projects.organizationId, organizationId));
      return Number(row?.value ?? 0);
    },
    async countAnalyticsEvents(organizationId) {
      const [row] = await db.select({ value: count() }).from(analyticsEvents).where(eq(analyticsEvents.organizationId, organizationId));
      return Number(row?.value ?? 0);
    },
  };

  const processor = createDigestProcessor(deps);

  if (config.QUEUE_DRIVER === 'memory') {
    const queue = new InProcessQueue(QUEUE_NAMES.digest, processor);
    return {
      driver: 'memory' as const,
      async enqueueDigest(payload: DigestPayload): Promise<{ jobId: string }> {
        return queue.enqueue(payload);
      },
      async getStatus(jobId: string, userId: string): Promise<JobView | null> {
        const record = queue.get(jobId);
        // Scoping tenant : seul un membre de l'organisation voit le job.
        if (!record || !(await isMember(db, record.organizationId, userId))) return null;
        return {
          jobId: record.jobId,
          queue: QUEUE_NAMES.digest,
          status: record.status,
          progress: record.progress,
          attempts: record.attempts,
          result: record.result,
          error: record.error,
        };
      },
    };
  }

  // Driver BullMQ — transport réel.
  const queue = createQueue(QUEUE_NAMES.digest, config.REDIS_URL);
  return {
    driver: 'bullmq' as const,
    async enqueueDigest(payload: DigestPayload): Promise<{ jobId: string }> {
      try {
        const job = await queue.add('digest', payload);
        return { jobId: job.id ?? `bullmq_${Date.now()}` };
      } catch {
        throw new AppError(
          503,
          ERROR_CODES.INTERNAL_ERROR,
          'File de jobs indisponible (Redis injoignable).',
        );
      }
    },
    async getStatus(jobId: string, userId: string): Promise<JobView | null> {
      try {
        const job = await queue.getJob(jobId);
        if (!job || !(await isMember(db, (job.data as DigestPayload).organizationId, userId))) return null;
        const state = await job.getState();
        const status = state === 'completed' ? 'completed' : state === 'failed' ? 'failed' : state === 'active' ? 'running' : 'queued';
        return {
          jobId,
          queue: QUEUE_NAMES.digest,
          status,
          progress: Math.round(Number(job.progress ?? 0)),
          attempts: job.attemptsMade,
          result: (job.returnvalue as DigestResult | null) ?? null,
          error: job.failedReason ?? null,
        };
      } catch {
        throw new AppError(503, ERROR_CODES.INTERNAL_ERROR, 'File de jobs indisponible (Redis injoignable).');
      }
    },
  };
}

export type JobService = ReturnType<typeof createJobService>;

/** Appartenance organisation : base du scoping des jobs (aucune fuite croisée). */
async function isMember(db: Database, organizationId: string, userId: string): Promise<boolean> {
  const rows = await db
    .select({ id: organizationMembers.id })
    .from(organizationMembers)
    .where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.userId, userId)))
    .limit(1);
  return rows.length > 0;
}

/** Compteur utilitaire partagé (tests). */
export async function countOrgProjects(db: Database, organizationId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(projects)
    .where(and(eq(projects.organizationId, organizationId)));
  return Number(row?.value ?? 0);
}
