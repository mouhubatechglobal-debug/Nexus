import { and, desc, eq } from 'drizzle-orm';
import {
  designVersionSchema,
  labEntrySchema,
  type CreateLabEntryInput,
  type DesignDocument,
  type DesignVersion,
  type LabEntry,
} from '@nexus/contracts';
import type { Database } from '@nexus/db';
import { labEntries, studioDesigns } from '@nexus/db';
import { AppError } from '../middleware/errors.js';
import { ERROR_CODES } from '@nexus/contracts';

/** NEXUS Studio — document de conception JSON versionnable. */
export function createStudioService(db: Database) {
  return {
    /** Dernière version du document (null si aucun). */
    async latest(projectId: string): Promise<DesignVersion | null> {
      const rows = await db
        .select()
        .from(studioDesigns)
        .where(eq(studioDesigns.projectId, projectId))
        .orderBy(desc(studioDesigns.version))
        .limit(1);
      const row = rows[0];
      if (!row) return null;
      return designVersionSchema.parse({
        version: row.version,
        data: row.data,
        createdAt: row.createdAt.toISOString(),
      });
    },

    /** Liste des versions (sans les données complètes). */
    async versions(projectId: string): Promise<{ version: number; createdAt: string }[]> {
      const rows = await db
        .select({ version: studioDesigns.version, createdAt: studioDesigns.createdAt })
        .from(studioDesigns)
        .where(eq(studioDesigns.projectId, projectId))
        .orderBy(desc(studioDesigns.version));
      return rows.map((row) => ({ version: row.version, createdAt: row.createdAt.toISOString() }));
    },

    /** Récupère une version précise. */
    async atVersion(projectId: string, version: number): Promise<DesignVersion> {
      const rows = await db
        .select()
        .from(studioDesigns)
        .where(and(eq(studioDesigns.projectId, projectId), eq(studioDesigns.version, version)))
        .limit(1);
      const row = rows[0];
      if (!row) {
        throw new AppError(404, ERROR_CODES.NOT_FOUND, 'Version de design introuvable.');
      }
      return designVersionSchema.parse({
        version: row.version,
        data: row.data,
        createdAt: row.createdAt.toISOString(),
      });
    },

    /** Sauvegarde : crée une NOUVELLE version (jamais d'écrasement). */
    async save(projectId: string, userId: string, data: DesignDocument): Promise<DesignVersion> {
      const previous = await db
        .select({ version: studioDesigns.version })
        .from(studioDesigns)
        .where(eq(studioDesigns.projectId, projectId))
        .orderBy(desc(studioDesigns.version))
        .limit(1);
      const nextVersion = (previous[0]?.version ?? 0) + 1;

      const [row] = await db
        .insert(studioDesigns)
        .values({ projectId, version: nextVersion, data, createdBy: userId })
        .returning();
      if (!row) {
        throw new AppError(500, ERROR_CODES.INTERNAL_ERROR, 'Sauvegarde Studio impossible.');
      }
      return designVersionSchema.parse({
        version: row.version,
        data: row.data,
        createdAt: row.createdAt.toISOString(),
      });
    },
  };
}

export type StudioService = ReturnType<typeof createStudioService>;

/** NEXUS Lab — expériences, hypothèses, sources, notes, conclusions. */
export function createLabService(db: Database) {
  return {
    async list(projectId: string, kind?: LabEntry['kind']): Promise<LabEntry[]> {
      const where = kind
        ? and(eq(labEntries.projectId, projectId), eq(labEntries.kind, kind))
        : eq(labEntries.projectId, projectId);
      const rows = await db.select().from(labEntries).where(where).orderBy(desc(labEntries.createdAt));
      return rows.map(toEntry);
    },

    async create(projectId: string, userId: string, input: CreateLabEntryInput): Promise<LabEntry> {
      const [row] = await db
        .insert(labEntries)
        .values({
          projectId,
          kind: input.kind,
          title: input.title,
          content: input.content,
          sourceUrl: input.sourceUrl ?? null,
          sourceLabel: input.sourceLabel ?? null,
          // Non vérifié par défaut ; vérifiable uniquement avec une source.
          verified: input.verified ?? false,
          createdBy: userId,
        })
        .returning();
      if (!row) {
        throw new AppError(500, ERROR_CODES.INTERNAL_ERROR, 'Création Lab impossible.');
      }
      return toEntry(row);
    },
  };
}

type LabRow = typeof labEntries.$inferSelect;

function toEntry(row: LabRow): LabEntry {
  return labEntrySchema.parse({
    id: row.id,
    projectId: row.projectId,
    kind: row.kind,
    title: row.title,
    content: row.content,
    sourceUrl: row.sourceUrl,
    sourceLabel: row.sourceLabel,
    verified: row.verified,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

export type LabService = ReturnType<typeof createLabService>;
