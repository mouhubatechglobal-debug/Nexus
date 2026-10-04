import { z } from 'zod';

/**
 * NEXUS Pay — fondation. Montants entiers en FCFA (XOF, aucune décimale).
 * Commission NEXUS : 350 basis points (3,5 %), TOUJOURS calculée serveur.
 * Exemple : 100 000 → 3 500 de frais → 96 500 net.
 */
export const NEXUS_FEE_BPS = 350;

export const PAY_PROVIDERS = [
  'mixx-by-yas',
  'moov-money',
  'wave',
  'mtn-money',
  'card',
] as const;
export type PayProviderCode = (typeof PAY_PROVIDERS)[number];

/** Calcul serveur de la commission (arrondi au plus proche). */
export function calculateFee(amount: number): { amount: number; fee: number; net: number } {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error('Montant invalide : entier strictement positif requis');
  }
  const fee = Math.round((amount * NEXUS_FEE_BPS) / 10_000);
  return { amount, fee, net: amount - fee };
}

/** Montant par transaction : 100 FCFA → 10 000 000 FCFA. */
export const transactionAmountSchema = z
  .number()
  .int('Montant entier requis (FCFA)')
  .min(100, 'Montant minimum : 100 FCFA')
  .max(10_000_000, 'Montant maximum : 10 000 000 FCFA');

/**
 * Schéma STRICT : tout champ inconnu (ex. `pan`, `cvv`, `card_number`)
 * est rejeté — aucune donnée de carte brute n'entre jamais dans le système.
 * Les cartes passent par un checkout hébergé tokenisé.
 */
export const createTransactionSchema = z
  .object({
    providerCode: z.enum(PAY_PROVIDERS),
    amount: transactionAmountSchema,
    idempotencyKey: z.string().trim().min(8).max(120),
    metadata: z.record(z.string().max(60), z.union([z.string().max(200), z.number(), z.boolean()])).default({}),
  })
  .strict();

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;

export const transactionSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  providerCode: z.string(),
  amount: z.number().int(),
  feeAmount: z.number().int(),
  netAmount: z.number().int(),
  currency: z.string(),
  status: z.enum(['pending', 'processing', 'succeeded', 'failed', 'refunded']),
  /** URL de checkout hébergé (tokenisé) — jamais de données de carte. */
  checkoutUrl: z.string(),
  providerReference: z.string().nullable(),
  createdAt: z.string(),
});
export type Transaction = z.infer<typeof transactionSchema>;

/** Notification provider : signée HMAC-SHA256, idempotente. */
export const webhookPayloadSchema = z
  .object({
    event: z.enum(['transaction.succeeded', 'transaction.failed']),
    reference: z.string().min(4).max(160),
    providerTransactionId: z.string().min(1).max(160).optional(),
  })
  .strict();

export type WebhookPayload = z.infer<typeof webhookPayloadSchema>;

export const reconciliationEntrySchema = z.object({
  providerReference: z.string().min(1).max(160),
  status: z.enum(['succeeded', 'failed']),
  amount: z.number().int().positive(),
});
export const reconciliationSchema = z.object({
  providerCode: z.enum(PAY_PROVIDERS),
  entries: z.array(reconciliationEntrySchema).min(1).max(500),
});

export const createPayoutSchema = z
  .object({
    amount: transactionAmountSchema,
    destinationToken: z
      .string()
      .trim()
      .min(6)
      .max(120)
      .regex(/^tok_[A-Za-z0-9_-]+$/, 'Destination : jeton tokenisé requis (tok_…)'),
  })
  .strict();
export type CreatePayoutInput = z.infer<typeof createPayoutSchema>;

export const payoutSchema = z.object({
  id: z.string().uuid(),
  merchantId: z.string().uuid(),
  amount: z.number().int(),
  currency: z.string(),
  status: z.enum(['pending', 'processing', 'paid', 'failed']),
  createdAt: z.string(),
});
export type Payout = z.infer<typeof payoutSchema>;
