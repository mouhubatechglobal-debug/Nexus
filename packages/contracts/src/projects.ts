import { z } from 'zod';

export const projectStatusSchema = z.enum(['draft', 'active', 'archived']);
export type ProjectStatus = z.infer<typeof projectStatusSchema>;

export const projectSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  status: projectStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Project = z.infer<typeof projectSchema>;

export const createProjectSchema = z.object({
  organizationId: z.string().uuid('Identifiant d’organisation invalide'),
  name: z.string().trim().min(2, 'Nom du projet trop court').max(80),
  description: z.string().trim().max(500).optional(),
});
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    description: z.string().trim().max(500).nullable(),
    status: projectStatusSchema,
  })
  .partial();
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

export const listProjectsQuerySchema = z.object({
  organizationId: z.string().uuid(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(80).optional(),
  status: projectStatusSchema.optional(),
});
export type ListProjectsQuery = z.infer<typeof listProjectsQuerySchema>;

/** Page standardisée — toute liste paginée de l'API utilise ce format. */
export const paginatedSchema = z.object({
  data: z.array(z.unknown()),
  page: z.number().int(),
  limit: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});
export type Paginated<T> = {
  data: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};
