import { and, count, desc, eq, sql } from 'drizzle-orm';
import { ERROR_CODES, type Idea } from '@nexus/contracts';
import type { Database } from '@nexus/db';
import { ideas } from '@nexus/db';
import { AppError } from '../middleware/errors.js';

function toIdea(row: typeof ideas.$inferSelect): Idea {
  return {
    id: row.id,
    organizationId: row.organizationId,
    createdBy: row.createdBy,
    title: row.title,
    detail: row.detail,
    tags: row.tags ?? [],
    votes: row.votes,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * NEXUS Ideas — capture d'idées RÉELLE et persistante.
 * Isolation stricte par organisation ; votes atomiques côté serveur.
 */
export function createIdeaService(db: Database) {
  return {
    async create(organizationId: string, userId: string, input: { title: string; detail: string; tags: string[] }): Promise<Idea> {
      const [row] = await db
        .insert(ideas)
        .values({
          organizationId,
          createdBy: userId,
          title: input.title,
          detail: input.detail,
          tags: input.tags,
        })
        .returning();
      if (!row) throw new AppError(500, ERROR_CODES.INTERNAL_ERROR, 'Création de l’idée impossible.');
      return toIdea(row);
    },

    async list(
      organizationId: string,
      query: { status?: 'nouveau' | 'evalue' | 'valide'; page: number; limit: number },
    ): Promise<{ data: Idea[]; page: number; limit: number; total: number; totalPages: number }> {
      const where = query.status
        ? and(eq(ideas.organizationId, organizationId), eq(ideas.status, query.status))
        : eq(ideas.organizationId, organizationId);
      const [rows, totals] = await Promise.all([
        db.select().from(ideas).where(where).orderBy(desc(ideas.votes), desc(ideas.createdAt)).limit(query.limit).offset((query.page - 1) * query.limit),
        db.select({ value: count() }).from(ideas).where(where),
      ]);
      const total = Number(totals[0]?.value ?? 0);
      return {
        data: rows.map(toIdea),
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      };
    },

    /** Vote atomique : incrément en base, jamais côté client. */
    async vote(organizationId: string, ideaId: string): Promise<Idea> {
      const [row] = await db
        .update(ideas)
        .set({ votes: sql`${ideas.votes} + 1`, updatedAt: new Date() })
        .where(and(eq(ideas.id, ideaId), eq(ideas.organizationId, organizationId)))
        .returning();
      if (!row) throw new AppError(404, ERROR_CODES.NOT_FOUND, 'Idée introuvable.');
      return toIdea(row);
    },
  };
}

export type IdeaService = ReturnType<typeof createIdeaService>;
