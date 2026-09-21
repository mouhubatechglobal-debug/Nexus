import { z } from 'zod';

/**
 * Schéma central des variables d'environnement de NEXUS.
 * Chaque valeur possède un défaut sûr pour le développement local :
 * l'application démarre même sans fichier `.env`.
 */
export const envSchema = z.object({
  /** development | test | production */
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  /** Niveau de verbosité des logs */
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
  /** Port d'écoute de l'API Fastify */
  PORT: z.coerce.number().int().positive().default(3001),
  /** Origine autorisée par CORS (frontend Vite) */
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  /** Chaîne de connexion PostgreSQL */
  DATABASE_URL: z.string().default('postgres://nexus:nexus@localhost:5432/nexus'),
  /** Chaîne de connexion Redis */
  REDIS_URL: z.string().default('redis://localhost:6379'),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Parse et valide les variables d'environnement.
 * Lève une `ZodError` explicite si une valeur est invalide.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return envSchema.parse(source);
}
