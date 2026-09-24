import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createIdeaSchema, ERROR_CODES, listIdeasQuerySchema } from '@nexus/contracts';
import { AppError, parseBody } from '../../middleware/errors.js';
import type { AuthService } from '../../services/authService.js';
import { createAuthGuard } from '../../middleware/authGuard.js';
import { requireOrgAccess } from '../../middleware/guards.js';
import type { IdeaService } from '../../services/ideaService.js';
import type { Database } from '@nexus/db';

export interface IdeaRoutesOptions {
  authService: AuthService;
  ideaService: IdeaService;
  db: Database;
}

/** /v1/ideas — idées persistantes, scopées par organisation (member+). */
export async function ideaRoutes(app: FastifyInstance, options: IdeaRoutesOptions): Promise<void> {
  const guard = createAuthGuard(options.authService);

  app.post('/', { preHandler: guard }, async (request, reply) => {
    const input = parseBody(createIdeaSchema, request.body);
    await requireOrgAccess(options.db, request.user!, input.organizationId, 'member');
    const idea = await options.ideaService.create(input.organizationId, request.user!.id, {
      title: input.title,
      detail: input.detail,
      tags: input.tags,
    });
    reply.code(201);
    return idea;
  });

  app.get('/', { preHandler: guard }, async (request) => {
    const query = parseBody(listIdeasQuerySchema, request.query);
    await requireOrgAccess(options.db, request.user!, query.organizationId, 'member');
    return options.ideaService.list(query.organizationId, query);
  });

  app.post('/:ideaId/vote', { preHandler: guard }, async (request) => {
    const { ideaId } = request.params as { ideaId: string };
    if (!z.string().uuid().safeParse(ideaId).success) {
      throw new AppError(400, ERROR_CODES.VALIDATION_ERROR, 'Identifiant d’idée invalide.');
    }
    const query = parseBody(z.object({ organizationId: z.string().uuid() }), request.query);
    await requireOrgAccess(options.db, request.user!, query.organizationId, 'member');
    return options.ideaService.vote(query.organizationId, ideaId);
  });
}
