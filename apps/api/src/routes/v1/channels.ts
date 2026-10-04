import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { ERROR_CODES, createLinkCodeSchema, channelSchema } from '@nexus/contracts';
import type { Channel } from '@nexus/contracts';
import { AppError, parseBody } from '../../middleware/errors.js';
import type { AuthService } from '../../services/authService.js';
import { createAuthGuard } from '../../middleware/authGuard.js';
import { requireOrgAccess } from '../../middleware/guards.js';
import type { Database } from '@nexus/db';
import { organizationMembers } from '@nexus/db';
import type { ChannelAdapter, ChannelService } from '@nexus/channels';

declare module 'fastify' {
  interface FastifyRequest {
    /** Corps brut (parseur JSON scopé aux webhooks canaux, pour HMAC). */
    rawBody?: string;
  }
}

export interface ChannelRoutesOptions {
  authService: AuthService;
  channelService: ChannelService;
  /** Adaptateur par canal — absent ⇒ canal non configuré (404). */
  adapters: Partial<Record<Channel, ChannelAdapter>>;
  /** Secret de signature par canal. */
  secrets: Partial<Record<Channel, string>>;
  /** État d'envoi par canal (honnête : RÉEL seulement si token présent). */
  sendStatus: Partial<Record<Channel, { status: 'ok' | 'blocked'; reason: string }>>;
  db: Database;
}

/** Organisations de l'utilisateur (ids). */
async function organizationsOf(db: Database, userId: string): Promise<string[]> {
  const memberships = await db
    .select({ organizationId: organizationMembers.organizationId })
    .from(organizationMembers)
    .where(eq(organizationMembers.userId, userId));
  return memberships.map((row) => row.organizationId);
}

async function firstOrg(db: Database, userId: string): Promise<string> {
  const [organizationId] = await organizationsOf(db, userId);
  if (!organizationId) throw new AppError(400, ERROR_CODES.VALIDATION_ERROR, 'Aucune organisation.');
  return organizationId;
}

async function targetOrg(db: Database, userId: string, header: unknown): Promise<string> {
  const candidate = typeof header === 'string' && z.string().uuid().safeParse(header).success ? header : null;
  return candidate ?? (await firstOrg(db, userId));
}

/**
 * /v1/channels — copilote de vie numérique côté messagerie.
 *
 * - POST /link-codes      (session + membre) : code de liaison à usage unique.
 * - GET  /identities      (session + membre) : liaisons de l'utilisateur.
 * - DELETE /identities/:id (session + membre) : dissociation.
 * - POST /webhooks/:channel (SANS session : la signature EST l'authentification) :
 *   signature invalide → 401, payload malformé → 400, doublon → ignoré.
 *
 * Isolation : chaque code/liaison est rattaché au tenant (organisation) de
 * l'utilisateur authentifié, vérifié côté serveur (jamais au corps de requête).
 */
export async function channelRoutes(app: FastifyInstance, options: ChannelRoutesOptions): Promise<void> {
  const guard = createAuthGuard(options.authService);
  const { db, channelService, adapters, secrets, sendStatus } = options;

  // Parseur JSON scopé : conserve le corps brut pour la vérification HMAC
  // des webhooks. Un JSON malformé renvoie une 400 propre (jamais un 500).
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_request, body, done) => {
    const raw = typeof body === 'string' ? body : String(body ?? '');
    (_request as FastifyRequest).rawBody = raw;
    try {
      done(null, JSON.parse(raw));
    } catch {
      done(new AppError(400, ERROR_CODES.VALIDATION_ERROR, 'Corps JSON malformé.'));
    }
  });

  // --- Liaison depuis l'application web (session requise) -------------------
  app.post('/link-codes', { preHandler: guard }, async (request, reply) => {
    const input = parseBody(createLinkCodeSchema, request.body);
    const organizationId = await targetOrg(db, request.user!.id, request.headers['x-org-id']);
    await requireOrgAccess(db, request.user!, organizationId, 'member');
    const linkCode = await channelService.createLinkCode(organizationId, request.user!.id, input.channel);
    reply.code(201);
    return { data: linkCode };
  });

  app.get('/identities', { preHandler: guard }, async (request) => {
    const organizationId = await targetOrg(db, request.user!.id, request.headers['x-org-id']);
    await requireOrgAccess(db, request.user!, organizationId, 'member');
    const identities = await channelService.listIdentities(organizationId, request.user!.id);
    return { data: identities };
  });

  app.delete('/identities/:identityId', { preHandler: guard }, async (request) => {
    const { identityId } = request.params as { identityId: string };
    if (!z.string().uuid().safeParse(identityId).success) {
      // 404 anti-énumération : jamais de 400 qui confirmerait l'existence.
      throw new AppError(404, ERROR_CODES.NOT_FOUND, 'Ressource introuvable.');
    }
    const organizationId = await targetOrg(db, request.user!.id, request.headers['x-org-id']);
    await requireOrgAccess(db, request.user!, organizationId, 'member');
    const unlinked = await channelService.unlink(identityId, organizationId, request.user!.id);
    if (!unlinked) {
      // Une liaison d'un autre tenant → 404 (existence jamais révélée).
      throw new AppError(404, ERROR_CODES.NOT_FOUND, 'Ressource introuvable.');
    }
    return { data: { unlinked: true } };
  });

  /** Doctor canaux : état HONNÊTE par canal (config réelle, jamais prétendu). */
  app.get('/diagnostic', { preHandler: guard }, async (request) => {
    const organizationId = await targetOrg(db, request.user!.id, request.headers['x-org-id']);
    await requireOrgAccess(db, request.user!, organizationId, 'member');
    const channels = ['mock', 'telegram', 'whatsapp'] as const;
    return {
      data: channels.map((channel) => {
        const send = sendStatus[channel] ?? { status: 'blocked' as const, reason: 'Adaptateur non enregistré.' };
        return {
          channel,
          webhook: secrets[channel] ? 'configured' : 'missing-secret',
          send: send.status,
          reason: send.reason,
        };
      }),
    };
  });

  // --- Webhooks entrants (la signature est l'authentification) --------------
  app.post('/webhooks/:channel', async (request, reply) => {
    const { channel } = request.params as { channel: string };
    const parsed = channelSchema.safeParse(channel);
    if (!parsed.success) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, 'Canal inconnu.');
    }
    const adapter = adapters[parsed.data];
    if (!adapter) {
      // Canal connu mais non configuré (pas d'adaptateur enregistré).
      throw new AppError(404, ERROR_CODES.NOT_FOUND, 'Canal non configuré.');
    }

    // 1. Signature (temps constant). Absente/invalide → 401.
    const secret = secrets[parsed.data] ?? '';
    const rawBody = request.rawBody ?? '';
    const valid = adapter.verifySignature({ headers: request.headers, rawBody, secret });
    if (!valid) {
      throw new AppError(401, ERROR_CODES.UNAUTHENTICATED, 'Signature de webhook invalide.');
    }

    // 2. Normalisation (payload malformé → 400 propre).
    let messages;
    try {
      messages = adapter.parseWebhook({ headers: request.headers, body: request.body });
    } catch {
      throw new AppError(400, ERROR_CODES.VALIDATION_ERROR, 'Payload webhook malformé.');
    }
    if (messages.length === 0) {
      return reply.code(200).send({ received: 0, duplicate: 0 });
    }

    // 3. Traitement idempotent + réponse. Une erreur d'envoi est journalisée
    //    mais ne fait pas échouer le webhook (les providers rejoueraient).
    const ip = (request.headers['x-forwarded-for'] ?? request.ip).toString().split(',')[0]!.trim();
    let received = 0;
    let duplicates = 0;
    for (const message of messages) {
      const outcome = await channelService.handleInbound(message, 'fr', ip);
      if (outcome.duplicate) {
        duplicates += 1;
        continue;
      }
      received += 1;
      if (outcome.reply) {
        try {
          await adapter.send({ externalId: message.externalSenderId, text: outcome.reply });
        } catch (error) {
          request.log.warn({ err: error, channel: parsed.data }, 'envoi réponse canal impossible');
        }
      }
    }
    return reply.code(200).send({ received, duplicate: duplicates });
  });
}
