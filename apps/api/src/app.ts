import cors from '@fastify/cors';
import type { Env } from '@nexus/config';
import { createLogger } from '@nexus/observability';
import { createDb } from '@nexus/db';
import { Redis } from 'ioredis';
import Fastify from 'fastify';
import { healthRoutes } from './routes/health.js';

export const API_VERSION = '0.1.0';

export interface BuildAppOptions {
  env: Env;
}

/**
 * Construit l'application Fastify (sans écouter) :
 * - logger pino via @nexus/observability ;
 * - CORS pour le frontend Vite ;
 * - sonde /health vérifiant PostgreSQL et Redis de façon non bloquante.
 *
 * Les dépendances (PostgreSQL, Redis) sont optionnelles au démarrage :
 * la sonde les marque `down` si elles sont injoignables.
 */
export function buildApp(options: BuildAppOptions) {
  const { env } = options;
  const logger = createLogger('nexus-api', { level: env.LOG_LEVEL, nodeEnv: env.NODE_ENV });

  const db = createDb(env.DATABASE_URL, { max: 5 });
  const redis = new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
  redis.on('error', () => {
    // Les erreurs de connexion sont remontées par la sonde /health.
  });

  const app = Fastify({ loggerInstance: logger });

  void app.register(cors, { origin: env.CORS_ORIGIN });

  const checkDatabase = async () => {
    try {
      await db.pool.query('SELECT 1');
      return 'up' as const;
    } catch {
      return 'down' as const;
    }
  };

  const checkRedis = async () => {
    try {
      const pong = await redis.connect().then(() => redis.ping());
      return pong === 'PONG' ? ('up' as const) : ('down' as const);
    } catch {
      redis.disconnect();
      return 'down' as const;
    }
  };

  void app.register(healthRoutes, {
    version: API_VERSION,
    checkDatabase,
    checkRedis,
  });

  return {
    app,
    async close() {
      redis.disconnect();
      await db.close();
      await app.close();
    },
  };
}

/** Type d'une instance construite par `buildApp` (app + arrêt propre). */
export type AppHandle = ReturnType<typeof buildApp>;
