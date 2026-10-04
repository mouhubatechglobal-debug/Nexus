import {
  healthResponseSchema,
  readyResponseSchema,
  type ComponentStatus,
  type HealthResponse,
  type ReadyResponse,
} from '@nexus/contracts';
import { API_VERSION } from '../version.js';

const SERVICE_NAME = 'Nexus';
const CHECK_TIMEOUT_MS = 800;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), timeoutMs);
  });
  try {
    return Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface HealthServiceOptions {
  checkDatabase: () => Promise<ComponentStatus>;
  checkRedis: () => Promise<ComponentStatus>;
}

/** Logique des sondes : liveness (/health) et readiness (/ready). */
export function createHealthService(options: HealthServiceOptions) {
  const checkDatabase = () => withTimeout(options.checkDatabase(), CHECK_TIMEOUT_MS, 'down' satisfies ComponentStatus);
  const checkRedis = () => withTimeout(options.checkRedis(), CHECK_TIMEOUT_MS, 'unknown' satisfies ComponentStatus);

  return {
    /** Liveness : répond toujours 200, détaille les composants. */
    async getHealth(): Promise<HealthResponse> {
      const [database, redis] = await Promise.all([checkDatabase(), checkRedis()]);
      return healthResponseSchema.parse({
        status: database === 'up' && redis === 'up' ? 'ok' : 'degraded',
        service: SERVICE_NAME,
        version: API_VERSION,
        uptimeSeconds: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
        checks: { database, redis },
      });
    },

    /** Readiness : 200 si la base est prête, 503 sinon. */
    async getReadiness(): Promise<{ payload: ReadyResponse; ready: boolean }> {
      const database = await checkDatabase();
      const ready = database === 'up';
      const payload = readyResponseSchema.parse({
        status: ready ? 'ready' : 'unavailable',
        service: SERVICE_NAME,
        version: API_VERSION,
        timestamp: new Date().toISOString(),
        checks: { database },
      });
      return { payload, ready };
    },
  };
}

export type HealthService = ReturnType<typeof createHealthService>;
