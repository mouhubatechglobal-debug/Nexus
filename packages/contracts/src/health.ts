import { z } from 'zod';

/** État d'une dépendance externe (base de données, Redis…). */
export const componentStatusSchema = z.enum(['up', 'down', 'unknown']);
export type ComponentStatus = z.infer<typeof componentStatusSchema>;

/** Réponse standardisée du endpoint `GET /health` de l'API. */
export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  service: z.string(),
  version: z.string(),
  uptimeSeconds: z.number().nonnegative(),
  timestamp: z.string(),
  checks: z.object({
    database: componentStatusSchema,
    redis: componentStatusSchema,
  }),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
