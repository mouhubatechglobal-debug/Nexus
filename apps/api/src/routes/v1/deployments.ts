import type { FastifyInstance } from 'fastify';
import { createDeploymentSchema, promoteDeploymentSchema } from '@nexus/contracts';
import { parseBody } from '../../middleware/errors.js';
import type { AuthService } from '../../services/authService.js';
import { createAuthGuard } from '../../middleware/authGuard.js';
import { requireProjectAccess } from '../../middleware/guards.js';
import type { DeployService } from '../../services/deployService.js';
import type { Database } from '@nexus/db';

export interface DeploymentRoutesOptions {
  authService: AuthService;
  deployService: DeployService;
  db: Database;
}

/**
 * /v1/projects/:projectId/deployments — pipeline contrôlé.
 * La production n'est JAMAIS déclenchée automatiquement : étape
 * PRODUCTION bloquée jusqu'à POST /:id/promote { confirm: true }.
 */
export async function deploymentRoutes(app: FastifyInstance, options: DeploymentRoutesOptions): Promise<void> {
  const guard = createAuthGuard(options.authService);

  const projectIdOf = (request: { params: unknown }): string => {
    const params = request.params as { projectId?: string };
    if (!params.projectId) throw new Error('projectId requis');
    return params.projectId;
  };
  const deploymentIdOf = (request: { params: unknown }): string => {
    const params = request.params as { deploymentId?: string };
    if (!params.deploymentId) throw new Error('deploymentId requis');
    return params.deploymentId;
  };

  app.post('/', { preHandler: guard }, async (request, reply) => {
    const projectId = projectIdOf(request);
    await requireProjectAccess(options.db, request.user!, projectId, 'admin');
    const input = parseBody(createDeploymentSchema, request.body);
    const deployment = await options.deployService.create(projectId, request.user!.id, input);
    reply.code(201);
    return deployment;
  });

  app.get('/', { preHandler: guard }, async (request) => {
    const projectId = projectIdOf(request);
    await requireProjectAccess(options.db, request.user!, projectId, 'member');
    return { data: await options.deployService.list(projectId) };
  });

  app.get('/:deploymentId', { preHandler: guard }, async (request) => {
    const projectId = projectIdOf(request);
    await requireProjectAccess(options.db, request.user!, projectId, 'member');
    return options.deployService.get(deploymentIdOf(request));
  });

  app.post('/:deploymentId/promote', { preHandler: guard }, async (request) => {
    const projectId = projectIdOf(request);
    await requireProjectAccess(options.db, request.user!, projectId, 'admin');
    // Action explicite : confirm:true littéral exigé.
    parseBody(promoteDeploymentSchema, request.body);
    return options.deployService.promote(deploymentIdOf(request), request.user!.id);
  });

  app.post('/:deploymentId/cancel', { preHandler: guard }, async (request) => {
    const projectId = projectIdOf(request);
    await requireProjectAccess(options.db, request.user!, projectId, 'admin');
    return options.deployService.cancel(deploymentIdOf(request), request.user!.id);
  });
}
