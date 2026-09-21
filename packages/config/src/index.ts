import { readFileSync, realpathSync } from 'node:fs';
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
  /** Origines autorisées par CORS, séparées par des virgules */
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  /** Chaîne de connexion PostgreSQL */
  DATABASE_URL: z.string().default('postgres://nexus:nexus@localhost:5432/nexus'),
  /**
   * Driver PostgreSQL : « postgres » (pool pg standard) ou « embedded »
   * (PGlite WASM, pour le développement sans serveur ni Docker, et les
   * tests). Aucune donnée sensible en défaut.
   */
  DB_DRIVER: z.enum(['postgres', 'embedded']).default('postgres'),

  /** Chaîne de connexion Redis */
  REDIS_URL: z.string().default('redis://localhost:6379'),

  /**
   * Secret de signature des cookies. LE défaut est réservé au
   * développement : définir impérativement une valeur forte en
   * production (jamais de vrai secret dans le dépôt).
   */
  COOKIE_SECRET: z.string().min(16).default('nexus-dev-only-change-me-32chars!'),
  /** Durée de vie d'une session opaque, en heures */
  SESSION_TTL_HOURS: z.coerce.number().int().positive().max(8760).default(72),
  /** Limite globale de requêtes par IP et par minute */
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
  /** Limite renforcée des routes d'authentification, par IP et par minute */
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),

  /**
   * Provider IA OpenAI-compatible. Le serveur local par défaut
   * (ex. llama.cpp server) est utilisé en développement.
   */
  AI_BASE_URL: z.string().default('http://127.0.0.1:8080'),
  AI_MODEL: z.string().default('local'),
  /** Clé API — JAMAIS codée en dur, injectée par l'environnement. */
  AI_API_KEY: z.string().optional(),
  /** Délai maximal d'une requête IA, en millisecondes */
  AI_TIMEOUT_MS: z.coerce.number().int().min(500).max(300_000).default(30_000),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Parse et valide les variables d'environnement.
 * Lève une `ZodError` explicite si une valeur est invalide.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return envSchema.parse(source);
}

/**
 * Charge un fichier `.env` simple (CLÉ=valeur) sans écraser les
 * variables déjà présentes. Sans dépendance externe. Si `path` n'est
 * pas fourni, remonte les dossiers depuis le CWD jusqu'à trouver `.env`
 * (les scripts npm s'exécutent depuis le dossier du workspace).
 */
export function loadDotEnv(path?: string): void {
  const candidates: string[] = [];
  if (path) {
    candidates.push(path);
  } else {
    let dir = process.cwd();
    for (let depth = 0; depth < 6; depth += 1) {
      candidates.push(`${dir}/.env`);
      const resolved = resolveSafe(dir, '..');
      if (!resolved || resolved === dir) break;
      dir = resolved;
    }
  }

  for (const candidate of candidates) {
    let content: string;
    try {
      content = readFileSync(candidate, 'utf8');
    } catch {
      continue;
    }
    applyEnvFile(content);
    return;
  }
}

function resolveSafe(from: string, relative: string): string | null {
  try {
    return realpathSync(`${from}/${relative}`);
  } catch {
    return null;
  }
}

function applyEnvFile(content: string): void {
  for (const line of content.split('\n')) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!match?.[1] || match[2] === undefined) continue;
    const key = match[1];
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
