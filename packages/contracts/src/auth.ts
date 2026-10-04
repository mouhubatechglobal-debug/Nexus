import { z } from 'zod';

/** Utilisateur exposé par l'API — jamais de hash de mot de passe ici. */
export const authUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string().nullable(),
  createdAt: z.string(),
});

export type AuthUser = z.infer<typeof authUserSchema>;

/** Réponses `POST /v1/auth/register` et `POST /v1/auth/login`. */
export const authSessionResponseSchema = z.object({
  user: authUserSchema,
});

export type AuthSessionResponse = z.infer<typeof authSessionResponseSchema>;
