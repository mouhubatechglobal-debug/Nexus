import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { createEmbeddedDb, runMigrations, type DbHandle } from '@nexus/db';
import { buildApp, type AppHandle } from '@nexus/api';
import { makeEnv, sessionCookie } from './helpers';

/**
 * PROMPT 10 — provider IA testé avec un mock OpenAI-compatible CONTRÔLÉ
 * (serveur HTTP local). Aucune prétention : on teste ce qui tourne.
 */
describe('Provider IA — mock OpenAI-compatible local', () => {
  let handle: AppHandle;
  let db: DbHandle;
  let cookie: string;
  let mock: Server;
  let mode: 'ok' | 'error' | 'slow' = 'ok';

  const json = (payload: unknown): Response =>
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });

  beforeAll(async () => {
    // Mock contrôlé : serveur OpenAI-compatible éphémère sur un port libre.
    mock = createServer((request, response) => {
      let body = '';
      request.on('data', (chunk) => {
        body += chunk;
      });
      request.on('end', () => {
        if (mode === 'error') {
          response.writeHead(500).end('{"error":"boom"}');
          return;
        }
        if (mode === 'slow') {
          // Ne répond jamais : déclenche le timeout client.
          return;
        }
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({
            choices: [{ message: { role: 'assistant', content: 'Réponse du mock IA.' } }],
          }),
        );
        void body;
      });
    });
    await new Promise<void>((resolve) => mock.listen(0, '127.0.0.1', resolve));
    const address = mock.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    db = await createEmbeddedDb({ dataDir: mkdtempSync(join(tmpdir(), "nexus-test-")) });
    await runMigrations(db);
    handle = await buildApp({
      env: makeEnv({
        AI_BASE_URL: `http://127.0.0.1:${port}`,
        AI_MODEL: 'mock-model-7b',
        AI_TIMEOUT_MS: 400,
        // Clé fournie par l'environnement de test — jamais codée en dur.
        AI_API_KEY: 'test-key-from-env',
      }),
      db,
    });

    const register = await handle.app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: 'ai@user.test', password: 'MotDePasse2026' },
    });
    cookie = sessionCookie(register);
  });

  afterAll(async () => {
    await handle.close();
    await db.close();
    await new Promise<void>((resolve) => mock.close(() => resolve()));
  });

  it('session requise : 401 sans cookie', async () => {
    const response = await handle.app.inject({
      method: 'POST',
      url: '/v1/ai/complete',
      payload: { prompt: 'bonjour' },
    });
    expect(response.statusCode).toBe(401);
  });

  it('complétion réussie : réponse standardisée', async () => {
    mode = 'ok';
    const response = await handle.app.inject({
      method: 'POST',
      url: '/v1/ai/complete',
      headers: { cookie, 'content-type': 'application/json' },
      payload: { prompt: 'Résume ce projet.', system: 'Tu es concis.', maxTokens: 128 },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { content: string; model: string; latencyMs: number };
    expect(body.content).toBe('Réponse du mock IA.');
    expect(body.model).toBe('mock-model-7b');
    expect(body.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('provider en erreur (500) → 502 AI_PROVIDER_ERROR normalisé', async () => {
    mode = 'error';
    const response = await handle.app.inject({
      method: 'POST',
      url: '/v1/ai/complete',
      headers: { cookie, 'content-type': 'application/json' },
      payload: { prompt: 'test' },
    });
    expect(response.statusCode).toBe(502);
    expect((response.json() as { error: { code: string } }).error.code).toBe('AI_PROVIDER_ERROR');
  });

  it('provider muet → 504 AI_TIMEOUT (timeout strict)', async () => {
    mode = 'slow';
    const response = await handle.app.inject({
      method: 'POST',
      url: '/v1/ai/complete',
      headers: { cookie, 'content-type': 'application/json' },
      payload: { prompt: 'test' },
    });
    expect(response.statusCode).toBe(504);
    expect((response.json() as { error: { code: string } }).error.code).toBe('AI_TIMEOUT');
  });

  it('validation : prompt vide → 400', async () => {
    mode = 'ok';
    const response = await handle.app.inject({
      method: 'POST',
      url: '/v1/ai/complete',
      headers: { cookie, 'content-type': 'application/json' },
      payload: { prompt: '   ' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('la clé API n’apparaît jamais dans les réponses', async () => {
    mode = 'ok';
    const response = await handle.app.inject({
      method: 'POST',
      url: '/v1/ai/complete',
      headers: { cookie, 'content-type': 'application/json' },
      payload: { prompt: 'où est la clé ?' },
    });
    expect(response.body).not.toContain('test-key-from-env');
    void json;
  });
});
