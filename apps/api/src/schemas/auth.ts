import { z } from 'zod';

/**
 * Règles de validation de l'authentification.
 * L'e-mail est normalisé (trim + minuscules) avant tout traitement.
 */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Adresse e-mail invalide')
  .max(255);

/**
 * Politique de mot de passe : 10 caractères minimum, au moins une lettre
 * et un chiffre. Le hash Argon2id est appliqué côté serveur.
 */
export const passwordSchema = z
  .string()
  .min(10, 'Le mot de passe doit contenir au moins 10 caractères')
  .max(128, 'Le mot de passe ne doit pas dépasser 128 caractères')
  .regex(/[A-Za-z]/, 'Le mot de passe doit contenir au moins une lettre')
  .regex(/[0-9]/, 'Le mot de passe doit contenir au moins un chiffre');

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: z.string().trim().min(1).max(80).optional(),
  /** Nom de l'organisation personnelle créée avec le compte. */
  organizationName: z.string().trim().min(2).max(80).optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Mot de passe requis').max(128),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
