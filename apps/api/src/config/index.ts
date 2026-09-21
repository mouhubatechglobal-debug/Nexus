import { loadEnv, type Env } from '@nexus/config';

export type { Env };

/** Configuration résolue de l'API (env validée + dérivés). */
export interface AppConfig extends Env {
  isProduction: boolean;
  /** Cookies `Secure` uniquement en production (HTTPS). */
  cookieSecure: boolean;
}

export function toConfig(env: Env): AppConfig {
  const isProduction = env.NODE_ENV === 'production';
  return { ...env, isProduction, cookieSecure: isProduction };
}

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  return toConfig(loadEnv(source));
}
