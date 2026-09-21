import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { healthResponseSchema } from '@nexus/contracts';
import { buildApp, type AppHandle } from '@nexus/api';

describe('API NEXUS — /health (intégration)', () => {
  let handle: AppHandle;

  beforeAll(() => {
    handle = buildApp({
      env: {
        NODE_ENV: 'test',
        LOG_LEVEL: 'fatal',
        PORT: 3001,
        CORS_ORIGIN: 'http://localhost:5173',
        DATABASE_URL: 'postgres://nexus:nexus@localhost:5432/nexus',
        REDIS_URL: 'redis://localhost:6379',
      },
    });
  });

  afterAll(async () => {
    await handle.close();
  });

  it('répond 200 avec une carte d’identité sur GET /', async () => {
    const response = await handle.app.inject({ method: 'GET', url: '/' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ name: 'Nexus' });
  });

  it('expose une sonde /health conforme au contrat partagé', async () => {
    const response = await handle.app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);

    const parsed = healthResponseSchema.safeParse(response.json());
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      // PostgreSQL/Redis ne tournent pas forcément dans l'environnement de
      // test : on ne fait que vérifier la cohérence statut ↔ composants.
      const allUp =
        parsed.data.checks.database === 'up' && parsed.data.checks.redis === 'up';
      expect(parsed.data.status).toBe(allUp ? 'ok' : 'degraded');
    }
  });
});
