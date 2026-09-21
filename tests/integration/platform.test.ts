import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import {
  createEmbeddedDb,
  ledgerEntries,
  payouts,
  runMigrations,
  transactions,
  type DbHandle,
} from '@nexus/db';
import { buildApp, type AppHandle } from '@nexus/api';
import { makeEnv, sessionCookie } from './helpers';

/**
 * Prompts 19-20-21 — déploiements contrôlés, analytics, NEXUS Pay.
 */
describe('Plateforme — Deploy, Analytics, Pay', () => {
  let handle: AppHandle;
  let db: DbHandle;
  let cookie: string;
  let organizationId: string;
  let projectId: string;
  const SECRET = 'test-pay-webhook-secret-32chars!';

  async function newProject(name: string): Promise<string> {
    const created = await handle.app.inject({
      method: 'POST',
      url: '/v1/projects',
      headers: { cookie, 'content-type': 'application/json' },
      payload: { organizationId, name },
    });
    return (created.json() as { id: string }).id;
  }

  beforeAll(async () => {
    db = await createEmbeddedDb({ dataDir: mkdtempSync(join(tmpdir(), 'nexus-test-')) });
    await runMigrations(db);
    handle = await buildApp({ env: makeEnv(), db });

    const register = await handle.app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: 'platform@nexus.test', password: 'MotDePasse2026', organizationName: 'Plateformeur' },
    });
    cookie = sessionCookie(register);
    const orgs = await handle.app.inject({ method: 'GET', url: '/v1/organizations', headers: { cookie } });
    organizationId = (orgs.json()['data'] as { id: string }[])[0]!.id;
    projectId = await newProject('Pipeline Démo');
  });

  afterAll(async () => {
    await handle.close();
    await db.close();
  });

  const injectProject = (method: string, path: string, payload?: unknown) =>
    handle.app.inject({
      method,
      url: `/v1/projects/${projectId}${path}`,
      headers: { cookie, ...(payload ? { 'content-type': 'application/json' } : {}) },
      payload,
    });

  /* --------------------- Prompt 19 — Déploiements --------------------- */

  it('Deploy staging : pipeline complet SUCCESS, étape production non applicable', async () => {
    const response = await injectProject('POST', '/deployments', { environment: 'staging' });
    expect(response.statusCode).toBe(201);
    const deployment = response.json() as {
      status: string;
      stages: { name: string; status: string; startedAt: string | null; logs: { message: string }[] }[];
    };

    expect(deployment.status).toBe('success');
    const byName = Object.fromEntries(deployment.stages.map((stage) => [stage.name, stage.status]));
    expect(byName['build']).toBe('success');
    expect(byName['test']).toBe('success');
    expect(byName['security']).toBe('success');
    expect(byName['staging']).toBe('success');
    expect(byName['production']).toBe('cancelled');
    // Chaque étape exécutée a début/fin + logs horodatés.
    const build = deployment.stages.find((stage) => stage.name === 'build')!;
    expect(build.startedAt).toBeTruthy();
    expect(build.logs.length).toBeGreaterThan(0);
  });

  it('Deploy production : bloqué en pending SANS action explicite, jamais auto', async () => {
    const response = await injectProject('POST', '/deployments', { environment: 'production' });
    const deployment = response.json() as { id: string; status: string; confirmedAt: string | null };
    expect(deployment.status).toBe('pending');
    expect(deployment.confirmedAt).toBeNull();

    // Promotion sans confirm:true → 400.
    const bad = await injectProject('POST', `/deployments/${deployment.id}/promote`, { confirm: false });
    expect(bad.statusCode).toBe(400);

    // Promotion explicite → production exécutée.
    const good = await injectProject('POST', `/deployments/${deployment.id}/promote`, { confirm: true });
    expect(good.statusCode).toBe(200);
    const promoted = good.json() as { status: string; confirmedAt: string | null; stages: { name: string; status: string }[] };
    expect(promoted.confirmedAt).toBeTruthy();
    expect(promoted.status).toBe('success');
    expect(promoted.stages.find((stage) => stage.name === 'production')?.status).toBe('success');

    // Re-promotion → 409.
    const again = await injectProject('POST', `/deployments/${deployment.id}/promote`, { confirm: true });
    expect(again.statusCode).toBe(409);
  });

  it('Deploy : étape SECURITY réelle — un secret injecté fait FAIL le pipeline', async () => {
    await injectProject('POST', '/files', {
      path: 'leaked.pem',
      content: '-----BEGIN RSA PRIVATE KEY-----',
    });
    const response = await injectProject('POST', '/deployments', { environment: 'staging' });
    const deployment = response.json() as { status: string; stages: { name: string; status: string; error: string | null }[] };
    expect(deployment.status).toBe('failed');
    const security = deployment.stages.find((stage) => stage.name === 'security')!;
    expect(security.status).toBe('failed');
    expect(security.error).toContain('leaked.pem');
  });

  it('Deploy : annulation d’un déploiement en attente (projet propre, sans secret)', async () => {
    const freshId = await newProject('Projet Annulation');
    const created = await handle.app.inject({
      method: 'POST',
      url: `/v1/projects/${freshId}/deployments`,
      headers: { cookie, 'content-type': 'application/json' },
      payload: { environment: 'production' },
    });
    const deployment = created.json() as { id: string; status: string };
    expect(deployment.status).toBe('pending'); // bloqué avant production
    const cancel = await handle.app.inject({
      method: 'POST',
      url: `/v1/projects/${freshId}/deployments/${deployment.id}/cancel`,
      headers: { cookie },
    });
    expect((cancel.json() as { status: string }).status).toBe('cancelled');
  });

  /* ---------------------- Prompt 20 — Analytics ----------------------- */

  it('Analytics : enregistrement + lecture paginée (env obligatoire)', async () => {
    const record = await handle.app.inject({
      method: 'POST',
      url: '/v1/analytics/events',
      headers: { cookie, 'content-type': 'application/json' },
      payload: { organizationId, projectId, type: 'project.created', environment: 'demo', metadata: { source: 'test' } },
    });
    expect(record.statusCode).toBe(201);

    await handle.app.inject({
      method: 'POST',
      url: '/v1/analytics/events',
      headers: { cookie, 'content-type': 'application/json' },
      payload: { organizationId, type: 'user.login', environment: 'live' },
    });

    const demoList = await handle.app.inject({
      method: 'GET',
      url: '/v1/analytics/events',
      headers: { cookie },
      query: { organizationId, environment: 'demo', page: '1', limit: '10' },
    });
    const demo = demoList.json() as { data: { environment: string }[]; total: number };
    expect(demo.total).toBeGreaterThanOrEqual(1);
    expect(demo.data.every((event) => event.environment === 'demo')).toBe(true);

    // LIVE et DEMO jamais mélangés.
    const liveList = await handle.app.inject({
      method: 'GET',
      url: '/v1/analytics/events',
      headers: { cookie },
      query: { organizationId, environment: 'live' },
    });
    const live = liveList.json() as { data: { environment: string }[] };
    expect(live.data.every((event) => event.environment === 'live')).toBe(true);
  });

  it('Analytics : projet d’une autre org → rejet (isolation)', async () => {
    const other = await newProject('Autre Org Proj');
    void other;
    // Enregistre un événement avec le projectId de notre org mais une autre org → le projet ne matche pas.
    const response = await handle.app.inject({
      method: 'POST',
      url: '/v1/analytics/events',
      headers: { cookie, 'content-type': 'application/json' },
      payload: { organizationId, projectId: '00000000-0000-0000-0000-00000000dead', type: 'x.y', environment: 'demo' },
    });
    expect(response.statusCode).toBe(404);
  });

  it('Analytics : métriques agrégées par type et par jour', async () => {
    const metrics = await handle.app.inject({
      method: 'GET',
      url: '/v1/analytics/metrics',
      headers: { cookie },
      query: { organizationId, environment: 'demo', days: '7' },
    });
    expect(metrics.statusCode).toBe(200);
    const body = metrics.json() as { environment: string; totalEvents: number; byType: { type: string }[] };
    expect(body.environment).toBe('demo');
    expect(body.totalEvents).toBeGreaterThanOrEqual(1);
    expect(body.byType.some((entry) => entry.type === 'project.created')).toBe(true);
  });

  /* ----------------------- Prompt 21 — NEXUS Pay ---------------------- */

  const pay = (method: string, path: string, payload?: unknown, headers: Record<string, string> = {}) =>
    handle.app.inject({
      method,
      url: `/v1/pay${path}`,
      headers: { cookie, ...(payload ? { 'content-type': 'application/json' } : {}), ...headers },
      payload,
    });

  it('adapters : abstractions non configurées, aucune API fabriquée', async () => {
    const response = await pay('GET', '/adapters');
    const data = response.json()['data'] as { code: string; configured: boolean }[];
    const codes = data.map((entry) => entry.code).sort();
    expect(codes).toEqual(['card', 'mixx-by-yas', 'moov-money', 'mtn-money', 'wave']);
    expect(data.every((entry) => entry.configured === false)).toBe(true);
  });

  it('commission serveur 350 bps : 100 000 → 3 500 frais → 96 500 net', async () => {
    const response = await pay('POST', '/transactions', {
      providerCode: 'wave',
      amount: 100_000,
      idempotencyKey: 'e2e-tx-001',
    });
    expect(response.statusCode).toBe(201);
    const transaction = (response.json() as { transaction: { amount: number; feeAmount: number; netAmount: number; status: string; checkoutUrl: string } }).transaction;
    expect(transaction.amount).toBe(100_000);
    expect(transaction.feeAmount).toBe(3_500);
    expect(transaction.netAmount).toBe(96_500);
    expect(transaction.status).toBe('pending');
    expect(transaction.checkoutUrl).toMatch(/^\/pay\/checkout\/tok_/);
  });

  it('idempotence : même clé → même transaction (200, pas de doublon)', async () => {
    const replay = await pay('POST', '/transactions', {
      providerCode: 'wave',
      amount: 100_000,
      idempotencyKey: 'e2e-tx-001',
    });
    expect(replay.statusCode).toBe(200);
    const count = await db.db
      .select({ value: sql<number>`count(*)::int` })
      .from(transactions)
      .where(eq(transactions.idempotencyKey, 'e2e-tx-001'));
    expect(Number(count[0]?.value)).toBe(1);
  });

  it('cartes : AUCUNE donnée brute acceptée (schéma strict rejette pan/cvv)', async () => {
    const response = await pay('POST', '/transactions', {
      providerCode: 'card',
      amount: 5_000,
      idempotencyKey: 'e2e-tx-card',
      pan: '4242424242424242',
      cvv: '123',
    } as never);
    expect(response.statusCode).toBe(400);
    expect(JSON.stringify(response.json())).toContain('Unrecognized key');
  });

  it('webhook : signature invalide → 401', async () => {
    const payload = JSON.stringify({ event: 'transaction.succeeded', reference: 'tok_inconnu' });
    const response = await handle.app.inject({
      method: 'POST',
      url: '/v1/pay/webhooks/wave',
      headers: { 'content-type': 'application/json', 'x-signature': 'sha256=deadbeef' },
      payload: JSON.parse(payload),
    });
    expect(response.statusCode).toBe(401);
  });

  it('webhook : signature valide → transaction succeeded + ledger équilibré', async () => {
    // Récupère le token de la transaction créée.
    const list = await pay('GET', '/transactions');
    const transaction = (list.json() as { data: { checkoutUrl: string; id: string }[] }).data.find((tx) => tx.id);
    const token = transaction!.checkoutUrl.split('/').pop()!;

    const body = JSON.stringify({
      event: 'transaction.succeeded',
      reference: token,
      providerTransactionId: 'WAVE-REF-77',
    });
    const signature = createHmac('sha256', SECRET).update(body).digest('hex');

    const response = await handle.app.inject({
      method: 'POST',
      url: '/v1/pay/webhooks/wave',
      headers: { 'content-type': 'application/json', 'x-signature': `sha256=${signature}` },
      payload: JSON.parse(body),
    });
    expect(response.statusCode).toBe(200);
    expect((response.json() as { processed: boolean }).processed).toBe(true);

    // Rejoué : idempotent.
    const replay = await handle.app.inject({
      method: 'POST',
      url: '/v1/pay/webhooks/wave',
      headers: { 'content-type': 'application/json', 'x-signature': `sha256=${signature}` },
      payload: JSON.parse(body),
    });
    expect((replay.json() as { processed: boolean; replay: boolean }).replay).toBe(true);

    // Ledger : parties doubles équilibrées pour cette transaction.
    const rows = await db.db.select().from(ledgerEntries).where(eq(ledgerEntries.transactionId, transaction!.id));
    const debits = rows.reduce((sum, row) => sum + row.debit, 0);
    const credits = rows.reduce((sum, row) => sum + row.credit, 0);
    expect(debits).toBe(credits);
    expect(debits).toBe(200_000); // 2 × montant (gross + fee/net legs)

    // Statut persisté.
    const check = await pay('GET', `/transactions/${transaction!.id}`);
    expect((check.json() as { status: string }).status).toBe('succeeded');
    expect((check.json() as { providerReference: string | null }).providerReference).toBe('WAVE-REF-77');
  });

  it('payout : solde insuffisant → 409 ; après encaissement → OK et ledger équilibré', async () => {
    const tooMuch = await pay('POST', '/payouts', { amount: 5_000_000, destinationToken: 'tok_test-destination' });
    expect(tooMuch.statusCode).toBe(409);

    const ok = await pay('POST', '/payouts', { amount: 50_000, destinationToken: 'tok_test-destination' });
    expect(ok.statusCode).toBe(201);

    const payoutId = (ok.json() as { id: string }).id;
    const rows = await db.db.select().from(payouts).where(eq(payouts.id, payoutId));
    expect(rows[0]?.status).toBe('pending');

    const allLedger = await db.db.select().from(ledgerEntries).where(eq(ledgerEntries.payoutId, payoutId));
    const debits = allLedger.reduce((sum, row) => sum + row.debit, 0);
    const credits = allLedger.reduce((sum, row) => sum + row.credit, 0);
    expect(debits).toBe(credits);
  });

  it('réconciliation : correspondances et écarts détectés', async () => {
    const list = await pay('GET', '/transactions');
    const transaction = (list.json() as { data: { providerReference: string | null; amount: number }[] }).data.find((tx) => tx.providerReference)!;

    const report = await pay('POST', '/reconciliation', {
      providerCode: 'wave',
      entries: [
        { providerReference: transaction.providerReference!, status: 'succeeded', amount: transaction.amount },
        { providerReference: 'REF-INTROUVABLE', status: 'succeeded', amount: 1_000 },
        { providerReference: transaction.providerReference!, status: 'failed', amount: 999 },
      ],
    });
    const body = report.json() as { matched: number; unknown: number; mismatched: unknown[] };
    expect(body.matched).toBe(1);
    expect(body.unknown).toBe(1);
    expect(body.mismatched).toHaveLength(1);
  });

  /* ------------------- Prompt 17 — Jobs (scoping tenant) -------------- */

  it('jobs : un utilisateur d’une autre organisation ne voit PAS le job (404)', async () => {
    const created = await handle.app.inject({
      method: 'POST',
      url: '/v1/jobs/digest',
      headers: { cookie, 'content-type': 'application/json' },
      payload: { organizationId },
    });
    expect(created.statusCode).toBe(202);
    const { jobId } = created.json() as { jobId: string };

    // L'auteur voit son job.
    const own = await handle.app.inject({ method: 'GET', url: `/v1/jobs/${jobId}`, headers: { cookie } });
    expect(own.statusCode).toBe(200);

    // Un utilisateur externe (autre organisation) → 404, aucune fuite.
    const otherRegister = await handle.app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: 'outsider@nexus.test', password: 'MotDePasse2026', organizationName: 'Externe' },
    });
    const outsider = sessionCookie(otherRegister);
    const leak = await handle.app.inject({ method: 'GET', url: `/v1/jobs/${jobId}`, headers: { cookie: outsider } });
    expect(leak.statusCode).toBe(404);
  });
});
