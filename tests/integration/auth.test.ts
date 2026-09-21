import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createEmbeddedDb, runMigrations, type DbHandle } from '@nexus/db';
import { buildApp, type AppHandle } from '@nexus/api';
import { makeEnv, sessionCookie } from './helpers';

describe('API NEXUS — authentification (/v1/auth)', () => {
  let handle: AppHandle;
  let db: DbHandle;

  beforeAll(async () => {
    db = await createEmbeddedDb({ dataDir: mkdtempSync(join(tmpdir(), "nexus-test-")) });
    await runMigrations(db);
    handle = await buildApp({
      env: makeEnv({ AUTH_RATE_LIMIT_MAX: 50 }),
      db,
    });
  });

  afterAll(async () => {
    await handle.close();
    await db.close();
  });

  it('inscription : 201, utilisateur créé, cookie de session émis', async () => {
    const response = await handle.app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: 'Alex@Nexus.test',
        password: 'MotDePasse2026',
        displayName: 'Alex Martin',
        organizationName: 'Nexus Studio',
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json() as { user: { email: string; displayName: string } };
    expect(body.user.email).toBe('alex@nexus.test'); // normalisé en minuscules
    expect(body.user.displayName).toBe('Alex Martin');
    expect(sessionCookie(response)).toMatch(/^nexus_session=.+/);
  });

  it('utilisateur courant : /me renvoie le compte de la session', async () => {
    const login = await handle.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: 'alex@nexus.test', password: 'MotDePasse2026' },
    });
    expect(login.statusCode).toBe(200);

    const me = await handle.app.inject({
      method: 'GET',
      url: '/v1/auth/me',
      headers: { cookie: sessionCookie(login) },
    });
    expect(me.statusCode).toBe(200);
    expect((me.json() as { user: { email: string } }).user.email).toBe('alex@nexus.test');
  });

  it('mauvaise combinaison : 401 INVALID_CREDENTIALS au format normalisé', async () => {
    const response = await handle.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: 'alex@nexus.test', password: 'MauvaisMotDePasse99' },
    });

    expect(response.statusCode).toBe(401);
    const body = response.json() as { error: { code: string } };
    expect(body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('e-mail inconnu : même réponse que mauvais mot de passe (anti-énumération)', async () => {
    const response = await handle.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: 'inconnu@nexus.test', password: 'MotDePasse2026' },
    });

    expect(response.statusCode).toBe(401);
    expect((response.json() as { error: { code: string } }).error.code).toBe('INVALID_CREDENTIALS');
  });

  it('e-mail déjà pris : 409 EMAIL_TAKEN', async () => {
    const response = await handle.app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: 'alex@nexus.test', password: 'MotDePasse2026' },
    });

    expect(response.statusCode).toBe(409);
    expect((response.json() as { error: { code: string } }).error.code).toBe('EMAIL_TAKEN');
  });

  it('validation : mot de passe trop faible → 400 VALIDATION_ERROR avec détails', async () => {
    const response = await handle.app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: 'faible@nexus.test', password: 'court' },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json() as { error: { code: string; details?: { path: string; message: string }[] } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details?.some((detail) => detail.path === 'password')).toBe(true);
  });

  it('logout : 204, session révoquée, /me renvoie 401 ensuite', async () => {
    const login = await handle.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: 'alex@nexus.test', password: 'MotDePasse2026' },
    });
    const cookie = sessionCookie(login);

    const logout = await handle.app.inject({
      method: 'POST',
      url: '/v1/auth/logout',
      headers: { cookie },
    });
    expect(logout.statusCode).toBe(204);

    const me = await handle.app.inject({
      method: 'GET',
      url: '/v1/auth/me',
      headers: { cookie },
    });
    expect(me.statusCode).toBe(401);
    expect((me.json() as { error: { code: string } }).error.code).toBe('UNAUTHENTICATED');
  });

  it('/me sans session : 401 UNAUTHENTICATED', async () => {
    const response = await handle.app.inject({ method: 'GET', url: '/v1/auth/me' });
    expect(response.statusCode).toBe(401);
    expect((response.json() as { error: { code: string } }).error.code).toBe('UNAUTHENTICATED');
  });

  it('le hash stocké n’est jamais un mot de passe en clair ni exposé', async () => {
    const { users } = await import('@nexus/db');
    const rows = await db.db.select().from(users);
    const alex = rows.find((row) => row.email === 'alex@nexus.test');
    expect(alex?.passwordHash).toBeTruthy();
    expect(alex?.passwordHash).not.toBe('MotDePasse2026');
    expect(alex?.passwordHash.startsWith('$argon2id$')).toBe(true);

    const login = await handle.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: 'alex@nexus.test', password: 'MotDePasse2026' },
    });
    const me = await handle.app.inject({
      method: 'GET',
      url: '/v1/auth/me',
      headers: { cookie: sessionCookie(login) },
    });
    expect(me.body).not.toContain('passwordHash');
    expect(me.body).not.toContain('argon2id');
  });
});

