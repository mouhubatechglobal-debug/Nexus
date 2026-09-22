import { createServer, type Server } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import handler from '../api/index.ts';

/**
 * Vérification LOCALE du pont serverless (api/index.ts) :
 * simule le comportement Vercel — un serveur HTTP brut dont chaque
 * requête passe par le handler exporté, préfixe /api inclus.
 * Doit s'exécuter avec DB_DRIVER=embedded (NODE_ENV != production).
 */

const ORIGINAL = { ...process.env };
process.env['DB_DRIVER'] = 'embedded';
process.env['QUEUE_DRIVER'] = 'memory';
delete process.env['NODE_ENV'];

// Données isolées pour ce test (PGlite exige un dossier existant).
process.env['NEXUS_TEST_DATA_DIR'] = mkdtempSync(join(tmpdir(), 'nexus-vercel-'));

const server: Server = createServer((req, res) => {
  void handler(req, res);
});

async function main(): Promise<void> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as { port: number };
  const base = `http://127.0.0.1:${port}`;

  // 1. Sonde de santé via le préfixe /api (rewrite simulé).
  const health = await fetch(`${base}/api/health`);
  const healthBody = (await health.json()) as { status: string; checks: { database: string } };
  if (!health.ok || healthBody.checks.database !== 'up') {
    throw new Error(`Santé KO : ${health.status} ${JSON.stringify(healthBody)}`);
  }
  console.log('✓ GET /api/health →', healthBody.status, '(db:', healthBody.checks.database + ')');

  // 2. Enregistrement (écriture réelle en base) — e-mail unique pour
  //    rendre la vérification idempotente sur une base existante.
  const email = `vercel-${Date.now()}@nexus.test`;
  const register = await fetch(`${base}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'MotDePasse2026', organizationName: 'Vercel Check' }),
  });
  if (register.status !== 201) throw new Error(`register: ${register.status} ${await register.text()}`);
  const setCookie = register.headers.get('set-cookie') ?? '';
  const cookie = setCookie.split(';')[0] ?? '';
  console.log('✓ POST /api/v1/auth/register → 201 (cookie de session reçu)');

  // 3. Session : /me répond (cookie transmis).
  const me = await fetch(`${base}/api/v1/auth/me`, { headers: { cookie } });
  if (me.status !== 200) throw new Error(`me: ${me.status}`);
  console.log('✓ GET /api/v1/auth/me → 200');

  // 4. Création de projet (persistance réelle).
  const orgs = (await (await fetch(`${base}/api/v1/organizations`, { headers: { cookie } })).json()) as {
    data: { id: string }[];
  };
  const orgId = orgs.data[0]?.id;
  if (!orgId) throw new Error('Aucune organisation');
  const project = await fetch(`${base}/api/v1/projects`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ organizationId: orgId, name: 'Projet Vercel' }),
  });
  if (project.status !== 201) throw new Error(`project: ${project.status} ${await project.text()}`);
  console.log('✓ POST /api/v1/projects → 201 (persistance OK)');

  // 5. Plateforme : transaction pay + job digest à travers le pont.
  const tx = await fetch(`${base}/api/v1/pay/transactions`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ providerCode: 'wave', amount: 100000, idempotencyKey: 'vercel-check-1' }),
  });
  const txBody = (await tx.json()) as { transaction: { feeAmount: number; netAmount: number } };
  if (tx.status !== 201 || txBody.transaction.feeAmount !== 3500) throw new Error(`pay: ${tx.status}`);
  console.log('✓ POST /api/v1/pay/transactions → 100000/3500/96500');

  const digest = await fetch(`${base}/api/v1/jobs/digest`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ organizationId: orgId }),
  });
  if (digest.status !== 202) throw new Error(`digest: ${digest.status}`);
  console.log('✓ POST /api/v1/jobs/digest → 202');

  console.log('\nVérification serverless : TOUT OK — le handler Vercel est fonctionnel.');
}

main()
  .catch((error: unknown) => {
    console.error('✗ Échec de la vérification serverless :', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    process.env = ORIGINAL;
  });
