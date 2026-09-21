import type { ErrorDetail, ErrorCode } from '@nexus/contracts';
import { ERROR_CODES } from '@nexus/contracts';
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ZodType } from 'zod';

/**
 * Système d'erreurs unifié : TOUTE erreur sort de l'API au format
 * `errorResponseSchema` (@nexus/contracts), avec code machine stable
 * et identifiant de requête.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode | string;
  readonly details?: ErrorDetail[];

  constructor(statusCode: number, code: ErrorCode | string, message: string, details?: ErrorDetail[]) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

/** Valide une charge utile Zod ou lève une AppError 400 normalisée. */
export function parseBody<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new AppError(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      'Données de requête invalides.',
      result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    );
  }
  return result.data;
}

function sendError(request: FastifyRequest, reply: FastifyReply, error: AppError): FastifyReply {
  reply.header('x-request-id', request.id);
  return reply.code(error.statusCode).send({
    error: {
      code: error.code,
      message: error.message,
      ...(error.details && error.details.length > 0 ? { details: error.details } : {}),
      requestId: request.id,
    },
  });
}

/** Enregistre le gestionnaire d'erreurs et le 404 normalisés. */
export function registerErrorHandlers(
  app: FastifyInstance<any, any, any, any, any>,
): void {
  app.setErrorHandler((error: Error | FastifyError, request, reply) => {
    if (error instanceof AppError) {
      return sendError(request, reply, error);
    }

    // Erreurs Fastify connues (framework, plugins) avec statusCode.
    const statusCode = 'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : 500;
    if (statusCode < 500) {
      return sendError(
        request,
        reply,
        new AppError(statusCode, ERROR_CODES.VALIDATION_ERROR, error.message),
      );
    }

    // Erreur inattendue : message interne JAMAIS exposé.
    request.log.error({ err: error }, 'Erreur interne non gérée');
    return sendError(
      request,
      reply,
      new AppError(500, ERROR_CODES.INTERNAL_ERROR, 'Une erreur interne est survenue.'),
    );
  });

  app.setNotFoundHandler((request, reply) => {
    return sendError(
      request,
      reply,
      new AppError(404, ERROR_CODES.NOT_FOUND, `Route introuvable : ${request.method} ${request.url}`),
    );
  });
}
