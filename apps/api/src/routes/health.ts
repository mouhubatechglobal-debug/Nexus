import type { FastifyInstance } from 'fastify';
import type { HealthService } from '../services/healthService.js';
import { createHealthController } from '../controllers/healthController.js';

export interface HealthRoutesOptions {
  service: HealthService;
}

/**
 * `GET /health` — liveness (toujours 200, état détaillé).
 * `GET /ready`  — readiness (200 prêt / 503 indisponible).
 */
export async function healthRoutes(app: FastifyInstance, options: HealthRoutesOptions): Promise<void> {
  const controller = createHealthController(options.service);

  app.get('/health', {
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
  }, async () => controller.getHealth());

  app.get('/ready', {
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
  }, async (request, reply) => controller.getReady(request, reply));
}
