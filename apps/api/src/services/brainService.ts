import { and, desc, eq } from 'drizzle-orm';
import { brainEntrySchema, type BrainEntry, type CreateBrainEntryInput } from '@nexus/contracts';
import type { Database } from '@nexus/db';
import { brainEntries } from '@nexus/db';
import { AppError } from '../middleware/errors.js';
import { ERROR_CODES } from '@nexus/contracts';

/** NEXUS Brain — mémoire structurée d'un projet, isolée par organisation. */
export function createBrainService(db: Database) {
  return {
    async list(projectId: string, kind?: BrainEntry['kind']): Promise<BrainEntry[]> {
      const where = kind
        ? and(eq(brainEntries.projectId, projectId), eq(brainEntries.kind, kind))
        : eq(brainEntries.projectId, projectId);
      const rows = await db
        .select()
        .from(brainEntries)
        .where(where)
        .orderBy(desc(brainEntries.createdAt));
      return rows.map((row) =>
        brainEntrySchema.parse({
          ...row,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        }),
      );
    },

    async create(projectId: string, userId: string, input: CreateBrainEntryInput): Promise<BrainEntry> {
      const [row] = await db
        .insert(brainEntries)
        .values({ projectId, kind: input.kind, title: input.title, content: input.content, createdBy: userId })
        .returning();
      if (!row) {
        throw new AppError(500, ERROR_CODES.INTERNAL_ERROR, 'Création de l’entrée Brain impossible.');
      }
      return brainEntrySchema.parse({
        ...row,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      });
    },

    async remove(projectId: string, entryId: string): Promise<void> {
      const deleted = await db
        .delete(brainEntries)
        .where(and(eq(brainEntries.id, entryId), eq(brainEntries.projectId, projectId)))
        .returning({ id: brainEntries.id });
      if (deleted.length === 0) {
        throw new AppError(404, ERROR_CODES.NOT_FOUND, 'Entrée Brain introuvable.');
      }
    },
  };
}

export type BrainService = ReturnType<typeof createBrainService>;
