import { z } from 'zod';

/** Catégories d'audit NEXUS Doctor. */
export const auditCategorySchema = z.enum([
  'Performance',
  'SEO',
  'Accessibility',
  'UX',
  'Security',
  'Configuration',
]);
export type AuditCategory = z.infer<typeof auditCategorySchema>;

/**
 * Statut d'un contrôle. `NOT_TESTED` est réservé aux contrôles qui
 * n'ont pas pu être exécutés — JAMAIS un PASS déguisé.
 */
export const auditStatusSchema = z.enum(['PASS', 'WARN', 'FAIL', 'NOT_TESTED']);
export type AuditStatus = z.infer<typeof auditStatusSchema>;

export const auditCheckSchema = z.object({
  id: z.string(),
  category: auditCategorySchema,
  status: auditStatusSchema,
  message: z.string(),
});
export type AuditCheck = z.infer<typeof auditCheckSchema>;

export const auditReportSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  summary: z.object({
    pass: z.number().int().nonnegative(),
    warn: z.number().int().nonnegative(),
    fail: z.number().int().nonnegative(),
    notTested: z.number().int().nonnegative(),
  }),
  results: z.array(auditCheckSchema),
  createdAt: z.string(),
});
export type AuditReport = z.infer<typeof auditReportSchema>;
