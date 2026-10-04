import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import {
  analyticsEventsQuerySchema,
  analyticsMetricsQuerySchema,
  recordAnalyticsEventSchema,
} from '@nexus/contracts';
import { AppError, parseBody } from '../../middleware/errors.js';
import { ERROR_CODES } from '@nexus/contracts';
import type { AuthService } from '../../services/authService.js';
import { createAuthGuard } from '../../middleware/authGuard.js';
import { requireOrgAccess } from '../../middleware/guards.js';
import type { AnalyticsService } from '../../services/analyticsService.js';
import type { Database } from '@nexus/db';
import { projects } from '@nexus/db';

export interface AnalyticsRoutesOptions {
  authService: AuthService;
  analyticsService: AnalyticsService;
  db: Database;
}

/**
 * /v1/analytics — événements et métriques.
 * L'environnement (demo|live) est obligatoire partout : aucune lecture
 * ou écriture mixte n'est possible.
 */
export async function analyticsRoutes(app: FastifyInstance, options: AnalyticsRoutesOptions): Promise<void> {
  const guard = createAuthGuard(options.authService);
  const { db, analyticsService } = options;

  app.post('/events', { preHandler: guard }, async (request, reply) => {
    const input = parseBody(recordAnalyticsEventSchema, request.body);
    await requireOrgAccess(db, request.user!, input.organizationId, 'member');
    if (input.projectId) {
      // Le projet doit appartenir à la même organisation (anti-IDOR).
      const [project] = await db
        .select({ organizationId: projects.organizationId })
        .from(projects)
        .where(eq(projects.id, input.projectId))
        .limit(1);
      if (!project) {
        throw new AppError(404, ERROR_CODES.NOT_FOUND, 'Projet introuvable.');
      }
      if (project.organizationId !== input.organizationId) {
        throw new AppError(403, ERROR_CODES.FORBIDDEN, 'Le projet appartient à une autre organisation.');
      }
    }
    const event = await analyticsService.record(input);
    reply.code(201);
    return event;
  });

  app.get('/events', { preHandler: guard }, async (request) => {
    const query = parseBody(analyticsEventsQuerySchema, request.query);
    await requireOrgAccess(db, request.user!, query.organizationId, 'member');
    return analyticsService.list(query);
  });

  app.get('/metrics', { preHandler: guard }, async (request) => {
    const query = parseBody(analyticsMetricsQuerySchema, request.query);
    await requireOrgAccess(db, request.user!, query.organizationId, 'member');
    return analyticsService.metrics(query.organizationId, query.environment, query.days);
  });
}
