import type { FastifyInstance } from 'fastify';
import {
  createBrainEntrySchema,
  createFileSchema,
  createLabEntrySchema,
  renameFileSchema,
  saveDesignSchema,
  updateFileSchema,
} from '@nexus/contracts';
import { parseBody } from '../../middleware/errors.js';
import type { AuthService } from '../../services/authService.js';
import { createAuthGuard } from '../../middleware/authGuard.js';
import { requireProjectAccess } from '../../middleware/guards.js';
import type { Database } from '@nexus/db';
import {
  createAuditService,
  createBrainService,
  createFileSystemService,
  createLabService,
  createStudioService,
} from '../../services/index.js';

export interface WorkspaceRoutesOptions {
  authService: AuthService;
  db: Database;
}

/**
 * Modules de workspace projet — TOUTES les routes exigent :
 *   session valide → projet accessible → organisation membre → rôle suffisant.
 * C'est la chaîne utilisateur → organisation → projet → ressource.
 */
export async function workspaceRoutes(app: FastifyInstance, options: WorkspaceRoutesOptions): Promise<void> {
  const guard = createAuthGuard(options.authService);
  const db = options.db;
  const brain = createBrainService(db);
  const files = createFileSystemService(db);
  const studio = createStudioService(db);
  const lab = createLabService(db);
  const audits = createAuditService(db);

  const projectIdFrom = (request: { params: unknown }): string => {
    const params = request.params as { projectId?: string };
    const projectId = params.projectId;
    if (!projectId) throw new Error('projectId requis');
    return projectId;
  };

  /* ------------------------------ Brain ------------------------------ */

  app.get('/projects/:projectId/brain', { preHandler: guard }, async (request) => {
    await requireProjectAccess(db, request.user!, projectIdFrom(request), 'member');
    const { kind } = request.query as { kind?: string };
    return { data: await brain.list(projectIdFrom(request), kind as never) };
  });

  app.post('/projects/:projectId/brain', { preHandler: guard }, async (request, reply) => {
    const projectId = projectIdFrom(request);
    await requireProjectAccess(db, request.user!, projectId, 'member');
    const input = parseBody(createBrainEntrySchema, request.body);
    const entry = await brain.create(projectId, request.user!.id, input);
    reply.code(201);
    return entry;
  });

  app.delete('/projects/:projectId/brain/:entryId', { preHandler: guard }, async (request, reply) => {
    const { entryId } = request.params as { entryId: string };
    await requireProjectAccess(db, request.user!, projectIdFrom(request), 'member');
    await brain.remove(projectIdFrom(request), entryId);
    reply.code(204);
    return undefined;
  });

  /* ------------------------- Forge — fichiers ------------------------ */

  app.get('/projects/:projectId/files', { preHandler: guard }, async (request) => {
    await requireProjectAccess(db, request.user!, projectIdFrom(request), 'member');
    const { prefix } = request.query as { prefix?: string };
    return { data: await files.list(projectIdFrom(request), prefix) };
  });

  app.get('/projects/:projectId/files/content', { preHandler: guard }, async (request) => {
    await requireProjectAccess(db, request.user!, projectIdFrom(request), 'member');
    const { path } = request.query as { path: string };
    return files.read(projectIdFrom(request), path);
  });

  app.post('/projects/:projectId/files', { preHandler: guard }, async (request, reply) => {
    const projectId = projectIdFrom(request);
    await requireProjectAccess(db, request.user!, projectId, 'member');
    const input = parseBody(createFileSchema, request.body);
    const node = await files.create(projectId, request.user!.id, input);
    reply.code(201);
    return node;
  });

  app.put('/projects/:projectId/files', { preHandler: guard }, async (request) => {
    const projectId = projectIdFrom(request);
    await requireProjectAccess(db, request.user!, projectId, 'member');
    const input = parseBody(updateFileSchema, request.body);
    return files.update(projectId, request.user!.id, input.path, input.content);
  });

  app.patch('/projects/:projectId/files', { preHandler: guard }, async (request) => {
    const projectId = projectIdFrom(request);
    await requireProjectAccess(db, request.user!, projectId, 'member');
    const input = parseBody(renameFileSchema, request.body);
    const nodes = await files.rename(projectId, request.user!.id, input.path, input.newPath);
    return { data: nodes };
  });

  app.delete('/projects/:projectId/files', { preHandler: guard }, async (request, reply) => {
    const projectId = projectIdFrom(request);
    await requireProjectAccess(db, request.user!, projectId, 'member');
    const { path } = request.query as { path: string };
    const removed = await files.remove(projectId, path);
    reply.code(200);
    return { removed };
  });

  /* ------------------------------ Studio ----------------------------- */

  app.get('/projects/:projectId/studio', { preHandler: guard }, async (request) => {
    const projectId = projectIdFrom(request);
    await requireProjectAccess(db, request.user!, projectId, 'member');
    const { version } = request.query as { version?: string };
    if (version) {
      const parsed = Number.parseInt(version, 10);
      if (!Number.isInteger(parsed) || parsed < 1) {
        return { design: null };
      }
      return { design: await studio.atVersion(projectId, parsed) };
    }
    return { design: await studio.latest(projectId), versions: await studio.versions(projectId) };
  });

  app.post('/projects/:projectId/studio', { preHandler: guard }, async (request, reply) => {
    const projectId = projectIdFrom(request);
    await requireProjectAccess(db, request.user!, projectId, 'member');
    const input = parseBody(saveDesignSchema, request.body);
    const design = await studio.save(projectId, request.user!.id, input.data);
    reply.code(201);
    return design;
  });

  /* ------------------------------- Lab ------------------------------- */

  app.get('/projects/:projectId/lab', { preHandler: guard }, async (request) => {
    await requireProjectAccess(db, request.user!, projectIdFrom(request), 'member');
    const { kind } = request.query as { kind?: string };
    return { data: await lab.list(projectIdFrom(request), kind as never) };
  });

  app.post('/projects/:projectId/lab', { preHandler: guard }, async (request, reply) => {
    const projectId = projectIdFrom(request);
    await requireProjectAccess(db, request.user!, projectId, 'member');
    const input = parseBody(createLabEntrySchema, request.body);
    const entry = await lab.create(projectId, request.user!.id, input);
    reply.code(201);
    return entry;
  });

  /* ------------------------------ Doctor ----------------------------- */

  app.get('/projects/:projectId/audits', { preHandler: guard }, async (request) => {
    await requireProjectAccess(db, request.user!, projectIdFrom(request), 'member');
    return { data: await audits.history(projectIdFrom(request)) };
  });

  app.post('/projects/:projectId/audits', { preHandler: guard }, async (request, reply) => {
    const projectId = projectIdFrom(request);
    await requireProjectAccess(db, request.user!, projectId, 'member');
    const report = await audits.run(projectId, request.user!.id);
    reply.code(201);
    return report;
  });
}
