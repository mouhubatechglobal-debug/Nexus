#!/usr/bin/env node
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';

/**
 * Simulation LOCALE du bundling Vercel (@vercel/node) :
 * 1. esbuild aplatit api/index.ts en UN fichier (ce que fait le builder) ;
 * 2. le dossier des migrations est copié dans la « fonction » comme
 *    includeFiles root-relative ;
 * 3. le bundle est exécuté et sert un flux E2E complet.
 *
 * But : détecter ce que la plateforme casse silencieusement à l'aplatissement
 * (import.meta.url, imports dynamiques, fichiers additionnels manquants).
 */

const root = resolve(import.meta.dirname, '..');
const sim = join(root, '.vercel-sim');

rmSync(sim, { recursive: true, force: true });
mkdirSync(sim, { recursive: true });

// 1. Bundle esbuild (comme @vercel/node) : sources locales aplaties,
//    node_modules externe (NFT) — voir commentaire dans les options.
console.log('→ esbuild api/index.ts → .vercel-sim/index.mjs');
execFileSync(
  './node_modules/.bin/esbuild',
  [
    join('api', 'index.ts'),
    '--bundle',
    '--platform=node',
    '--format=esm',
    `--outfile=${join(sim, 'index.mjs')}`,
    '--packages=external',
    // Shim identique à celui injecté par @vercel/node pour les sorties ESM :
    // les dépendances CJS (fastify…) peuvent require() des builtins node.
    '--banner:js=import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
    '--log-level=warning',
  ],
  { cwd: root, stdio: 'inherit' },
);

// 2. Dossier migrations copié (layout root-relative préservé).
cpSync(join(root, 'packages', 'db', 'drizzle'), join(sim, 'packages', 'db', 'drizzle'), { recursive: true });

// 3. Pilote : serveur HTTP brut → handler du bundle → flux E2E.
const driver = `
import { createServer } from 'node:http';
process.env.VERCEL = '1'; // conditions exactes d'une fonction Vercel
process.env.DB_DRIVER = 'embedded';
process.env.QUEUE_DRIVER = 'memory';
process.env.NEXUS_DATA_DIR = import.meta.dirname + '/data';
process.env.COOKIE_SECRET = 'simulation-cookie-secret-32-chars!';
process.env.PAY_WEBHOOK_SECRET = 'simulation-pay-secret-32-chars!!';
const { default: handler } = await import('./index.mjs');
const server = createServer((req, res) => void handler(req, res));
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const { port } = server.address();
const base = 'http://127.0.0.1:' + port;
const fail = (m) => { console.error('✗ ' + m); process.exit(1); };

const health = await fetch(base + '/api/health');
const hb = await health.json();
if (!health.ok || hb.checks?.database !== 'up') fail('santé: ' + JSON.stringify(hb));
console.log('✓ GET /api/health (bundle aplati, migrations résolues) → db: up');

const email = 'bundle-' + Date.now() + '@nexus.test';
const register = await fetch(base + '/api/v1/auth/register', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email, password: 'MotDePasse2026', organizationName: 'Bundle Sim' }),
});
if (register.status !== 201) fail('register: ' + register.status + ' ' + (await register.text()));
const cookie = (register.headers.get('set-cookie') ?? '').split(';')[0];
console.log('✓ POST /api/v1/auth/register → 201 (Argon2 opérationnel)');

const me = await fetch(base + '/api/v1/auth/me', { headers: { cookie } });
if (me.status !== 200) fail('me: ' + me.status);
console.log('✓ GET /api/v1/auth/me → 200');

const orgs = await (await fetch(base + '/api/v1/organizations', { headers: { cookie } })).json();
const orgId = orgs.data[0].id;
const project = await fetch(base + '/api/v1/projects', {
  method: 'POST', headers: { cookie, 'content-type': 'application/json' },
  body: JSON.stringify({ organizationId: orgId, name: 'Projet Bundle' }),
});
if (project.status !== 201) fail('project: ' + project.status + ' ' + (await project.text()));
console.log('✓ POST /api/v1/projects → 201 (persistance OK)');

const tx = await fetch(base + '/api/v1/pay/transactions', {
  method: 'POST', headers: { cookie, 'content-type': 'application/json' },
  body: JSON.stringify({ providerCode: 'wave', amount: 100000, idempotencyKey: 'bundle-1' }),
});
const txBody = await tx.json();
if (tx.status !== 201 || txBody.transaction.feeAmount !== 3500) fail('pay: ' + tx.status);
console.log('✓ POST /api/v1/pay/transactions → 100000/3500/96500');

const digest = await fetch(base + '/api/v1/jobs/digest', {
  method: 'POST', headers: { cookie, 'content-type': 'application/json' },
  body: JSON.stringify({ organizationId: orgId }),
});
if (digest.status !== 202) fail('digest: ' + digest.status);
console.log('✓ POST /api/v1/jobs/digest → 202');

console.log('SIMULATION VERCEL BUNDLE : TOUT OK');
server.close();
process.exit(0);
`;
writeFileSync(join(sim, 'driver.mjs'), driver);

console.log('→ exécution du bundle (esbuild aplati) + flux E2E');
const run = spawnSync(process.execPath, [join(sim, 'driver.mjs')], { encoding: 'utf8', timeout: 120_000 });
process.stdout.write(run.stdout ?? '');
if (run.stderr) process.stderr.write(run.stderr.split('\n').filter((l) => !/ExperimentalWarning|--trace-warnings/.test(l)).join('\n'));
if (run.status !== 0) {
  console.error('\n✗ ÉCHEC de la simulation de bundle Vercel.');
  process.exit(1);
}
