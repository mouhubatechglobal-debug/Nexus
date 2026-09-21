import { NEXUS_NAME, NEXUS_TAGLINE } from '@nexus/core';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { healthResponseSchema } from '@nexus/contracts';
import type { ComponentStatus } from '@nexus/contracts';

export interface HealthRouteOptions {
  version: string;
  checkDatabase: () => Promise<ComponentStatus>;
  checkRedis: () => Promise<ComponentStatus>;
}

/** Vire une promesse vers un fallback si elle dépasse `timeoutMs`. */
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * `GET /health` — sonde standardisée (schéma partagé `@nexus/contracts`).
 * Vérifie PostgreSQL et Redis avec un délai borné ; répond toujours 200 :
 * le statut détaillé permet à l'orchestrateur de décider.
 */
export async function healthRoutes(app: FastifyInstance, options: HealthRouteOptions): Promise<void> {
  app.get('/health', async (_request, reply) => {
    const [database, redis] = await Promise.all([
      withTimeout(options.checkDatabase(), 800, 'down' satisfies ComponentStatus),
      withTimeout(options.checkRedis(), 800, 'down' satisfies ComponentStatus),
    ]);

    const payload = healthResponseSchema.parse({
      status: database === 'up' && redis === 'up' ? 'ok' : 'degraded',
      service: NEXUS_NAME,
      version: options.version,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      checks: { database, redis },
    } satisfies z.input<typeof healthResponseSchema>);

    return reply.code(200).send(payload);
  });

  app.get('/', async () => ({
    name: NEXUS_NAME,
    tagline: NEXUS_TAGLINE,
    docs: '/health',
  }));
}
