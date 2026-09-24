import { z } from 'zod';

/**
 * Environnements analytics — DEMO et LIVE sont strictement séparés :
 * toute lecture/écoute porte un environnement explicite, jamais les deux.
 */
export const analyticsEnvironmentSchema = z.enum(['demo', 'live']);
export type AnalyticsEnvironment = z.infer<typeof analyticsEnvironmentSchema>;

/** Métadonnées validées : objet plat, ≤ 25 clés, valeurs primitives. */
export const analyticsMetadataSchema = z
  .record(z.string().max(60), z.union([z.string().max(300), z.number(), z.boolean(), z.null()]))
  .refine((value) => Object.keys(value).length <= 25, 'Trop de clés de métadonnées (25 max)');

export const recordAnalyticsEventSchema = z.object({
  organizationId: z.string().uuid(),
  projectId: z.string().uuid().optional(),
  type: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[a-z][a-z0-9._-]*$/, 'Type d’événement invalide (kebab/dot case)'),
  environment: analyticsEnvironmentSchema,
  metadata: analyticsMetadataSchema.default({}),
});
export type RecordAnalyticsEventInput = z.infer<typeof recordAnalyticsEventSchema>;

export const analyticsEventSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  projectId: z.string().uuid().nullable(),
  type: z.string(),
  environment: analyticsEnvironmentSchema,
  metadata: z.record(z.string(), z.unknown()),
  occurredAt: z.string(),
});
export type AnalyticsEvent = z.infer<typeof analyticsEventSchema>;

export const analyticsEventsQuerySchema = z.object({
  organizationId: z.string().uuid(),
  environment: analyticsEnvironmentSchema,
  projectId: z.string().uuid().optional(),
  type: z.string().max(60).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const analyticsMetricsQuerySchema = z.object({
  organizationId: z.string().uuid(),
  environment: analyticsEnvironmentSchema,
  days: z.coerce.number().int().min(1).max(90).default(7),
});

/** Métriques agrégées — jamais de mélange DEMO/LIVE (env obligatoire). */
export const analyticsMetricsSchema = z.object({
  environment: analyticsEnvironmentSchema,
  totalEvents: z.number().int().nonnegative(),
  byType: z.array(z.object({ type: z.string(), count: z.number().int().nonnegative() })),
  daily: z.array(z.object({ day: z.string(), count: z.number().int().nonnegative() })),
});
export type AnalyticsMetrics = z.infer<typeof analyticsMetricsSchema>;
