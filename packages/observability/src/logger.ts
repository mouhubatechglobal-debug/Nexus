import pino from 'pino';

export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

export interface LoggerOptions {
  level?: LogLevel;
  nodeEnv?: string;
}

/**
 * Logger pino centralisé. Rendu lisible (pino-pretty) en développement,
 * JSON brut en production (prêt pour une agrégation de logs).
 */
export function createLogger(name: string, options: LoggerOptions = {}): pino.Logger {
  const nodeEnv = options.nodeEnv ?? process.env['NODE_ENV'] ?? 'development';
  const level = options.level ?? (process.env['LOG_LEVEL'] as LogLevel | undefined) ?? 'info';
  const isDevelopment = nodeEnv === 'development';

  return pino({
    name,
    level,
    base: { service: name },
    ...(isDevelopment
      ? {
          transport: {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'SYS:HH:MM:ss.l',
              ignore: 'pid,hostname,service',
            },
          },
        }
      : {}),
  });
}
