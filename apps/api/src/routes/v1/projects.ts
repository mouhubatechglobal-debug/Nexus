import type { FastifyInstance } from 'fastify';
import {
  createProjectSchema,
  listProjectsQuerySchema,
  updateProjectSchema,
} from '@nexus/contracts';
import { parseBody } from '../../middleware/errors.js';
import type { AuthService } from '../../services/authService.js';
import { createAuthGuard } from '../../middleware/authGuard.js';
import { requireOrgAccess, requireProjectAccess } from '../../middleware/guards.js';
import type { ProjectService } from '../../services/projectService.js';
import type { Database } from '@nexus/db';

export interface ProjectRoutesOptions {
  authService: AuthService;
  projectService: ProjectService;
  db: Database;
}

/**
 * /v1/projects — CRUD réel, pagination, recherche.
 *
 * Isolation tenant (anti-IDOR) : chaque accès passe par
 * requireOrgAccess / requireProjectAccess — un ID modifié dans la
 * requête ne permet jamais d'atteindre une autre organisation.
 */
export async function projectRoutes(app: FastifyInstance, options: ProjectRoutesOptions): Promise<void> {
  const guard = createAuthGuard(options.authService);
  const { projectService, db } = options;

  app.post('/', { preHandler: guard }, async (request, reply) => {
    const input = parseBody(createProjectSchema, request.body);
    // Créer un projet exige le rôle ADMIN dans l'organisation cible.
    await requireOrgAccess(db, request.user!, input.organizationId, 'admin');
    const project = await projectService.create(request.user!.id, input);
    reply.code(201);
    return project;
  });

  app.get('/', { preHandler: guard }, async (request) => {
    const query = parseBody(listProjectsQuerySchema, request.query);
    await requireOrgAccess(db, request.user!, query.organizationId, 'member');
    return projectService.list(query);
  });

  app.get('/:projectId', { preHandler: guard }, async (request) => {
    const { projectId } = request.params as { projectId: string };
    await requireProjectAccess(db, request.user!, projectId, 'member');
    return projectService.get(projectId);
  });

  app.patch('/:projectId', { preHandler: guard }, async (request) => {
    const { projectId } = request.params as { projectId: string };
    const patch = parseBody(updateProjectSchema, request.body);
    // Modifier un projet (nom, statut…) exige ADMIN — un MEMBER contribue
    // au contenu mais ne restructure pas l'espace.
    await requireProjectAccess(db, request.user!, projectId, 'admin');
    return projectService.update(projectId, patch);
  });

  app.delete('/:projectId', { preHandler: guard }, async (request, reply) => {
    const { projectId } = request.params as { projectId: string };
    // Suppression réservée aux ADMIN et OWNER.
    await requireProjectAccess(db, request.user!, projectId, 'admin');
    await projectService.remove(projectId);
    reply.code(204);
    return undefined;
  });
}
