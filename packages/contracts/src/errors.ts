import { z } from 'zod';

/** Détail lisible d'une erreur de validation. */
export const errorDetailSchema = z.object({
  path: z.string().optional(),
  message: z.string(),
});
export type ErrorDetail = z.infer<typeof errorDetailSchema>;

/**
 * Enveloppe d'erreur standardisée de l'API NEXUS.
 * TOUTES les erreurs (validation, authentification, 404, 429, 500…)
 * utilisent exactement ce format.
 */
export const errorResponseSchema = z.object({
  error: z.object({
    /** Code machine stable, ex. `VALIDATION_ERROR`, `INVALID_CREDENTIALS`. */
    code: z.string().min(3),
    /** Message compréhensible, destiné à être affiché. */
    message: z.string(),
    /** Détails de validation éventuels. */
    details: z.array(errorDetailSchema).optional(),
    /** Identifiant de requête (corrélation avec les logs). */
    requestId: z.string().optional(),
  }),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;

/** Codes d'erreur canoniques de l'API. */
export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  EMAIL_TAKEN: 'EMAIL_TAKEN',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  FORBIDDEN: 'FORBIDDEN',
  INSUFFICIENT_ROLE: 'INSUFFICIENT_ROLE',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  AI_PROVIDER_ERROR: 'AI_PROVIDER_ERROR',
  AI_TIMEOUT: 'AI_TIMEOUT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
