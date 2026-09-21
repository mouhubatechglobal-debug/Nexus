import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Env } from '@nexus/config';

/** Environnement de test complet (aucune valeur sensible, driver embarqué). */
export function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    NODE_ENV: 'test',
    LOG_LEVEL: 'fatal',
    PORT: 3001,
    CORS_ORIGIN: 'http://localhost:5173',
    DATABASE_URL: 'postgres://nexus:nexus@localhost:5432/nexus',
    DB_DRIVER: 'embedded',
    REDIS_URL: 'redis://localhost:6379',
    COOKIE_SECRET: 'test-cookie-secret-32-characters!!',
    SESSION_TTL_HOURS: 72,
    RATE_LIMIT_MAX: 1000,
    AUTH_RATE_LIMIT_MAX: 1000,
    ...overrides,
  };
}

/** Extrait le cookie `nexus_session` d'une réponse injectée. */
export function sessionCookie(response: { cookies: { name: string; value: string }[] }): string {
  const cookie = response.cookies.find((c) => c.name === 'nexus_session');
  if (!cookie) throw new Error('Cookie de session absent de la réponse');
  return `nexus_session=${cookie.value}`;
}
