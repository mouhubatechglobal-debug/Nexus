import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createEmbeddedDb, runMigrations, type DbHandle } from '@nexus/db';
import { buildApp, type AppHandle } from '@nexus/api';
import { makeEnv, sessionCookie } from './helpers';

/**
 * NEXUS Ideas — capture persistante, isolation stricte, votes atomiques.
 */
describe('Idées — réel, scopé organisation', () => {
  let handle: AppHandle;
  let db: DbHandle;
  let alice: string;
  let bob: string;
  let orgAlice: string;
  let orgBob: string;

  async function bootstrap(email: string, org: string): Promise<{ cookie: string; organizationId: string }> {
    const register = await handle.app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email, password: 'MotDePasse2026', organizationName: org },
    });
    const cookie = sessionCookie(register);
    const orgs = await handle.app.inject({ method: 'GET', url: '/v1/organizations', headers: { cookie } });
    return { cookie, organizationId: (orgs.json()['data'] as { id: string }[])[0]!.id };
  }

  beforeAll(async () => {
    db = await createEmbeddedDb({ dataDir: mkdtempSync(join(tmpdir(), 'nexus-test-')) });
    await runMigrations(db);
    handle = await buildApp({ env: makeEnv(), db });
    const a = await bootstrap('idea-alice@nexus.test', 'Idées Alice');
    const b = await bootstrap('idea-bob@nexus.test', 'Idées Bob');
    alice = a.cookie;
    orgAlice = a.organizationId;
    bob = b.cookie;
    orgBob = b.organizationId;
  });

  afterAll(async () => {
    await handle.close();
    await db.close();
  });

  it('crée une idée persistante (201) et la relit', async () => {
    const created = await handle.app.inject({
      method: 'POST',
      url: '/v1/ideas',
      headers: { cookie: alice, 'content-type': 'application/json' },
      payload: { organizationId: orgAlice, title: 'Palette de commandes', detail: 'Ctrl+K', tags: ['ux', 'prod'] },
    });
    expect(created.statusCode).toBe(201);
    const idea = created.json() as { id: string; votes: number; status: string; tags: string[] };
    expect(idea.votes).toBe(0);
    expect(idea.status).toBe('nouveau');
    expect(idea.tags).toEqual(['ux', 'prod']);

    const list = await handle.app.inject({ method: 'GET', url: `/v1/ideas?organizationId=${orgAlice}`, headers: { cookie: alice } });
    expect((list.json() as { total: number }).total).toBe(1);
  });

  it('valide les entrées : titre trop court → 400, trop de tags → 400', async () => {
    const short = await handle.app.inject({
      method: 'POST',
      url: '/v1/ideas',
      headers: { cookie: alice, 'content-type': 'application/json' },
      payload: { organizationId: orgAlice, title: 'ab' },
    });
    expect(short.statusCode).toBe(400);

    const manyTags = await handle.app.inject({
      method: 'POST',
      url: '/v1/ideas',
      headers: { cookie: alice, 'content-type': 'application/json' },
      payload: { organizationId: orgAlice, title: 'Titre correct', tags: ['a', 'b', 'c', 'd', 'e'] },
    });
    expect(manyTags.statusCode).toBe(400);
  });

  it('isolation : Bob ne voit AUCUNE idée d’Alice et ne peut pas voter dessus', async () => {
    const listBob = await handle.app.inject({ method: 'GET', url: `/v1/ideas?organizationId=${orgAlice}`, headers: { cookie: bob } });
    expect(listBob.statusCode).toBe(404); // org étrangère : anti-énumération

    const mine = await handle.app.inject({ method: 'GET', url: `/v1/ideas?organizationId=${orgAlice}`, headers: { cookie: alice } });
    const ideaId = (mine.json() as { data: { id: string }[] }).data[0]!.id;

    const voteBob = await handle.app.inject({
      method: 'POST',
      url: `/v1/ideas/${ideaId}/vote?organizationId=${orgAlice}`,
      headers: { cookie: bob },
    });
    expect(voteBob.statusCode).toBe(404);

    // Idée inconnue → 404 (pas de fuite).
    const voteUnknown = await handle.app.inject({
      method: 'POST',
      url: `/v1/ideas/00000000-0000-0000-0000-00000000dead/vote?organizationId=${orgAlice}`,
      headers: { cookie: alice },
    });
    expect(voteUnknown.statusCode).toBe(404);
  });

  it('vote atomique : deux votes successifs incrémentent côté serveur', async () => {
    const create = await handle.app.inject({
      method: 'POST',
      url: '/v1/ideas',
      headers: { cookie: alice, 'content-type': 'application/json' },
      payload: { organizationId: orgAlice, title: 'Idée à voter' },
    });
    const ideaId = (create.json() as { id: string }).id;

    await handle.app.inject({ method: 'POST', url: `/v1/ideas/${ideaId}/vote?organizationId=${orgAlice}`, headers: { cookie: alice } });
    const second = await handle.app.inject({ method: 'POST', url: `/v1/ideas/${ideaId}/vote?organizationId=${orgAlice}`, headers: { cookie: alice } });
    expect((second.json() as { votes: number }).votes).toBe(2);
  });
});
