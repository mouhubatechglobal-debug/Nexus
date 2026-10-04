import { z } from 'zod';

/** Requête de complétion envoyée au provider IA (abstrait). */
export const aiCompleteSchema = z.object({
  prompt: z.string().trim().min(1, 'Prompt requis').max(4000),
  system: z.string().trim().max(2000).optional(),
  maxTokens: z.number().int().min(16).max(4096).default(512),
  temperature: z.number().min(0).max(2).default(0.7),
});
export type AiCompleteInput = z.infer<typeof aiCompleteSchema>;

/** Réponse standardisée — indépendante du fournisseur. */
export const aiResponseSchema = z.object({
  content: z.string(),
  model: z.string(),
  /** Le texte du prompt n'est JAMAIS renvoyé tel quel côté logs. */
  latencyMs: z.number().int().nonnegative(),
});
export type AiResponse = z.infer<typeof aiResponseSchema>;
