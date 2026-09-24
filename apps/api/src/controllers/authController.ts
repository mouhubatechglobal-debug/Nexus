import type { FastifyReply, FastifyRequest } from 'fastify';
import { authSessionResponseSchema, authUserSchema } from '@nexus/contracts';
import { loginSchema, registerSchema } from '../schemas/auth.js';
import { parseBody } from '../middleware/errors.js';
import type { AuthService, RequestMeta, SessionUser } from '../services/authService.js';

function serializeUser(user: SessionUser) {
  return authUserSchema.parse({
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    createdAt: user.createdAt.toISOString(),
  });
}

function requestMeta(request: FastifyRequest): RequestMeta {
  const userAgent = request.headers['user-agent'];
  return {
    userAgent: typeof userAgent === 'string' ? userAgent : undefined,
    ip: request.ip,
  };
}

/** Contrôleurs d'authentification — validation Zod + cookie de session opaque. */
export function createAuthController(service: AuthService) {
  return {
    async register(request: FastifyRequest, reply: FastifyReply) {
      const input = parseBody(registerSchema, request.body);
      const { user, token } = await service.register(input, requestMeta(request));
      reply.code(201).setCookie(service.SESSION_COOKIE, token, service.cookieOptions());
      return authSessionResponseSchema.parse({ user: serializeUser(user) });
    },

    async login(request: FastifyRequest, reply: FastifyReply) {
      const input = parseBody(loginSchema, request.body);
      const { user, token } = await service.login(input.email, input.password, requestMeta(request));
      reply.setCookie(service.SESSION_COOKIE, token, service.cookieOptions());
      return authSessionResponseSchema.parse({ user: serializeUser(user) });
    },

    async logout(request: FastifyRequest, reply: FastifyReply) {
      await service.logout(request.cookies[service.SESSION_COOKIE]);
      reply.clearCookie(service.SESSION_COOKIE, { path: '/' });
      reply.code(204);
      return undefined;
    },

    /** Route protégée : `request.user` est peuplé par le garde. */
    async me(request: FastifyRequest) {
      const user = request.user as SessionUser;
      return authSessionResponseSchema.parse({ user: serializeUser(user) });
    },
  };
}

export type AuthController = ReturnType<typeof createAuthController>;
