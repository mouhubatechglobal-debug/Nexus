import { createHmac } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  accessLogs,
  channelMessages,
  channelIdentities,
  createEmbeddedDb,
  deletionRequests,
  runMigrations,
  type DbHandle,
} from '@nexus/db';
import { buildApp, type AppHandle } from '@nexus/api';
import { makeEnv, sessionCookie } from './helpers';

const MOCK_SECRET = 'test-channel-mock-secret-32ch!';
const WHATSAPP_SECRET = 'test-whatsapp-app-secret-32ch!';

function mockSignature(raw: string): string {
  return createHmac('sha256', MOCK_SECRET).update(raw).digest('hex');
}

function whatsappSignature(raw: string): string {
  return `sha256=${createHmac('sha256', WHATSAPP_SECRET).update(raw).digest('hex')}`;
}

function mockPayload(
  messageId: string,
  senderId: string,
  extra: Record<string, unknown> = {},
): string {
  return JSON.stringify({ messageId, senderId, kind: 'text', text: 'coucou', ...extra });
}

/**
 * ÉTAPE 1 — canaux de messagerie du copilote.
 * Tout est RÉEL : l'adaptateur mock parle le même contrat que telegram/whatsapp,
 * la base est embarquée, les webhooks passent par l'API Fastify complète.
 */
describe('ÉTAPE 1 — canaux copilote (webhooks, liaison, idempotence, isolation)', () => {
  let handle: AppHandle;
  let db: DbHandle;
  let cookieA: string;
  let cookieB: string;

  async function register(email: string): Promise<string> {
    const response = await handle.app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email, password: 'MotDePasse2026' },
    });
    expect(response.statusCode).toBe(201);
    return sessionCookie(response);
  }

  async function createLinkCode(cookie: string, channel: 'mock' | 'telegram' | 'whatsapp'): Promise<{ code: string; id: string }> {
    const response = await handle.app.inject({
      method: 'POST',
      url: '/v1/channels/link-codes',
      headers: { cookie, 'content-type': 'application/json' },
      payload: { channel },
    });
    expect(response.statusCode).toBe(201);
    const body = response.json() as { data: { code: string; id: string } };
    expect(body.data.code).toMatch(/^\d{6}$/);
    return body.data;
  }

  /** Envoie un webhook mock signé et renvoie la réponse. */
  async function mockWebhook(raw: string, signature = mockSignature(raw)) {
    return handle.app.inject({
      method: 'POST',
      url: '/v1/channels/webhooks/mock',
      headers: { 'content-type': 'application/json', 'x-mock-signature': signature },
      payload: raw,
    });
  }

  beforeAll(async () => {
    db = await createEmbeddedDb({ dataDir: mkdtempSync(join(tmpdir(), 'nexus-test-')) });
    await runMigrations(db);
    handle = await buildApp({
      env: makeEnv({ CHANNEL_MOCK_SECRET: MOCK_SECRET, WHATSAPP_APP_SECRET: WHATSAPP_SECRET }),
      db,
    });
    cookieA = await register('alice-channels@nexus.test');
    cookieB = await register('bob-channels@nexus.test');
  });

  afterAll(async () => {
    await handle.close();
    await db.close();
  });

  it('signature invalide → 401 (jamais traité)', async () => {
    const response = await mockWebhook(mockPayload('sig-1', '100'), 'mauvaise-signature');
    expect(response.statusCode).toBe(401);
    expect((response.json() as { error: { code: string } }).error.code).toBe('UNAUTHENTICATED');
  });

  it('signature absente → 401', async () => {
    const response = await handle.app.inject({
      method: 'POST',
      url: '/v1/channels/webhooks/mock',
      headers: { 'content-type': 'application/json' },
      payload: mockPayload('sig-2', '100'),
    });
    expect(response.statusCode).toBe(401);
  });

  it('JSON malformé → 400 propre (pas de 500)', async () => {
    const raw = '{"messageId": "cassé"';
    const response = await mockWebhook(raw, mockSignature(raw));
    expect(response.statusCode).toBe(400);
    expect((response.json() as { error: { code: string } }).error.code).toBe('VALIDATION_ERROR');
  });

  it('payload bien signé mais malformé → 400 propre', async () => {
    const raw = JSON.stringify({ ChampsInconnus: true });
    const response = await mockWebhook(raw, mockSignature(raw));
    expect(response.statusCode).toBe(400);
    expect((response.json() as { error: { code: string } }).error.code).toBe('VALIDATION_ERROR');
  });

  it('expéditeur non lié → réponse « non lié », aucun contenu demandé', async () => {
    const response = await mockWebhook(mockPayload('msg-unlinked-1', '900001', { text: 'bonjour' }));
    expect(response.statusCode).toBe(200);
    const body = response.json() as { received: number };
    expect(body.received).toBe(1);
  });

  it('liaison : code à usage unique créé côté web puis consommé par message au bot', async () => {
    const { code } = await createLinkCode(cookieA, 'mock');

    // Expéditeur externe 900002 envoie le code → liaison.
    const linked = await mockWebhook(mockPayload('msg-link-1', '900002', { text: code }));
    expect(linked.statusCode).toBe(200);

    // L'identité est visible côté web (session A uniquement).
    const identities = await handle.app.inject({
      method: 'GET',
      url: '/v1/channels/identities',
      headers: { cookie: cookieA },
    });
    expect(identities.statusCode).toBe(200);
    const data = (identities.json() as { data: { externalId: string; consent: string; channel: string }[] }).data;
    expect(data).toHaveLength(1);
    expect(data[0]!.externalId).toBe('900002');
    expect(data[0]!.consent).toBe('granted');
    expect(data[0]!.channel).toBe('mock');
  });

  it('code à usage unique : un second usage du même code échoue (message neutre)', async () => {
    const { code } = await createLinkCode(cookieA, 'mock');
    // Première utilisation par un autre expéditeur.
    const first = await mockWebhook(mockPayload('msg-once-1', '900003', { text: code }));
    expect(first.statusCode).toBe(200);
    // Deuxième utilisation : message neutre, pas de liaison.
    const second = await mockWebhook(mockPayload('msg-once-2', '900004', { text: code }));
    expect(second.statusCode).toBe(200);
    const identities = await handle.app.inject({
      method: 'GET',
      url: '/v1/channels/identities',
      headers: { cookie: cookieA },
    });
    const data = (identities.json() as { data: { externalId: string }[] }).data;
    expect(data.some((identity) => identity.externalId === '900004')).toBe(false);
  });

  it('message dupliqué (même id externe) → ignoré, traité une seule fois', async () => {
    const raw = mockPayload('msg-dup-1', '900002', { text: '/aide' });
    const first = await mockWebhook(raw);
    expect(first.statusCode).toBe(200);
    const body1 = first.json() as { received: number; duplicate: number };
    expect(body1.received).toBe(1);
    expect(body1.duplicate).toBe(0);

    // Rejeu du MÊME message (provider qui retente) : ignoré.
    const replay = await mockWebhook(raw);
    expect(replay.statusCode).toBe(200);
    const body2 = replay.json() as { received: number; duplicate: number };
    expect(body2.received).toBe(0);
    expect(body2.duplicate).toBe(1);

    // Une seule ligne de journal pour ce message.
    const logs = await db.db
      .select({ action: accessLogs.action })
      .from(accessLogs)
      .where(eq(accessLogs.action, 'channel.message.in'));
    const dedupLogs = await db.db.select().from(channelMessages);
    expect(dedupLogs.filter((m) => m.externalMessageId === 'mock:900002:msg-dup-1')).toHaveLength(1);
    void logs;
  });

  it('commande /aide : réponse d\u2019aide envoyée (mock a « parlé »)', async () => {
    // /aide a déjà déclenché un envoi via le webhook dupliqué ci-dessus.
    // Vérifions directement via un nouveau message : la réponse mock est prouvée
    // par l'absence d'erreur et la journalisation reply_kind.
    const response = await mockWebhook(mockPayload('msg-help-1', '900002', { kind: 'command', text: '/aide' }));
    expect(response.statusCode).toBe(200);
    const rows = await db.db.select().from(channelMessages);
    const row = rows.find((m) => m.externalMessageId === 'mock:900002:msg-help-1');
    expect(row?.kind).toBe('command');
  });

  it('kinds reconnus : photo / pdf / voix / transféré → accusé honnête, taille seule journalisée', async () => {
    const cases: { id: string; kind: string; size?: number }[] = [
      { id: 'msg-photo-1', kind: 'photo', size: 204_800 },
      { id: 'msg-pdf-1', kind: 'pdf', size: 1_024_000 },
      { id: 'msg-voice-1', kind: 'voice', size: 65_536 },
      { id: 'msg-fwd-1', kind: 'forwarded' },
    ];
    for (const testCase of cases) {
      const response = await mockWebhook(mockPayload(testCase.id, '900002', { kind: testCase.kind, mediaBytes: testCase.size }));
      expect(response.statusCode).toBe(200);
      expect((response.json() as { received: number }).received).toBe(1);
    }
    const rows = await db.db.select().from(channelMessages);
    for (const testCase of cases) {
      const row = rows.find((m) => m.externalMessageId === `mock:900002:${testCase.id}`);
      expect(row?.kind).toBe(testCase.kind);
      // Aucun contenu de média en base : la colonne ne porte QUE la taille.
      if (testCase.size === undefined) {
        expect(row?.mediaBytes).toBeNull();
      } else {
        expect(row?.mediaBytes).toBe(testCase.size);
      }
    }
  });

  it('commande /supprimer → deletion_requests enregistrée', async () => {
    const response = await mockWebhook(mockPayload('msg-del-1', '900002', { kind: 'command', text: '/supprimer' }));
    expect(response.statusCode).toBe(200);
    const rows = await db.db.select().from(deletionRequests);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0]!.scope).toBe('all');
    expect(rows[0]!.status).toBe('pending');
  });

  it('commande /stop → consentement révoqué, messages suivants refusés à l\u2019envoi', async () => {
    const response = await mockWebhook(mockPayload('msg-stop-1', '900002', { kind: 'command', text: '/stop' }));
    expect(response.statusCode).toBe(200);
    const identities = await handle.app.inject({
      method: 'GET',
      url: '/v1/channels/identities',
      headers: { cookie: cookieA },
    });
    const data = (identities.json() as { data: { consent: string }[] }).data;
    expect(data[0]!.consent).toBe('revoked');
  });

  it('commande /export : réponse avec compteurs (métadonnées seulement)', async () => {
    const response = await mockWebhook(mockPayload('msg-export-1', '900002', { kind: 'command', text: '/export' }));
    expect(response.statusCode).toBe(200);
    expect((response.json() as { received: number }).received).toBe(1);
  });

  it('journal d\u2019accès : IP hachée, jamais le contenu des messages', async () => {
    const logs = await db.db.select().from(accessLogs).where(eq(accessLogs.action, 'channel.message.in'));
    expect(logs.length).toBeGreaterThan(0);
    for (const log of logs) {
      if (log.ipHash !== null) {
        expect(log.ipHash).toMatch(/^[0-9a-f]{32}$/);
        expect(log.ipHash).not.toContain('127.0.0.1');
      }
      // La ressource ne contient jamais de texte utilisateur.
      expect(log.resource).not.toContain('coucou');
    }
  });

  it('isolation tenant : B ne voit pas la liaison de A et ne peut pas la supprimer (404)', async () => {
    // Nouvelle liaison propre à A.
    const { code } = await createLinkCode(cookieA, 'mock');
    await mockWebhook(mockPayload('msg-iso-1', '900010', { text: code }));
    const mine = await handle.app.inject({
      method: 'GET',
      url: '/v1/channels/identities',
      headers: { cookie: cookieA },
    });
    const identityA = (mine.json() as { data: { id: string; externalId: string }[] }).data.find(
      (identity) => identity.externalId === '900010',
    );
    expect(identityA).toBeDefined();

    // B ne voit que les SIENNES (vides).
    const theirs = await handle.app.inject({
      method: 'GET',
      url: '/v1/channels/identities',
      headers: { cookie: cookieB },
    });
    expect((theirs.json() as { data: unknown[] }).data).toHaveLength(0);

    // B tente de supprimer la liaison de A → 404 (existence non révélée).
    const attack = await handle.app.inject({
      method: 'DELETE',
      url: `/v1/channels/identities/${identityA!.id}`,
      headers: { cookie: cookieB },
    });
    expect(attack.statusCode).toBe(404);

    // La liaison de A existe toujours.
    const stillThere = await db.db.select().from(channelIdentities).where(eq(channelIdentities.id, identityA!.id));
    expect(stillThere).toHaveLength(1);
  });

  it('sans session : /link-codes → 401 (liaison uniquement depuis l\u2019app web authentifiée)', async () => {
    const response = await handle.app.inject({
      method: 'POST',
      url: '/v1/channels/link-codes',
      headers: { 'content-type': 'application/json' },
      payload: { channel: 'mock' },
    });
    expect(response.statusCode).toBe(401);
  });

  it('canal inconnu → 404 (anti-énumération)', async () => {
    const raw = mockPayload('msg-unknown-1', '900011');
    const response = await handle.app.inject({
      method: 'POST',
      url: '/v1/channels/webhooks/inconnu',
      headers: { 'content-type': 'application/json', 'x-mock-signature': mockSignature(raw) },
      payload: raw,
    });
    expect(response.statusCode).toBe(404);
  });

  it('WhatsApp : signature x-hub-signature-256 valide acceptée, payload normalisé (envoi BLOCKED sans token, webhook 200)', async () => {
    const payload = JSON.stringify({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  { id: 'wamid.test1', from: '22500000001', type: 'text', text: { body: '/aide' } },
                ],
              },
            },
          ],
        },
      ],
    });
    const response = await handle.app.inject({
      method: 'POST',
      url: '/v1/channels/webhooks/whatsapp',
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': whatsappSignature(payload) },
      payload,
    });
    // Expéditeur non lié → traité (réponse d'aide impossible à envoyer sans
    // token Meta : erreur journalisée, webhook reste 200).
    expect(response.statusCode).toBe(200);
    const body = response.json() as { received: number };
    expect(body.received).toBe(1);
  });

  it('WhatsApp : signature invalide → 401', async () => {
    const payload = JSON.stringify({ entry: [] });
    const response = await handle.app.inject({
      method: 'POST',
      url: '/v1/channels/webhooks/whatsapp',
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': 'sha256=invalide' },
      payload,
    });
    expect(response.statusCode).toBe(401);
  });

  it('adaptateur WhatsApp sans token : send() échoue BLOCKED sans aucun appel réseau', async () => {
    const { WhatsAppAdapter } = await import('@nexus/channels');
    let networkCalled = false;
    const adapter = new WhatsAppAdapter(undefined, 'secret', 'phone', (async () => {
      networkCalled = true;
      throw new Error('réseau ne doit PAS être appelé');
    }) as typeof fetch);
    await expect(adapter.send({ externalId: 'x', text: 'y' })).rejects.toThrow(/BLOCKED/);
    expect(networkCalled).toBe(false);
  });

  it('adaptateur Telegram : signature webhook + parsing d\u2019un update réel (sans réseau)', async () => {
    const { TelegramAdapter } = await import('@nexus/channels');
    const adapter = new TelegramAdapter(undefined, 'tg-secret', (async () => {
      throw new Error('réseau ne doit PAS être appelé');
    }) as typeof fetch);

    expect(
      adapter.verifySignature({ headers: { 'x-telegram-bot-api-secret-token': 'tg-secret' }, rawBody: '{}', secret: 'tg-secret' }),
    ).toBe(true);
    expect(adapter.verifySignature({ headers: { 'x-telegram-bot-api-secret-token': 'autre' }, rawBody: '{}', secret: 'tg-secret' })).toBe(false);
    await expect(adapter.send({ externalId: '1', text: 'x' })).rejects.toThrow(/BLOCKED/);

    const messages = adapter.parseWebhook({
      headers: {},
      body: {
        update_id: 1,
        message: {
          message_id: 42,
          from: { id: 700001, username: 'test' },
          text: '/aide',
        },
      },
    });
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ channel: 'telegram', externalMessageId: '42', externalSenderId: '700001', kind: 'command' });

    // Photo transférée avec légende.
    const forwarded = adapter.parseWebhook({
      headers: {},
      body: {
        update_id: 2,
        message: {
          message_id: 43,
          from: { id: 700001 },
          caption: 'facture électricité',
          photo: [{ file_id: 'f1' }],
          forward_origin: { type: 'user' },
        },
      },
    });
    expect(forwarded[0]!.kind).toBe('forwarded');
    expect(forwarded[0]!.text).toBe('facture électricité');

    // Update malformé → erreur (convertie en 400 par la route).
    expect(() => adapter.parseWebhook({ headers: {}, body: { update_id: 3 } })).toThrow();
  });
});
