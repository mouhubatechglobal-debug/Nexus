import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { and, count, desc, eq, inArray, or, sql } from 'drizzle-orm';
import {
  calculateFee,
  transactionSchema,
  webhookPayloadSchema,
  type CreateTransactionInput,
  type Transaction,
  type WebhookPayload,
} from '@nexus/contracts';
import type { Database } from '@nexus/db';
import { ledgerEntries, merchants, paymentProviders, payouts, transactions } from '@nexus/db';
import { AppError } from '../middleware/errors.js';
import { ERROR_CODES } from '@nexus/contracts';
import type { Env } from '../config/index.js';

/**
 * NEXUS Pay — fondation complète.
 *
 * Architecture : PaymentProvider → PaymentRouter → TransactionEngine →
 * FeeEngine → Ledger → WebhookHandler → Reconciliation → Payout.
 *
 * Honnêteté :
 * - les adapters (Mixx by Yas, Moov Money, Wave, MTN Money, Card) sont des
 *   ABSTRACTIONS — aucune API fournisseur n'est fabriquée ni appelée ;
 *   `configured: false` tant qu'aucune intégration officielle n'existe ;
 * - cartes : checkout hébergé tokenisé — AUCUN PAN/CVV/donnée brute
 *   n'est accepté (schémas stricts) ni stocké ;
 * - commission 350 bps calculée côté serveur uniquement.
 */

export interface PayAdapter {
  code: string;
  displayName: string;
  kind: 'mobile-money' | 'card';
  configured: false;
  /** Aucun appel réseau : prêt à recevoir l'intégration officielle. */
  createCheckout(input: { checkoutToken: string; amount: number }): Promise<{ mode: 'hosted'; configured: false }>;
}

function adapter(code: string, displayName: string, kind: 'mobile-money' | 'card'): PayAdapter {
  return {
    code,
    displayName,
    kind,
    configured: false,
    async createCheckout() {
      // Abstraction pure : l'intégration officielle branchera ici.
      return { mode: 'hosted', configured: false };
    },
  };
}

export const PAY_ADAPTERS: Record<string, PayAdapter> = {
  'mixx-by-yas': adapter('mixx-by-yas', 'Mixx by Yas', 'mobile-money'),
  'moov-money': adapter('moov-money', 'Moov Money', 'mobile-money'),
  wave: adapter('wave', 'Wave', 'mobile-money'),
  'mtn-money': adapter('mtn-money', 'MTN Money', 'mobile-money'),
  card: adapter('card', 'Carte bancaire (checkout hébergé)', 'card'),
};

export function createPayService(config: Pick<Env, 'PAY_WEBHOOK_SECRET'>, db: Database) {
  /** Marchand : créé à la première utilisation (1 par organisation). */
  async function ensureMerchant(organizationId: string, displayName: string): Promise<string> {
    const existing = await db.select({ id: merchants.id }).from(merchants).where(eq(merchants.organizationId, organizationId)).limit(1);
    if (existing[0]) return existing[0].id;
    const [created] = await db.insert(merchants).values({ organizationId, displayName }).returning({ id: merchants.id });
    if (!created) throw new AppError(500, ERROR_CODES.INTERNAL_ERROR, 'Création marchand impossible.');
    return created.id;
  }

  async function ensureProvider(code: string): Promise<void> {
    const adapterDef = PAY_ADAPTERS[code];
    if (!adapterDef) throw new AppError(400, ERROR_CODES.VALIDATION_ERROR, 'Provider inconnu.');
    const existing = await db.select({ id: paymentProviders.id }).from(paymentProviders).where(eq(paymentProviders.code, code)).limit(1);
    if (existing.length === 0) {
      await db.insert(paymentProviders).values({ code, displayName: adapterDef.displayName, configured: false });
    }
  }

  function toTransaction(row: typeof transactions.$inferSelect): Transaction {
    return transactionSchema.parse({
      id: row.id,
      organizationId: row.organizationId,
      providerCode: row.providerCode,
      amount: row.amount,
      feeAmount: row.feeAmount,
      netAmount: row.netAmount,
      currency: row.currency,
      status: row.status,
      checkoutUrl: `/pay/checkout/${row.checkoutToken}`,
      providerReference: row.providerReference,
      createdAt: row.createdAt.toISOString(),
    });
  }

  return {
    adapters: Object.values(PAY_ADAPTERS).map(({ code, displayName, kind, configured }) => ({ code, displayName, kind, configured })),

    /** TransactionEngine + FeeEngine + Router. Idempotent par clé. */
    async createTransaction(
      organizationId: string,
      orgName: string,
      input: CreateTransactionInput,
    ): Promise<{ transaction: Transaction; idempotentReplay: boolean }> {
      const adapterDef = PAY_ADAPTERS[input.providerCode];
      if (!adapterDef) throw new AppError(400, ERROR_CODES.VALIDATION_ERROR, 'Provider inconnu.');

      // Idempotence : une même clé renvoie la transaction existante.
      const existing = await db
        .select()
        .from(transactions)
        .where(and(eq(transactions.organizationId, organizationId), eq(transactions.idempotencyKey, input.idempotencyKey)))
        .limit(1);
      if (existing[0]) {
        return { transaction: toTransaction(existing[0]), idempotentReplay: true };
      }

      await ensureProvider(input.providerCode);
      const merchantId = await ensureMerchant(organizationId, orgName);

      // Commission serveur (350 bps) — jamais calculée côté client.
      const { amount, fee, net } = calculateFee(input.amount);
      const checkoutToken = `tok_${randomBytes(16).toString('hex')}`;

      let row: typeof transactions.$inferSelect | undefined;
      try {
        [row] = await db
          .insert(transactions)
          .values({
            merchantId,
            organizationId,
            providerCode: input.providerCode,
            amount,
            feeAmount: fee,
            netAmount: net,
            status: 'pending',
            idempotencyKey: input.idempotencyKey,
            checkoutToken,
          })
          .returning();
      } catch (error) {
        // Course d'idempotence : deux requêtes concurrentes avec la même clé —
        // l'unique contrainte (organisation, clé) tranche ; le perdant rejoue
        // la transaction gagnante (replay), jamais d'erreur 500.
        if (typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === '23505') {
          const winner = await db
            .select()
            .from(transactions)
            .where(and(eq(transactions.organizationId, organizationId), eq(transactions.idempotencyKey, input.idempotencyKey)))
            .limit(1);
          if (winner[0]) return { transaction: toTransaction(winner[0]), idempotentReplay: true };
        }
        throw error;
      }

      if (!row) throw new AppError(500, ERROR_CODES.INTERNAL_ERROR, 'Création transaction impossible.');
      await adapterDef.createCheckout({ checkoutToken, amount });
      return { transaction: toTransaction(row), idempotentReplay: false };
    },

    async getTransaction(organizationId: string, transactionId: string): Promise<Transaction> {
      const rows = await db
        .select()
        .from(transactions)
        .where(and(eq(transactions.id, transactionId), eq(transactions.organizationId, organizationId)))
        .limit(1);
      if (!rows[0]) throw new AppError(404, ERROR_CODES.NOT_FOUND, 'Transaction introuvable.');
      return toTransaction(rows[0]);
    },

    async listTransactions(organizationId: string, page: number, limit: number) {
      const [rows, totals] = await Promise.all([
        db.select().from(transactions).where(eq(transactions.organizationId, organizationId)).orderBy(desc(transactions.createdAt)).limit(limit).offset((page - 1) * limit),
        db.select({ value: count() }).from(transactions).where(eq(transactions.organizationId, organizationId)),
      ]);
      const total = Number(totals[0]?.value ?? 0);
      return { data: rows.map(toTransaction), page, limit: 0 + limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
    },

    /**
     * WebhookHandler : signature HMAC-SHA256 obligatoire (temps constant),
     * transition idempotente, écriture du grand livre en partie double.
     */
    async handleWebhook(providerCode: string, rawBody: string, signature: string | undefined): Promise<{ processed: boolean; replay: boolean }> {
      const adapterDef = PAY_ADAPTERS[providerCode];
      if (!adapterDef) throw new AppError(404, ERROR_CODES.NOT_FOUND, 'Provider inconnu.');

      if (!signature) {
        throw new AppError(401, ERROR_CODES.UNAUTHENTICATED, 'Signature webhook manquante.');
      }
      const expected = createHmac('sha256', config.PAY_WEBHOOK_SECRET).update(rawBody).digest('hex');
      const given = Buffer.from(signature.replace(/^sha256=/, ''), 'utf8');
      const reference = Buffer.from(expected, 'utf8');
      if (given.length !== reference.length || !timingSafeEqual(given, reference)) {
        throw new AppError(401, ERROR_CODES.UNAUTHENTICATED, 'Signature webhook invalide.');
      }

      let payload: WebhookPayload;
      try {
        payload = webhookPayloadSchema.parse(JSON.parse(rawBody));
      } catch {
        throw new AppError(400, ERROR_CODES.VALIDATION_ERROR, 'Charge utile webhook invalide.');
      }

      // La référence pointe vers le token de checkout hébergé.
      const rows = await db
        .select()
        .from(transactions)
        .where(eq(transactions.checkoutToken, payload.reference))
        .limit(1);
      const transaction = rows[0];
      if (!transaction) throw new AppError(404, ERROR_CODES.NOT_FOUND, 'Transaction introuvable.');

      if (payload.providerTransactionId) {
        await db
          .update(transactions)
          .set({ providerReference: payload.providerTransactionId, updatedAt: new Date() })
          .where(eq(transactions.id, transaction.id));
      }

      const targetStatus = payload.event === 'transaction.succeeded' ? 'succeeded' : 'failed';

      if (transaction.status === targetStatus) {
        return { processed: false, replay: true }; // rejoué : déjà traité
      }
      if (transaction.status === 'succeeded' || transaction.status === 'failed') {
        return { processed: false, replay: true };
      }

      await db.update(transactions).set({ status: targetStatus, updatedAt: new Date() }).where(eq(transactions.id, transaction.id));

      if (targetStatus === 'succeeded') {
        // Ledger en partie double : SUM(debit) = SUM(credit).
        await db.insert(ledgerEntries).values([
          { transactionId: transaction.id, entryType: 'charge', account: `provider:${transaction.providerCode}`, debit: transaction.amount, credit: 0 },
          { transactionId: transaction.id, entryType: 'charge', account: 'merchant:pending', debit: 0, credit: transaction.amount },
          { transactionId: transaction.id, entryType: 'fee', account: 'merchant:pending', debit: transaction.feeAmount, credit: 0 },
          { transactionId: transaction.id, entryType: 'fee', account: 'platform:fees', debit: 0, credit: transaction.feeAmount },
          { transactionId: transaction.id, entryType: 'net', account: 'merchant:pending', debit: transaction.netAmount, credit: 0 },
          { transactionId: transaction.id, entryType: 'net', account: 'merchant:available', debit: 0, credit: transaction.netAmount },
        ]);
      }

      return { processed: true, replay: false };
    },

    /** Solde disponible du marchand — strictement limité à SON organisation. */
    async availableBalance(organizationId: string): Promise<number> {
      const merchantRows = await db.select().from(merchants).where(eq(merchants.organizationId, organizationId)).limit(1);
      const merchant = merchantRows[0];
      if (!merchant) return 0;

      const txIds = (
        await db.select({ id: transactions.id }).from(transactions).where(eq(transactions.organizationId, organizationId))
      ).map((row) => row.id);
      const payoutIds = (
        await db.select({ id: payouts.id }).from(payouts).where(eq(payouts.merchantId, merchant.id))
      ).map((row) => row.id);

      const scopes = [];
      if (txIds.length > 0) scopes.push(inArray(ledgerEntries.transactionId, txIds));
      if (payoutIds.length > 0) scopes.push(inArray(ledgerEntries.payoutId, payoutIds));
      if (scopes.length === 0) return 0;

      const rows = await db
        .select()
        .from(ledgerEntries)
        .where(and(eq(ledgerEntries.account, 'merchant:available'), or(...scopes)));
      return rows.reduce((sum, row) => sum + row.credit - row.debit, 0);
    },

    /**
     * Payout : rôle admin exigé côté route ; destination tokenisée.
     * Transactionnel : verrou consultatif par organisation + recalcul du
     * solde DANS la transaction — deux payouts concurrents ne peuvent pas
     * décrocher le même solde (pas de grand livre négatif).
     */
    async createPayout(organizationId: string, amount: number, destinationToken: string): Promise<{ id: string; amount: number; currency: string; status: string; createdAt: string }> {
      return db.transaction(async (tx) => {
        // Verrou d'écriture par organisation (libéré à la fin de la transaction).
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${organizationId}))`);

        const merchantRows = await tx.select().from(merchants).where(eq(merchants.organizationId, organizationId)).limit(1);
        const merchant = merchantRows[0];
        if (!merchant) throw new AppError(404, ERROR_CODES.NOT_FOUND, 'Aucun compte marchand pour cette organisation.');

        const txIds = (await tx.select({ id: transactions.id }).from(transactions).where(eq(transactions.organizationId, organizationId))).map((row) => row.id);
        const payoutIds = (await tx.select({ id: payouts.id }).from(payouts).where(eq(payouts.merchantId, merchant.id))).map((row) => row.id);
        const scopes = [];
        if (txIds.length > 0) scopes.push(inArray(ledgerEntries.transactionId, txIds));
        if (payoutIds.length > 0) scopes.push(inArray(ledgerEntries.payoutId, payoutIds));
        let balance = 0;
        if (scopes.length > 0) {
          const rows = await tx
            .select()
            .from(ledgerEntries)
            .where(and(eq(ledgerEntries.account, 'merchant:available'), or(...scopes)));
          balance = rows.reduce((sum, row) => sum + row.credit - row.debit, 0);
        }
        if (amount > balance) {
          throw new AppError(409, ERROR_CODES.CONFLICT, `Solde insuffisant : ${balance} XOF disponibles.`);
        }

        const [payout] = await tx
          .insert(payouts)
          .values({ merchantId: merchant.id, amount, destinationToken, status: 'pending' })
          .returning();
        if (!payout) throw new AppError(500, ERROR_CODES.INTERNAL_ERROR, 'Création payout impossible.');

        await tx.insert(ledgerEntries).values([
          { payoutId: payout.id, entryType: 'payout', account: 'merchant:available', debit: amount, credit: 0 },
          { payoutId: payout.id, entryType: 'payout', account: `bank:${destinationToken}`, debit: 0, credit: amount },
        ]);

        return {
          id: payout.id,
          amount: payout.amount,
          currency: payout.currency,
          status: payout.status,
          createdAt: payout.createdAt.toISOString(),
        };
      });
    },

    /** Liste paginée des payouts de l'organisation (plus récents d'abord). */
    async listPayouts(organizationId: string, page: number, limit: number) {
      const merchantRows = await db.select({ id: merchants.id }).from(merchants).where(eq(merchants.organizationId, organizationId)).limit(1);
      if (!merchantRows[0]) {
        return { data: [] as { id: string; merchantId: string; amount: number; currency: string; status: string; createdAt: string }[], page, limit, total: 0, totalPages: 1 };
      }
      const merchantId = merchantRows[0].id;
      const [rows, totals] = await Promise.all([
        db.select().from(payouts).where(eq(payouts.merchantId, merchantId)).orderBy(desc(payouts.createdAt)).limit(limit).offset((page - 1) * limit),
        db.select({ value: count() }).from(payouts).where(eq(payouts.merchantId, merchantId)),
      ]);
      const total = Number(totals[0]?.value ?? 0);
      return {
        data: rows.map((row) => ({ id: row.id, merchantId: row.merchantId, amount: row.amount, currency: row.currency, status: row.status, createdAt: row.createdAt.toISOString() })),
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      };
    },

    /** Réconciliation : compare un rapport provider au grand livre. */
    async reconcile(organizationId: string, providerCode: string, entries: { providerReference: string; status: string; amount: number }[]) {
      const report = { providerCode, matched: 0, mismatched: [] as { providerReference: string; reason: string }[], unknown: 0 };
      for (const entry of entries) {
        const rows = await db
          .select()
          .from(transactions)
          .where(and(eq(transactions.organizationId, organizationId), eq(transactions.providerReference, entry.providerReference)))
          .limit(1);
        const transaction = rows[0];
        if (!transaction) {
          report.unknown += 1;
          continue;
        }
        if (transaction.status !== entry.status || transaction.amount !== entry.amount) {
          report.mismatched.push({
            providerReference: entry.providerReference,
            reason: `statut local=${transaction.status}/${entry.status} ; montant local=${transaction.amount}/${entry.amount}`,
          });
          continue;
        }
        report.matched += 1;
      }
      return report;
    },
  };
}

export type PayService = ReturnType<typeof createPayService>;
