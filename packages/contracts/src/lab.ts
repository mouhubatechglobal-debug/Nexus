import { z } from 'zod';

/** Éléments de NEXUS Lab, rattachés à un projet. */
export const labKindSchema = z.enum([
  'experiment',
  'hypothesis',
  'question',
  'result',
  'source',
  'note',
  'conclusion',
]);
export type LabKind = z.infer<typeof labKindSchema>;

export const labEntrySchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  kind: labKindSchema,
  title: z.string(),
  content: z.string(),
  /** URL de la source — obligatoire pour kind=source. */
  sourceUrl: z.string().nullable(),
  sourceLabel: z.string().nullable(),
  /**
   * Traçabilité : `false` par défaut. Une donnée non vérifiée est
   * explicitement marquée — JAMAIS présentée comme un fait établi.
   */
  verified: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type LabEntry = z.infer<typeof labEntrySchema>;

export const createLabEntrySchema = z
  .object({
    kind: labKindSchema,
    title: z.string().trim().min(2).max(140),
    content: z.string().trim().min(1).max(8000),
    sourceUrl: z.string().url('URL de source invalide').max(500).optional(),
    sourceLabel: z.string().trim().max(120).optional(),
    verified: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    // Aucune source inventée : une entrée « source » DOIT porter une URL.
    if (value.kind === 'source' && !value.sourceUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sourceUrl'],
        message: 'Une source doit obligatoirement référencer une URL vérifiable',
      });
    }
    // Une donnée ne peut être marquée vérifiée qu'avec une source vérifiable.
    if (value.verified && !value.sourceUrl) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['verified'],
        message: 'Impossible de marquer vérifié sans URL de source',
      });
    }
  });
export type CreateLabEntryInput = z.infer<typeof createLabEntrySchema>;
