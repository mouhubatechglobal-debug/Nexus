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
import {
  createAuthService,
  createOrgService,
  createProjectService,
  createProviderFromConfig,
} from './services/index.js';
import { createJobService } from './services/jobService.js';
import { createDeployService } from './services/deployService.js';
import { createAnalyticsService } from './services/analyticsService.js';
import { createPayService } from './services/payService.js';
import { jobRoutes } from './routes/v1/jobs.js';
import { deploymentRoutes } from './routes/v1/deployments.js';
import { analyticsRoutes } from './routes/v1/analytics.js';
import { payRoutes } from './routes/v1/pay.js';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/v1/auth.js';
import { orgRoutes } from './routes/v1/organizations.js';
import { projectRoutes } from './routes/v1/projects.js';
import { workspaceRoutes } from './routes/v1/workspace.js';
import { aiRoutes } from './routes/v1/ai.js';

export interface BuildAppOptions {
  env: Env;
  /** Handle DB externe (tests) — sinon créé depuis la config. */
  db?: DbHandle;
}

/**
 * Construit l'application Fastify (sans écouter) :
 * - logs pino, requestId par appel, cookies masqués ;
 * - CORS strict, rate limiting global + renforcé sur /v1/auth ;
 * - erreurs 100 % normalisées ;
 * - sondes /health et /ready ;
 * - authentification /v1/auth (Argon2id + sessions opaques) ;
 * - multi-tenant /v1/organizations + /v1/projects (isolation anti-IDOR) ;
 * - workspace projet : Brain, Forge (fichiers), Studio, Lab, Doctor ;
 * - IA /v1/ai (provider OpenAI-compatible, timeout, clé via env).
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
    errorResponseBuilder: () =>
      new AppError(429, ERROR_CODES.RATE_LIMITED, 'Trop de requêtes. Réessayez dans un instant.'),
  });

  registerErrorHandlers(app);

  // --- Authentification & services ---
  const authService = createAuthService({ db: db.db, config });
  const orgService = createOrgService(db.db);
  const projectService = createProjectService(db.db);

  // --- Provider IA (clé via environnement uniquement) ---
  const aiProvider = createProviderFromConfig({
    baseUrl: config.AI_BASE_URL,
    model: config.AI_MODEL,
    apiKey: config.AI_API_KEY,
    timeoutMs: config.AI_TIMEOUT_MS,
  });

  // --- Sondes ---
  const { createHealthService } = await import('./services/healthService.js');
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

  // --- Routes v1 ---
  await app.register(authRoutes, { prefix: '/v1/auth', service: authService, config });
  await app.register(orgRoutes, { prefix: '/v1/organizations', authService, orgService });
  await app.register(projectRoutes, { prefix: '/v1/projects', authService, projectService, db: db.db });
  await app.register(workspaceRoutes, { prefix: '/v1', authService, db: db.db });
  await app.register(aiRoutes, { prefix: '/v1/ai', authService, provider: aiProvider });

  // --- Jobs (Queue → Redis|memory → Worker → Result) ---
  const jobService = createJobService(config, db.db);
  await app.register(jobRoutes, { prefix: '/v1/jobs', authService, jobService, db: db.db });

  // --- Déploiements (pipeline contrôlé, production sur action explicite) ---
  await app.register(deploymentRoutes, {
    prefix: '/v1/projects/:projectId/deployments',
    authService,
    deployService: createDeployService(db.db),
    db: db.db,
  });

  // --- Analytics (DEMO/LIVE strictement séparés) ---
  await app.register(analyticsRoutes, {
    prefix: '/v1/analytics',
    authService,
    analyticsService: createAnalyticsService(db.db),
    db: db.db,
  });

  // --- NEXUS Pay (adapters abstraits, fee serveur, ledger, webhooks) ---
  await app.register(payRoutes, {
    prefix: '/v1/pay',
    authService,
    payService: createPayService(config, db.db),
    db: db.db,
  });

  return {
    app,
    db,
    authService,
    orgService,
    projectService,
    aiProvider,
    jobService,
    async close() {
      redis.disconnect();
      await app.close();
      if (ownsDb) {
        await db.close();
      }
    },
  };
}

/** Type d'une instance construite par `buildApp`. */
export type AppHandle = Awaited<ReturnType<typeof buildApp>>;
