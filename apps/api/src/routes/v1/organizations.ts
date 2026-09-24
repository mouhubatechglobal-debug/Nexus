import type { FastifyInstance } from 'fastify';
import { createOrganizationSchema } from '@nexus/contracts';
import { parseBody } from '../../middleware/errors.js';
import type { AuthService } from '../../services/authService.js';
import { createAuthGuard } from '../../middleware/authGuard.js';
import type { OrgService } from '../../services/orgService.js';

export interface OrgRoutesOptions {
  authService: AuthService;
  orgService: OrgService;
}

/** /v1/organizations — organisations de l'utilisateur. */
export async function orgRoutes(app: FastifyInstance, options: OrgRoutesOptions): Promise<void> {
  const guard = createAuthGuard(options.authService);

  app.get('/', { preHandler: guard }, async (request) => {
    return { data: await options.orgService.listForUser(request.user!.id) };
  });

  app.post('/', { preHandler: guard }, async (request, reply) => {
    const input = parseBody(createOrganizationSchema, request.body);
    const org = await options.orgService.create(request.user!.id, input.name);
    reply.code(201);
    return org;
  });
}
