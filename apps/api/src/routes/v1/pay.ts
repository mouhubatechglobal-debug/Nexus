import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import {
  createPayoutSchema,
  createTransactionSchema,
  reconciliationSchema,
} from '@nexus/contracts';
import { AppError, parseBody } from '../../middleware/errors.js';
import { ERROR_CODES } from '@nexus/contracts';
import type { AuthService } from '../../services/authService.js';
import { createAuthGuard } from '../../middleware/authGuard.js';
import { requireOrgAccess } from '../../middleware/guards.js';
import type { PayService } from '../../services/payService.js';
import type { Database } from '@nexus/db';
import { organizationMembers, organizations } from '@nexus/db';

export interface PayRoutesOptions {
  authService: AuthService;
  payService: PayService;
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

/**
 * /v1/pay — fondation NEXUS Pay.
 * Aucun appel fournisseur réel : adapters non configurés (abstractions
 * prêtes pour les intégrations officielles). Webhooks : signature HMAC.
 */
export async function payRoutes(app: FastifyInstance, options: PayRoutesOptions): Promise<void> {
  const guard = createAuthGuard(options.authService);
  const { db, payService } = options;

  app.get('/adapters', { preHandler: guard }, async () => ({ data: payService.adapters }));

  app.post('/transactions', { preHandler: guard }, async (request, reply) => {
    const input = parseBody(createTransactionSchema, request.body);
    // Organisation cible : x-org-id (validé par l'appartenance), sinon la première.
    const orgHeader = request.headers['x-org-id'];
    const candidate = typeof orgHeader === 'string' ? orgHeader : null;
    const organizationId =
      candidate && z.string().uuid().safeParse(candidate).success
        ? candidate
        : await firstOrg(db, request.user!.id);
    await requireOrgAccess(db, request.user!, organizationId, 'member');
    const [org] = await db
      .select({ name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    const result = await payService.createTransaction(organizationId, org?.name ?? 'Marchand', input);
    reply.code(result.idempotentReplay ? 200 : 201);
    return result;
  });

  app.get('/transactions', { preHandler: guard }, async (request) => {
    const query = parseBody(
      z.object({
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
      }),
      request.query,
    );
    const organizationId = await firstOrg(db, request.user!.id);
    await requireOrgAccess(db, request.user!, organizationId, 'member');
    return payService.listTransactions(organizationId, query.page, query.limit);
  });

  app.get('/transactions/:transactionId', { preHandler: guard }, async (request) => {
    const { transactionId } = request.params as { transactionId: string };
    const organizationId = await firstOrg(db, request.user!.id);
    await requireOrgAccess(db, request.user!, organizationId, 'member');
    return payService.getTransaction(organizationId, transactionId);
  });

  app.post('/payouts', { preHandler: guard }, async (request, reply) => {
    const input = parseBody(createPayoutSchema, request.body);
    const organizationId = await firstOrg(db, request.user!.id);
    // Payout = opération sensible : rôle ADMIN requis.
    await requireOrgAccess(db, request.user!, organizationId, 'admin');
    const payout = await payService.createPayout(organizationId, input.amount, input.destinationToken);
    reply.code(201);
    return payout;
  });

  app.post('/reconciliation', { preHandler: guard }, async (request) => {
    const input = parseBody(reconciliationSchema, request.body);
    const organizationId = await firstOrg(db, request.user!.id);
    await requireOrgAccess(db, request.user!, organizationId, 'admin');
    return payService.reconcile(organizationId, input.providerCode, input.entries);
  });

  /**
   * Webhook provider — SANS session : signature HMAC-SHA256 du JSON
   * canonique (en-tête `x-signature: sha256=…`). Idempotent.
   */
  app.post(
    '/webhooks/:providerCode',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const { providerCode } = request.params as { providerCode: string };
      const signature = request.headers['x-signature'];
      const raw = JSON.stringify(request.body);
      const result = await payService.handleWebhook(providerCode, raw, typeof signature === 'string' ? signature : undefined);
      return reply.code(200).send(result);
    },
  );
}
