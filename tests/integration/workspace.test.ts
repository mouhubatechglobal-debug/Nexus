import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import {
  createEmbeddedDb,
  fileVersions,
  projectFiles,
  runMigrations,
  type DbHandle,
} from '@nexus/db';
import { buildApp, type AppHandle } from '@nexus/api';
import { makeEnv, sessionCookie } from './helpers';

/**
 * Prompts 09-12-14-15-16 — workspace projet :
 * Brain, Forge (filesystem), Studio, Lab, Doctor.
 */
describe('Workspace projet — Brain, Forge, Studio, Lab, Doctor', () => {
  let handle: AppHandle;
  let db: DbHandle;
  let cookie: string;
  let organizationId: string;
  let projectId: string;

  beforeAll(async () => {
    db = await createEmbeddedDb({ dataDir: mkdtempSync(join(tmpdir(), "nexus-test-")) });
    await runMigrations(db);
    handle = await buildApp({ env: makeEnv(), db });
    const register = await handle.app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: 'work@space.test', password: 'MotDePasse2026' },
    });
    cookie = sessionCookie(register);
    const orgs = await handle.app.inject({ method: 'GET', url: '/v1/organizations', headers: { cookie } });
    organizationId = (orgs.json()['data'] as { id: string }[])[0]!.id;
    const created = await handle.app.inject({
      method: 'POST',
      url: '/v1/projects',
      headers: { cookie, 'content-type': 'application/json' },
      payload: { organizationId, name: 'Espace Workspace' },
    });
    projectId = (created.json() as { id: string }).id;
  });

  afterAll(async () => {
    await handle.close();
    await db.close();
  });

  const inject = (method: string, url: string, payload?: unknown, query?: Record<string, string>) =>
    handle.app.inject({
      method,
      url: `/v1/projects/${projectId}${url}`,
      headers: { cookie, ...(payload ? { 'content-type': 'application/json' } : {}) },
      payload,
      query,
    });

  /* ------------------------------- Brain ------------------------------ */

  it('Brain : création, lecture, filtre par type', async () => {
    const created = await inject('POST', '/brain', {
      kind: 'objective',
      title: 'Objectif T1',
      content: 'Livrer le MVP avant fin mars.',
    });
    expect(created.statusCode).toBe(201);

    await inject('POST', '/brain', {
      kind: 'constraint',
      title: 'Contrainte RGPD',
      content: 'Hébergement européen obligatoire.',
    });

    const all = await inject('GET', '/brain');
    expect((all.json()['data'] as unknown[]).length).toBeGreaterThanOrEqual(2);

    const filtered = await inject('GET', '/brain', undefined, { kind: 'objective' });
    const objectives = filtered.json()['data'] as { kind: string }[];
    expect(objectives.length).toBeGreaterThanOrEqual(1);
    expect(objectives.every((entry) => entry.kind === 'objective')).toBe(true);
  });

  it('Brain : validation titre trop court → 400', async () => {
    const response = await inject('POST', '/brain', { kind: 'info', title: 'X', content: 'contenu' });
    expect(response.statusCode).toBe(400);
  });

  /* ------------------------------ Forge ------------------------------- */

  it('Forge : création avec dossiers parents implicites', async () => {
    const response = await inject('POST', '/files', {
      path: 'src/components/Button.tsx',
      type: 'file',
      content: 'export const Button = () => null;\n',
    });
    expect(response.statusCode).toBe(201);

    const list = await inject('GET', '/files');
    const paths = (list.json()['data'] as { path: string; isDirectory: boolean }[]).map((node) => node.path);
    expect(paths).toContain('src');
    expect(paths).toContain('src/components');
    expect(paths).toContain('src/components/Button.tsx');
  });

  it('Forge : lecture par chemin', async () => {
    const response = await inject('GET', '/files/content', undefined, { path: 'src/components/Button.tsx' });
    expect(response.statusCode).toBe(200);
    expect((response.json() as { content: string }).content).toContain('export const Button');
  });

  it('Forge : écriture → version incrémentée et versions archivées', async () => {
    await inject('POST', '/files', { path: 'notes.md', content: 'v1' });
    const updated = await inject('PUT', '/files', { path: 'notes.md', content: 'v2 plus long' });
    expect((updated.json() as { version: number }).version).toBe(2);

    await inject('PUT', '/files', { path: 'notes.md', content: 'v3 finale' });
    const rows = await db.db.select().from(fileVersions);
    const noteVersions = rows.filter((row) => row.version >= 1).length;
    expect(noteVersions).toBeGreaterThanOrEqual(3);

    const read = await inject('GET', '/files/content', undefined, { path: 'notes.md' });
    expect((read.json() as { content: string }).content).toBe('v3 finale');
  });

  it('Forge : renommage simple et récursif (dossier)', async () => {
    await inject('POST', '/files', { path: 'old-name.md', content: 'contenu' });
    const renamed = await inject('PATCH', '/files', { path: 'old-name.md', newPath: 'new-name.md' });
    expect(renamed.statusCode).toBe(200);

    await inject('POST', '/files', { path: 'docs/guide.md', content: 'guide' });
    await inject('PATCH', '/files', { path: 'docs', newPath: 'documentation' });
    const moved = await inject('GET', '/files/content', undefined, { path: 'documentation/guide.md' });
    expect(moved.statusCode).toBe(200);
  });

  it('Forge : suppression récursive d’un dossier', async () => {
    await inject('POST', '/files', { path: 'tmp/a.txt', content: 'a' });
    await inject('POST', '/files', { path: 'tmp/b.txt', content: 'b' });
    const removed = await inject('DELETE', '/files', undefined, { path: 'tmp' });
    expect(removed.statusCode).toBe(200);
    const list = await inject('GET', '/files');
    const paths = (list.json()['data'] as { path: string }[]).map((node) => node.path);
    expect(paths).not.toContain('tmp/a.txt');
    expect(paths).not.toContain('tmp');
  });

  it('Forge : SÉCURITÉ — path traversal systématiquement refusé', async () => {
    const hostilePaths = [
      '../etc/passwd',
      'a/../../etc/passwd',
      '..',
      'foo/../..',
      '/etc/passwd',
      'C:\\Windows\\system32',
      'a\\..\\..\\escape',
      '%2e%2e/secrets',
      'ok/../../..',
      '.',
      'segment with space',
      'dot.%2Fdot',
    ];
    for (const path of hostilePaths) {
      const created = await inject('POST', '/files', { path, type: 'file', content: 'x' });
      expect(created.statusCode, `chemin hostile accepté : ${path}`).toBe(400);
      const read = await inject('GET', '/files/content', undefined, { path });
      expect(read.statusCode, `lecture hostile acceptée : ${path}`).toBe(400);
    }
    // Aucun fichier système n'a été créé : tout reste dans le projet.
    const list = await inject('GET', '/files');
    const paths = (list.json()['data'] as { path: string }[]).map((node) => node.path);
    expect(paths.every((path) => !path.includes('..') && !path.startsWith('/'))).toBe(true);
  });

  it('Forge : doublon de chemin → 409 CONFLICT', async () => {
    await inject('POST', '/files', { path: 'unique.md', content: 'x' });
    const duplicate = await inject('POST', '/files', { path: 'unique.md', content: 'y' });
    expect(duplicate.statusCode).toBe(409);
    expect((duplicate.json() as { error: { code: string } }).error.code).toBe('CONFLICT');
  });

  it('Forge : les fichiers restent isolés par projet (deux projets, mêmes chemins)', async () => {
    const other = await handle.app.inject({
      method: 'POST',
      url: '/v1/projects',
      headers: { cookie, 'content-type': 'application/json' },
      payload: { organizationId, name: 'Second projet' },
    });
    const otherId = (other.json() as { id: string }).id;

    await inject('POST', '/files', { path: 'shared-name.md', content: 'contenu projet 1' });
    const fromOther = await handle.app.inject({
      method: 'GET',
      url: `/v1/projects/${otherId}/files/content`,
      headers: { cookie },
      query: { path: 'shared-name.md' },
    });
    // Le projet 2 ne voit PAS le fichier du projet 1.
    expect(fromOther.statusCode).toBe(404);
  });

  it('Forge : plusieurs types de fichiers avec MIME correct', async () => {
    const cases: [string, string][] = [
      ['guide.md', 'text/markdown'],
      ['config.json', 'application/json'],
      ['style.css', 'text/css'],
      ['main.tsx', 'text/typescript'],
    ];
    for (const [path, mime] of cases) {
      const created = await inject('POST', '/files', { path, content: 'test' });
      expect((created.json() as { mime: string }).mime).toBe(mime);
    }
  });

  /* ------------------------------ Studio ------------------------------ */

  it('Studio : sauvegarde versionnée et récupération', async () => {
    const designV1 = {
      tokens: { colors: [{ name: 'accent', value: '#4f8dff' }] },
      pages: [{ id: 'home', name: 'Accueil', sections: [{ id: 'hero', name: 'Hero', componentIds: [] }] }],
      components: [{ id: 'button', name: 'Button', variants: ['primary'], props: {} }],
    };
    const save1 = await inject('POST', '/studio', { data: designV1 });
    expect(save1.statusCode).toBe(201);
    expect((save1.json() as { version: number }).version).toBe(1);

    const save2 = await inject('POST', '/studio', { data: { ...designV1, pages: [] } });
    expect((save2.json() as { version: number }).version).toBe(2);

    const latest = await inject('GET', '/studio');
    const latestBody = latest.json() as { design: { version: number } | null };
    expect(latestBody.design?.version).toBe(2);

    const old = await inject('GET', '/studio', undefined, { version: '1' });
    const oldBody = old.json() as { design: { version: number; data: { pages: unknown[] } } | null };
    expect(oldBody.design?.data.pages).toHaveLength(1);

    const versions = latest.json()['versions'] as { version: number }[];
    expect(versions).toHaveLength(2);
  });

  it('Studio : couleur invalide → 400', async () => {
    const response = await inject('POST', '/studio', {
      data: { tokens: { colors: [{ name: 'bad', value: 'rouge' }] } },
    });
    expect(response.statusCode).toBe(400);
  });

  /* -------------------------------- Lab ------------------------------- */

  it('Lab : une source SANS URL est refusée (aucune source inventée)', async () => {
    const response = await inject('POST', '/lab', {
      kind: 'source',
      title: 'Source sans référence',
      content: 'prétendue vérité',
    });
    expect(response.statusCode).toBe(400);
    expect(JSON.stringify(response.json())).toContain('URL');
  });

  it('Lab : une donnée marquée vérifiée sans source est refusée', async () => {
    const response = await inject('POST', '/lab', {
      kind: 'result',
      title: 'Résultat',
      content: 'donnée',
      verified: true,
    });
    expect(response.statusCode).toBe(400);
  });

  it('Lab : création avec source URL, verified explicite, filtre par type', async () => {
    const created = await inject('POST', '/lab', {
      kind: 'source',
      title: 'Rapport de marché',
      content: 'Étude annuelle.',
      sourceUrl: 'https://exemple.test/rapport-2026',
      sourceLabel: 'Rapport 2026',
      verified: true,
    });
    expect(created.statusCode).toBe(201);
    expect((created.json() as { verified: boolean }).verified).toBe(true);

    await inject('POST', '/lab', { kind: 'hypothesis', title: 'Hypothèse non vérifiée', content: 'À tester' });

    const hypotheses = await inject('GET', '/lab', undefined, { kind: 'hypothesis' });
    const data = hypotheses.json()['data'] as { verified: boolean }[];
    expect(data).toHaveLength(1);
    expect(data[0]?.verified).toBe(false); // explicite : non vérifié
  });

  /* ------------------------------ Doctor ------------------------------ */

  it('Doctor : audit exécuté, NOT_TESTED honnête pour les contrôles indisponibles', async () => {
    const run = await inject('POST', '/audits');
    expect(run.statusCode).toBe(201);
    const report = run.json() as {
      summary: { pass: number; warn: number; fail: number; notTested: number };
      results: { id: string; status: string }[];
    };

    const byId = Object.fromEntries(report.results.map((check) => [check.id, check.status]));
    // Contrôles réellement exécutés :
    expect(byId['security.no-embedded-secrets']).toBe('PASS');
    expect(['PASS', 'WARN']).toContain(byId['configuration.project-identity']);
    // Contrôles indisponibles : NOT_TESTED, jamais PASS.
    expect(byId['performance.core-web-vitals']).toBe('NOT_TESTED');
    expect(byId['seo.meta-essentials']).toBe('NOT_TESTED');
    expect(byId['accessibility.wcag-scan']).toBe('NOT_TESTED');
    expect(report.summary.notTested).toBeGreaterThanOrEqual(3);

    // Détecte réellement un secret : on injecte une clé privée dans un fichier.
    await inject('POST', '/files', {
      path: 'leak.pem',
      content: '-----BEGIN RSA PRIVATE KEY-----',
    });
    const second = await inject('POST', '/audits');
    const secondReport = second.json() as { results: { id: string; status: string }[] };
    const secrets = secondReport.results.find((check) => check.id === 'security.no-embedded-secrets');
    expect(secrets?.status).toBe('FAIL');
  });

  it('Doctor : historique conservé', async () => {
    const history = await inject('GET', '/audits');
    expect((history.json()['data'] as unknown[]).length).toBeGreaterThanOrEqual(2);
  });

  it('le filesystem virtuel est bien en base (aucun fichier hôte créé)', async () => {
    const rows = await db.db
      .select({ path: projectFiles.path })
      .from(projectFiles)
      .where(and(eq(projectFiles.projectId, projectId)));
    expect(rows.length).toBeGreaterThan(5);
    expect(rows.every((row) => !row.path.startsWith('/'))).toBe(true);
  });
});
