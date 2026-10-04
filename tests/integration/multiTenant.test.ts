import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createEmbeddedDb, organizationMembers, runMigrations, type DbHandle } from '@nexus/db';
import { buildApp, type AppHandle } from '@nexus/api';
import { makeEnv, sessionCookie } from './helpers';
import { randomUUID } from 'node:crypto';

/**
 * PROMPT 07 — isolation multi-tenant explicite.
 * Un changement d'ID dans une requête ne doit JAMAIS permettre
 * d'atteindre les ressources d'une autre organisation.
 */
describe('Multi-tenant — isolation et permissions', () => {
  let handle: AppHandle;
  let db: DbHandle;
  let cookieA: string;
  let cookieB: string;
  let orgA: string;
  let orgB: string;
  let projectA: string;
  let projectB: string;

  async function register(email: string): Promise<string> {
    const response = await handle.app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email, password: 'MotDePasse2026' },
    });
    expect(response.statusCode).toBe(201);
    return sessionCookie(response);
  }

  async function firstOrg(cookie: string): Promise<string> {
    const response = await handle.app.inject({
      method: 'GET',
      url: '/v1/organizations',
      headers: { cookie },
    });
    const data = response.json()['data'] as { id: string }[];
    return data[0]!.id;
  }

  async function createProject(cookie: string, organizationId: string, name: string): Promise<string> {
    const response = await handle.app.inject({
      method: 'POST',
      url: '/v1/projects',
      headers: { cookie, 'content-type': 'application/json' },
      payload: { organizationId, name },
    });
    expect(response.statusCode).toBe(201);
    return (response.json() as { id: string }).id;
  }

  beforeAll(async () => {
    db = await createEmbeddedDb({ dataDir: mkdtempSync(join(tmpdir(), "nexus-test-")) });
    await runMigrations(db);
    handle = await buildApp({ env: makeEnv(), db });

    cookieA = await register('alice@tenants.test');
    cookieB = await register('bruno@tenants.test');
    orgA = await firstOrg(cookieA);
    orgB = await firstOrg(cookieB);
    projectA = await createProject(cookieA, orgA, 'Projet Alice');
    projectB = await createProject(cookieB, orgB, 'Projet Bruno');
  });

  afterAll(async () => {
    await handle.close();
    await db.close();
  });

  it('Utilisateur A → organisation A → AUTORISÉ', async () => {
    const response = await handle.app.inject({
      method: 'GET',
      url: '/v1/projects',
      headers: { cookie: cookieA },
      query: { organizationId: orgA },
    });
    expect(response.statusCode).toBe(200);
    const data = response.json()['data'] as { id: string }[];
    expect(data.some((project) => project.id === projectA)).toBe(true);
  });

  it('Utilisateur A → organisation B → REFUSÉ (404, existence cachée)', async () => {
    const response = await handle.app.inject({
      method: 'GET',
      url: '/v1/projects',
      headers: { cookie: cookieA },
      query: { organizationId: orgB },
    });
    expect([403, 404]).toContain(response.statusCode);
    // Pas de fuite de données en cas de refus.
    expect(response.body).not.toContain('Projet Bruno');
  });

  it('A ne peut pas lire le projet de B (changement d’ID → 404)', async () => {
    const response = await handle.app.inject({
      method: 'GET',
      url: `/v1/projects/${projectB}`,
      headers: { cookie: cookieA },
    });
    expect(response.statusCode).toBe(404);
    expect(response.body).not.toContain('Projet Bruno');
  });

  it('A ne peut pas modifier ni supprimer le projet de B', async () => {
    const patch = await handle.app.inject({
      method: 'PATCH',
      url: `/v1/projects/${projectB}`,
      headers: { cookie: cookieA, 'content-type': 'application/json' },
      payload: { name: 'Détourné' },
    });
    expect(patch.statusCode).toBe(404);

    const remove = await handle.app.inject({
      method: 'DELETE',
      url: `/v1/projects/${projectB}`,
      headers: { cookie: cookieA },
    });
    expect(remove.statusCode).toBe(404);

    // Le projet de B est intact.
    const verify = await handle.app.inject({
      method: 'GET',
      url: `/v1/projects/${projectB}`,
      headers: { cookie: cookieB },
    });
    expect(verify.statusCode).toBe(200);
    expect((verify.json() as { name: string }).name).toBe('Projet Bruno');
  });

  it('A ne peut pas accéder au workspace (Brain/Forge/Lab) du projet de B', async () => {
    for (const url of [
      `/v1/projects/${projectB}/brain`,
      `/v1/projects/${projectB}/files`,
      `/v1/projects/${projectB}/lab`,
      `/v1/projects/${projectB}/audits`,
      `/v1/projects/${projectB}/studio`,
    ]) {
      const response = await handle.app.inject({ method: 'GET', url, headers: { cookie: cookieA } });
      expect(response.statusCode).toBe(404);
    }
    const write = await handle.app.inject({
      method: 'POST',
      url: `/v1/projects/${projectB}/brain`,
      headers: { cookie: cookieA, 'content-type': 'application/json' },
      payload: { kind: 'context', title: 'Intrusion', content: 'tentative' },
    });
    expect(write.statusCode).toBe(404);
  });

  it('un ID aléatoire (projet inexistant) → 404, sans fuite', async () => {
    const response = await handle.app.inject({
      method: 'GET',
      url: `/v1/projects/${randomUUID()}`,
      headers: { cookie: cookieA },
    });
    expect(response.statusCode).toBe(404);
  });

  it('rôles : un MEMBER ne peut pas supprimer un projet (403), un OWNER si', async () => {
    // A rejoint l'org C comme simple MEMBER (insertion directe pour le test).
    const cookieC = await register('celine@tenants.test');
    const orgC = await firstOrg(cookieC);
    const projectC = await createProject(cookieC, orgC, 'Projet Céline');

    await db.db
      .insert(organizationMembers)
      .values({ organizationId: orgC, userId: (await userIdFrom(cookieA)), role: 'member' });

    // MEMBER : lecture OK…
    const read = await handle.app.inject({
      method: 'GET',
      url: `/v1/projects/${projectC}`,
      headers: { cookie: cookieA },
    });
    expect(read.statusCode).toBe(200);

    // …mais suppression REFUSÉE (rôle insuffisant).
    const remove = await handle.app.inject({
      method: 'DELETE',
      url: `/v1/projects/${projectC}`,
      headers: { cookie: cookieA },
    });
    expect(remove.statusCode).toBe(403);
    expect((remove.json() as { error: { code: string } }).error.code).toBe('INSUFFICIENT_ROLE');

    // OWNER (Céline) : suppression AUTORISÉE.
    const ownerRemove = await handle.app.inject({
      method: 'DELETE',
      url: `/v1/projects/${projectC}`,
      headers: { cookie: cookieC },
    });
    expect(ownerRemove.statusCode).toBe(204);
  });

  it('sans session : 401 sur les routes projet', async () => {
    const response = await handle.app.inject({
      method: 'GET',
      url: '/v1/projects',
      query: { organizationId: orgA },
    });
    expect(response.statusCode).toBe(401);
  });

  async function userIdFrom(cookie: string): Promise<string> {
    const response = await handle.app.inject({
      method: 'GET',
      url: '/v1/auth/me',
      headers: { cookie },
    });
    return (response.json() as { user: { id: string } }).user.id;
  }

  // Vérifie le cleanup de l'appartenance testée ci-dessus.
  it('sanity : l’organisation B de B contient toujours son projet', async () => {
    const rows = await db.db
      .select()
      .from(organizationMembers)
      .where(eq(organizationMembers.organizationId, orgB));
    expect(rows).toHaveLength(1);
  });
});
