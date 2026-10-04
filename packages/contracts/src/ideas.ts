import { z } from 'zod';

/**
 * NEXUS Ideas — capture d'idées avant transformation en projet.
 * RÉEL : table `ideas` scopée par organisation, votes atomiques.
 */

export const ideaStatusSchema = z.enum(['nouveau', 'evalue', 'valide']);
export type IdeaStatus = z.infer<typeof ideaStatusSchema>;

export const ideaSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  createdBy: z.string().uuid(),
  title: z.string(),
  detail: z.string(),
  tags: z.array(z.string()),
  votes: z.number().int().nonnegative(),
  status: ideaStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Idea = z.infer<typeof ideaSchema>;

export const createIdeaSchema = z.object({
  organizationId: z.string().uuid(),
  title: z.string().trim().min(3, 'Titre : au moins 3 caractères').max(120),
  detail: z.string().trim().max(1_000).default(''),
  tags: z
    .array(z.string().trim().min(1).max(24))
    .max(4, 'Au plus 4 tags')
    .default([]),
});
export type CreateIdeaInput = z.infer<typeof createIdeaSchema>;

export const listIdeasQuerySchema = z.object({
  organizationId: z.string().uuid(),
  status: ideaStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
