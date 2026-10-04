import { z } from 'zod';
import { componentStatusSchema } from './health.js';

/** Réponse du endpoint `GET /ready` (readiness probe). */
export const readyResponseSchema = z.object({
  status: z.enum(['ready', 'unavailable']),
  service: z.string(),
  version: z.string(),
  timestamp: z.string(),
  checks: z.object({
    database: componentStatusSchema,
  }),
});

export type ReadyResponse = z.infer<typeof readyResponseSchema>;
