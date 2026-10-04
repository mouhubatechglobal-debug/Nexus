import { z } from 'zod';

/** Catégories de la mémoire structurée d'un projet (NEXUS Brain). */
export const brainKindSchema = z.enum([
  'context',
  'objective',
  'constraint',
  'decision',
  'architecture',
  'preference',
  'knowledge',
  'info',
]);
export type BrainKind = z.infer<typeof brainKindSchema>;

export const brainEntrySchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  kind: brainKindSchema,
  title: z.string(),
  content: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type BrainEntry = z.infer<typeof brainEntrySchema>;

export const createBrainEntrySchema = z.object({
  kind: brainKindSchema,
  title: z.string().trim().min(2, 'Titre trop court').max(120),
  content: z.string().trim().min(1, 'Contenu requis').max(8000),
});
export type CreateBrainEntryInput = z.infer<typeof createBrainEntrySchema>;
