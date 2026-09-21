import { z } from 'zod';

/** Nom canoniques des files BullMQ. */
export const QUEUE_NAMES = {
  digest: 'nexus.digest',
} as const;

/** Job interne réel : agrège un instantané de plateforme par organisation. */
export const digestPayloadSchema = z.object({
  organizationId: z.string().uuid(),
  requestedBy: z.string().uuid(),
});
export type DigestPayload = z.infer<typeof digestPayloadSchema>;

export const digestResultSchema = z.object({
  projects: z.number().int().nonnegative(),
  brainEntries: z.number().int().nonnegative(),
  analyticsEvents: z.number().int().nonnegative(),
  computedAt: z.string(),
});
export type DigestResult = z.infer<typeof digestResultSchema>;

/** Cycle de vie d'un job (statut + progression + erreurs). */
export const jobStatusSchema = z.enum(['queued', 'running', 'completed', 'failed']);
export type JobStatus = z.infer<typeof jobStatusSchema>;

export const jobViewSchema = z.object({
  jobId: z.string(),
  queue: z.string(),
  status: jobStatusSchema,
  progress: z.number().int().min(0).max(100),
  attempts: z.number().int().nonnegative(),
  result: digestResultSchema.nullable(),
  error: z.string().nullable(),
});
export type JobView = z.infer<typeof jobViewSchema>;

/** Résultat normalisé d'un job. */
export interface JobResult<T = unknown> {
  jobId: string;
  status: JobStatus;
  result: T | null;
  error: string | null;
}

/**
 * Politique de retry/backoff (BullMQ) : 3 tentatives, backoff
 * exponentiel 1 s → 2 s → 4 s.
 */
export const JOB_RETRY_POLICY = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 1_000 },
  removeOnComplete: { age: 3_600, count: 500 },
  removeOnFail: { age: 86_400 },
} as const;
