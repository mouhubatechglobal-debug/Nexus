import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createEmbeddedDb, runMigrations, type DbHandle } from '@nexus/db';
import { buildApp, type AppHandle } from '@nexus/api';
import { makeEnv } from './helpers';

describe('API NEXUS — protection contre les abus (rate limiting)', () => {
  let handle: AppHandle;
  let db: DbHandle;

  beforeAll(async () => {
    db = await createEmbeddedDb();
    await runMigrations(db);
    // Limite d'authentification volontairement très basse pour le test.
    handle = await buildApp({ env: makeEnv({ AUTH_RATE_LIMIT_MAX: 3 }), db });
  });

  afterAll(async () => {
    await handle.close();
    await db.close();
  });

  it('bloque au-delà de la limite avec 429 RATE_LIMITED (format normalisé)', async () => {
    const payload = { email: 'ratelimit@nexus.test', password: 'MotDePasse2026' };

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await handle.app.inject({
        method: 'POST',
        url: '/v1/auth/login',
        payload,
      });
      // Les 3 premières tentatives passent le garde-fou (401 ici).
      expect(response.statusCode).toBe(401);
    }

    const fourth = await handle.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload,
    });
    expect(fourth.statusCode).toBe(429);
    const body = fourth.json() as { error: { code: string; requestId?: string } };
    expect(body.error.code).toBe('RATE_LIMITED');
    expect(body.error.requestId).toBeTruthy();
  });
});
