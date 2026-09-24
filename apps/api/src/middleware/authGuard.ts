import type { FastifyReply, FastifyRequest } from 'fastify';
import { ERROR_CODES } from '@nexus/contracts';
import { AppError } from './errors.js';
import type { AuthService, SessionUser } from '../services/authService.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Peuplé par le garde d'authentification sur les routes protégées. */
    user?: SessionUser;
  }
}

/**
 * Garde d'authentification (preHandler) : lit le cookie de session opaque,
 * résout l'utilisateur, sinon renvoie 401 normalisé.
 */
export function createAuthGuard(service: AuthService) {
  return async function authGuard(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const token = request.cookies[service.SESSION_COOKIE];
    const user = await service.getUserByToken(token);
    if (!user) {
      throw new AppError(401, ERROR_CODES.UNAUTHENTICATED, 'Session absente, expirée ou révoquée.');
    }
    request.user = user;
  };
}

export type AuthGuard = ReturnType<typeof createAuthGuard>;
