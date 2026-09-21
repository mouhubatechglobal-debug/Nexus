import { randomBytes } from 'node:crypto';
import { and, asc, count, desc, eq, ilike } from 'drizzle-orm';
import {
  projectSchema,
  type CreateProjectInput,
  type ListProjectsQuery,
  type Project,
  type ProjectStatus,
  type UpdateProjectInput,
} from '@nexus/contracts';
import type { Database } from '@nexus/db';
import { projects } from '@nexus/db';
import { AppError } from '../middleware/errors.js';
import { ERROR_CODES } from '@nexus/contracts';

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'projet'
  );
}

/** Projets réels : CRUD complet, pagination, recherche, isolation tenant. */
export function createProjectService(db: Database) {
  return {
    async create(userId: string, input: CreateProjectInput): Promise<Project> {
      const base = slugify(input.name);
      const slug = `${base}-${randomBytes(2).toString('hex')}`;

      const [row] = await db
        .insert(projects)
        .values({
          organizationId: input.organizationId,
          name: input.name,
          slug,
          description: input.description ?? null,
          status: 'draft',
          createdBy: userId,
        })
        .returning();

      if (!row) {
        throw new AppError(500, ERROR_CODES.INTERNAL_ERROR, 'Création du projet impossible.');
      }
      return projectSchema.parse({
        ...row,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      });
    },

    /** Liste paginée + recherche — l'accès org est vérifié par le garde. */
    async list(query: ListProjectsQuery): Promise<{
      data: Project[];
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    }> {
      const offset = (query.page - 1) * query.limit;
      const conditions = [eq(projects.organizationId, query.organizationId)];
      if (query.q) {
        conditions.push(ilike(projects.name, `%${query.q}%`));
      }
      if (query.status) {
        conditions.push(eq(projects.status, query.status));
      }
      const where = and(...conditions);

      const [rows, totals] = await Promise.all([
        db
          .select()
          .from(projects)
          .where(where)
          .orderBy(desc(projects.updatedAt), asc(projects.name))
          .limit(query.limit)
          .offset(offset),
        db.select({ value: count() }).from(projects).where(where),
      ]);

      const total = totals[0]?.value ?? 0;
      return {
        data: rows.map((row) =>
          projectSchema.parse({
            ...row,
            createdAt: row.createdAt.toISOString(),
            updatedAt: row.updatedAt.toISOString(),
          }),
        ),
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      };
    },

    async get(projectId: string): Promise<Project> {
      const rows = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
      const row = rows[0];
      if (!row) throw new AppError(404, ERROR_CODES.NOT_FOUND, 'Projet introuvable.');
      return projectSchema.parse({
        ...row,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      });
    },

    async update(projectId: string, input: UpdateProjectInput): Promise<Project> {
      const updated = await db
        .update(projects)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(projects.id, projectId))
        .returning();
      const row = updated[0];
      if (!row) throw new AppError(404, ERROR_CODES.NOT_FOUND, 'Projet introuvable.');
      return projectSchema.parse({
        ...row,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      });
    },

    async remove(projectId: string): Promise<void> {
      const deleted = await db.delete(projects).where(eq(projects.id, projectId)).returning({ id: projects.id });
      if (deleted.length === 0) {
        throw new AppError(404, ERROR_CODES.NOT_FOUND, 'Projet introuvable.');
      }
    },

    async setStatus(projectId: string, status: ProjectStatus): Promise<void> {
      await db.update(projects).set({ status, updatedAt: new Date() }).where(eq(projects.id, projectId));
    },
  };
}

export type ProjectService = ReturnType<typeof createProjectService>;
