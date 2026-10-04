import type { FastifyReply } from 'fastify';
import type { HealthService } from '../services/healthService.js';

/** Contrôleurs des sondes — couche HTTP mince au-dessus du service. */
export function createHealthController(service: HealthService) {
  return {
    async getHealth() {
      return service.getHealth();
    },

    async getReady(_request: unknown, reply: FastifyReply) {
      const { payload, ready } = await service.getReadiness();
      if (!ready) {
        reply.header('retry-after', '5');
        return reply.code(503).send(payload);
      }
      return payload;
    },
  };
}

export type HealthController = ReturnType<typeof createHealthController>;
