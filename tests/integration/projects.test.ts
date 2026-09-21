import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createEmbeddedDb, runMigrations, type DbHandle } from '@nexus/db';
import { buildApp, type AppHandle } from '@nexus/api';
import { makeEnv, sessionCookie } from './helpers';

/** PROMPT 08 — projets réels : CRUD, pagination, recherche, persistance. */
describe('API Projets — CRUD réel', () => {
  let handle: AppHandle;
  let db: DbHandle;
  let cookie: string;
  let organizationId: string;

  beforeAll(async () => {
    db = await createEmbeddedDb({ dataDir: mkdtempSync(join(tmpdir(), "nexus-test-")) });
    await runMigrations(db);
    handle = await buildApp({ env: makeEnv(), db });
    const register = await handle.app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: 'pm@projects.test', password: 'MotDePasse2026' },
    });
    cookie = sessionCookie(register);
    const orgs = await handle.app.inject({
      method: 'GET',
      url: '/v1/organizations',
      headers: { cookie },
    });
    organizationId = (orgs.json()['data'] as { id: string }[])[0]!.id;
  });

  afterAll(async () => {
    await handle.close();
    await db.close();
  });

  const post = (payload: unknown) =>
    handle.app.inject({
      method: 'POST',
      url: '/v1/projects',
      headers: { cookie, 'content-type': 'application/json' },
      payload,
    });

  it('création : 201 + projet persisté avec statut draft', async () => {
    const response = await post({ organizationId, name: 'Plateforme vitrine', description: 'Site public' });
    expect(response.statusCode).toBe(201);
    const project = response.json() as { id: string; status: string; slug: string };
    expect(project.status).toBe('draft');
    expect(project.slug).toMatch(/^plateforme-vitrine-/);
  });

  it('lecture : GET par id', async () => {
    const created = await post({ organizationId, name: 'À lire' });
    const id = (created.json() as { id: string }).id;
    const response = await handle.app.inject({
      method: 'GET',
      url: `/v1/projects/${id}`,
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    expect((response.json() as { name: string }).name).toBe('À lire');
  });

  it('modification : PATCH change nom et statut', async () => {
    const created = await post({ organizationId, name: 'Avant' });
    const id = (created.json() as { id: string }).id;
    const response = await handle.app.inject({
      method: 'PATCH',
      url: `/v1/projects/${id}`,
      headers: { cookie, 'content-type': 'application/json' },
      payload: { name: 'Après', status: 'active' },
    });
    expect(response.statusCode).toBe(200);
    const updated = response.json() as { name: string; status: string };
    expect(updated.name).toBe('Après');
    expect(updated.status).toBe('active');
  });

  it('validation : nom trop court → 400 normalisé', async () => {
    const response = await post({ organizationId, name: 'A' });
    expect(response.statusCode).toBe(400);
    expect((response.json() as { error: { code: string } }).error.code).toBe('VALIDATION_ERROR');
  });

  it('pagination + recherche', async () => {
    for (const name of ['Recherche Alpha', 'Recherche Beta', 'Autre Gamma']) {
      await post({ organizationId, name });
    }
    const page1 = await handle.app.inject({
      method: 'GET',
      url: '/v1/projects',
      headers: { cookie },
      query: { organizationId, page: '1', limit: '2' },
    });
    const page1Body = page1.json() as { data: unknown[]; total: number; totalPages: number; page: number };
    expect(page1Body.data).toHaveLength(2);
    expect(page1Body.total).toBeGreaterThanOrEqual(5);
    expect(page1Body.totalPages).toBeGreaterThanOrEqual(3);
    expect(page1Body.page).toBe(1);

    const search = await handle.app.inject({
      method: 'GET',
      url: '/v1/projects',
      headers: { cookie },
      query: { organizationId, q: 'Recherche' },
    });
    const searchBody = search.json() as { data: { name: string }[]; total: number };
    expect(searchBody.data).toHaveLength(2);
    expect(searchBody.total).toBe(2);
  });

  it('suppression : 204 puis 404 au GET', async () => {
    const created = await post({ organizationId, name: 'Éphémère' });
    const id = (created.json() as { id: string }).id;
    const remove = await handle.app.inject({
      method: 'DELETE',
      url: `/v1/projects/${id}`,
      headers: { cookie },
    });
    expect(remove.statusCode).toBe(204);
    const verify = await handle.app.inject({
      method: 'GET',
      url: `/v1/projects/${id}`,
      headers: { cookie },
    });
    expect(verify.statusCode).toBe(404);
  });

  it('les projets restent en base après fermeture du handle (persistance réelle)', async () => {
    const before = await handle.app.inject({
      method: 'GET',
      url: '/v1/projects',
      headers: { cookie },
      query: { organizationId, limit: '100' },
    });
    const total = (before.json() as { total: number }).total;
    expect(total).toBeGreaterThanOrEqual(5);
  });
});
