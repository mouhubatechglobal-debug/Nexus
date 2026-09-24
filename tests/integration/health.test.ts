import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { healthResponseSchema, readyResponseSchema } from '@nexus/contracts';
import { createEmbeddedDb, runMigrations, type DbHandle } from '@nexus/db';
import { buildApp, type AppHandle } from '@nexus/api';
import { makeEnv } from './helpers';

describe('API NEXUS — sondes et erreurs normalisées', () => {
  let handle: AppHandle;
  let db: DbHandle;

  beforeAll(async () => {
    db = await createEmbeddedDb({ dataDir: mkdtempSync(join(tmpdir(), "nexus-test-")) });
    await runMigrations(db);
    handle = await buildApp({ env: makeEnv(), db });
  });

  afterAll(async () => {
    await handle.close();
    await db.close();
  });

  it('GET /health répond 200 avec une base de données up', async () => {
    const response = await handle.app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);

    const parsed = healthResponseSchema.safeParse(response.json());
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.checks.database).toBe('up');
      expect(parsed.data.status).toBe('degraded'); // Redis absent du sandbox
      expect(parsed.data.service).toBe('Nexus');
    }
  });

  it('GET /ready répond 200 ready quand la base est joignable', async () => {
    const response = await handle.app.inject({ method: 'GET', url: '/ready' });
    expect(response.statusCode).toBe(200);

    const parsed = readyResponseSchema.safeParse(response.json());
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.status).toBe('ready');
      expect(parsed.data.checks.database).toBe('up');
    }
  });

  it('chaque réponse d’erreur suit le format normalisé (404)', async () => {
    const response = await handle.app.inject({ method: 'GET', url: '/route-inexistante' });
    expect(response.statusCode).toBe(404);

    const body = response.json() as { error: { code: string; message: string; requestId?: string } };
    expect(body.error.code).toBe('NOT_FOUND');
    expect(typeof body.error.message).toBe('string');
    expect(body.error.requestId).toBeTruthy();
    expect(response.headers['x-request-id']).toBeTruthy();
  });

  it('CORS contrôlé : une origine non autorisée n’est pas acceptée', async () => {
    const response = await handle.app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://site-malveillant.example' },
    });
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('CORS contrôlé : l’origine autorisée est reflétée (credentials inclus)', async () => {
    const response = await handle.app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'http://localhost:5173' },
    });
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });
});
