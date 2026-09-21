import { randomUUID } from 'node:crypto';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import type { Env } from '@nexus/config';
import { createLogger } from '@nexus/observability';
import {
  createDb,
  createDbFromDriver,
  runMigrations,
  type DbHandle,
} from '@nexus/db';
import { Redis } from 'ioredis';
import Fastify from 'fastify';
import { toConfig, type AppConfig } from './config/index.js';
import { AppError, registerErrorHandlers } from './middleware/errors.js';
import { ERROR_CODES } from '@nexus/contracts';
import { createHealthService } from './services/healthService.js';
import { createAuthService } from './services/authService.js';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/v1/auth.js';

export interface BuildAppOptions {
  env: Env;
  /** Handle DB externe (tests) — sinon créé depuis la config. */
  db?: DbHandle;
}

/**
 * Construit l'application Fastify (sans écouter) :
 * - logs pino, identifiant de requête par appel, cookies masqués ;
 * - CORS strict (liste d'origins exacte, credentials activés) ;
 * - limitation de débit globale + renforcée sur l'authentification ;
 * - erreurs 100 % normalisées (middleware/errors) ;
 * - sondes /health (liveness) et /ready (readiness) ;
 * - authentification /v1/auth/* (Argon2id + sessions opaques).
 *
 * DB_DRIVER : « postgres » (pool paresseux, aucune connexion ouverte au
 * démarrage) ou « embedded » (PGlite + migrations automatiques).
 */
export async function buildApp(options: BuildAppOptions) {
  const config: AppConfig = toConfig(options.env);
  const logger = createLogger('nexus-api', { level: config.LOG_LEVEL, nodeEnv: config.NODE_ENV });

  const ownsDb = options.db === undefined;
  const db =
    options.db ??
    (config.DB_DRIVER === 'embedded'
      ? await createDbFromDriver('embedded', config.DATABASE_URL)
      : createDb(config.DATABASE_URL, { max: 5 }));

  if (ownsDb && config.DB_DRIVER === 'embedded') {
    // Instance jetable (démo/tests) : on s'assure que le schéma existe.
    await runMigrations(db);
  }

  const redis = new Redis(config.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
  redis.on('error', () => {
    // Les erreurs de connexion sont remontées par la sonde /health.
  });

  const app = Fastify({
    loggerInstance: logger,
    genReqId: () => randomUUID(),
    trustProxy: true,
  });

  // --- CORS contrôlé : origines exactes uniquement, jamais `*` ---
  const allowedOrigins = config.CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean);
  await app.register(cors, {
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  await app.register(cookie, {
    secret: config.COOKIE_SECRET,
  });

  await app.register(rateLimit, {
    global: true,
    max: config.RATE_LIMIT_MAX,
    timeWindow: '1 minute',
    // Les dépassements sortent au format d'erreur standard.
    errorResponseBuilder: () =>
      new AppError(429, ERROR_CODES.RATE_LIMITED, 'Trop de requêtes. Réessayez dans un instant.'),
  });

  registerErrorHandlers(app);

  // --- Sondes ---
  const healthService = createHealthService({
    checkDatabase: async () => {
      try {
        await db.ping();
        return 'up' as const;
      } catch {
        return 'down' as const;
      }
    },
    checkRedis: async () => {
      try {
        const pong = await redis.connect().then(() => redis.ping());
        return pong === 'PONG' ? ('up' as const) : ('down' as const);
      } catch {
        redis.disconnect();
        return 'down' as const;
      }
    },
  });
  await app.register(healthRoutes, { service: healthService });

  // --- Authentification ---
  const authService = createAuthService({ db: db.db, config });
  await app.register(authRoutes, {
    prefix: '/v1/auth',
    service: authService,
    config,
  });

  return {
    app,
    db,
    authService,
    async close() {
      redis.disconnect();
      await app.close();
      if (ownsDb) {
        await db.close();
      }
    },
  };
}

/** Type d'une instance construite par `buildApp` (app + arrêt propre). */
export type AppHandle = Awaited<ReturnType<typeof buildApp>>;
