import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError, parseBody } from '../../middleware/errors.js';
import { ERROR_CODES } from '@nexus/contracts';
import type { AuthService } from '../../services/authService.js';
import { createAuthGuard } from '../../middleware/authGuard.js';
import { requireOrgAccess } from '../../middleware/guards.js';
import type { JobService } from '../../services/jobService.js';
import type { Database } from '@nexus/db';

/** /v1/jobs — création et suivi des jobs internes (Queue → Worker → Result). */
export async function jobRoutes(app: FastifyInstance, options: JobRoutesOptions): Promise<void> {
  const guard = createAuthGuard(options.authService);

  app.post('/digest', { preHandler: guard }, async (request, reply) => {
    const input = parseBody(z.object({ organizationId: z.string().uuid() }), request.body);
    await requireOrgAccess(options.db, request.user!, input.organizationId, 'member');
    const { jobId } = await options.jobService.enqueueDigest({
      organizationId: input.organizationId,
      requestedBy: request.user!.id,
    });
    reply.code(202);
    return { jobId, driver: options.jobService.driver };
  });

  app.get('/:jobId', { preHandler: guard }, async (request) => {
    const { jobId } = request.params as { jobId: string };
    const job = await options.jobService.getStatus(jobId, request.user!.id);
    if (!job) {
      // 404 : un job inconnu n'existe pas (aucune fuite d'information).
      throw new AppError(404, ERROR_CODES.NOT_FOUND, 'Job introuvable.');
    }
    return job;
  });
}

export interface JobRoutesOptions {
  authService: AuthService;
  jobService: JobService;
  db: Database;
}
