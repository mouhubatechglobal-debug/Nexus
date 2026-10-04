import { z } from 'zod';

/** Nœud du filesystem virtuel d'un projet (NEXUS Forge). */
export const fileNodeSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  path: z.string(),
  name: z.string(),
  isDirectory: z.boolean(),
  mime: z.string(),
  size: z.number().int().nonnegative(),
  version: z.number().int().positive(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type FileNode = z.infer<typeof fileNodeSchema>;

/** Contenu d'un fichier (lecture). */
export const fileContentSchema = fileNodeSchema.extend({
  content: z.string(),
});
export type FileContent = z.infer<typeof fileContentSchema>;

export const createFileSchema = z.object({
  path: z.string().min(1).max(256),
  type: z.enum(['file', 'directory']).default('file'),
  content: z.string().max(256_000).optional(),
  mime: z.string().max(100).optional(),
});
export type CreateFileInput = z.infer<typeof createFileSchema>;

export const updateFileSchema = z.object({
  path: z.string().min(1).max(256),
  content: z.string().max(256_000),
});
export type UpdateFileInput = z.infer<typeof updateFileSchema>;

export const renameFileSchema = z.object({
  path: z.string().min(1).max(256),
  newPath: z.string().min(1).max(256),
});
export type RenameFileInput = z.infer<typeof renameFileSchema>;

/** Version historisée d'un fichier. */
export const fileVersionSchema = z.object({
  version: z.number().int().positive(),
  content: z.string(),
  createdAt: z.string(),
});
export type FileVersion = z.infer<typeof fileVersionSchema>;
