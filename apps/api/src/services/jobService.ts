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
      async cancel(jobId: string, userId: string): Promise<'cancelled' | 'not_cancellable' | 'not_found'> {
        const record = queue.get(jobId);
        if (!record) return 'not_found';
        // Admin requis (cohérent deploy/pay) — vérifié ICI : l'org du job
        // n'est connue qu'après lecture du record (aucune fuite croisée).
        const role = await memberRole(db, record.organizationId, userId);
        if (role === null) return 'not_found';
        if (role === 'member') return 'not_cancellable';
        return queue.cancel(jobId) ? 'cancelled' : 'not_cancellable';
      },

      async getStatus(jobId: string, userId: string): Promise<JobView | null> {
        const record = queue.get(jobId);
        // Scoping tenant : seul un membre de l'organisation voit le job.
        if (!record || (await memberRole(db, record.organizationId, userId)) === null) return null;
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
    async cancel(jobId: string, userId: string): Promise<'cancelled' | 'not_cancellable' | 'not_found'> {
      try {
        const job = await queue.getJob(jobId);
        if (!job) return 'not_found';
        const role = await memberRole(db, (job.data as DigestPayload).organizationId, userId);
        if (role === null) return 'not_found';
        if (role === 'member') return 'not_cancellable';
        const state = await job.getState();
        if (state !== 'waiting' && state !== 'delayed') return 'not_cancellable';
        await job.remove();
        return 'cancelled';
      } catch {
        throw new AppError(503, ERROR_CODES.INTERNAL_ERROR, 'File de jobs indisponible (Redis injoignable).');
      }
    },

    async getStatus(jobId: string, userId: string): Promise<JobView | null> {
      try {
        const job = await queue.getJob(jobId);
        if (!job || (await memberRole(db, (job.data as DigestPayload).organizationId, userId)) === null) return null;
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

type OrgRole = 'owner' | 'admin' | 'member';

/** Rôle de l'utilisateur dans l'organisation (null si externe) : base du scoping des jobs. */
async function memberRole(db: Database, organizationId: string, userId: string): Promise<OrgRole | null> {
  const rows = await db
    .select({ role: organizationMembers.role })
    .from(organizationMembers)
    .where(and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.userId, userId)))
    .limit(1);
  return (rows[0]?.role as OrgRole | undefined) ?? null;
}

/** Compteur utilitaire partagé (tests). */
export async function countOrgProjects(db: Database, organizationId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(projects)
    .where(and(eq(projects.organizationId, organizationId)));
  return Number(row?.value ?? 0);
}
