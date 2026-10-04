import type { FastifyInstance } from 'fastify';
import type { Env } from '../../config/index.js';
import type { AuthService } from '../../services/authService.js';
import { createAuthController } from '../../controllers/authController.js';
import { createAuthGuard } from '../../middleware/authGuard.js';

export interface AuthRoutesOptions {
  service: AuthService;
  config: Pick<Env, 'AUTH_RATE_LIMIT_MAX'>;
}

const AUTH_RATE_WINDOW = '1 minute';

/**
 * Endpoints d'authentification (montés sous /v1/auth) :
 *   POST /v1/auth/register — inscription (+ session)
 *   POST /v1/auth/login    — connexion (+ session)
 *   POST /v1/auth/logout   — révocation de session
 *   GET  /v1/auth/me       — utilisateur courant (protégé)
 *
 * Limitation de débit renforcée par IP (protection contre les abus).
 */
export async function authRoutes(app: FastifyInstance, options: AuthRoutesOptions): Promise<void> {
  const controller = createAuthController(options.service);
  const guard = createAuthGuard(options.service);
  const authRateLimit = { max: options.config.AUTH_RATE_LIMIT_MAX, timeWindow: AUTH_RATE_WINDOW };

  app.post('/register', { config: { rateLimit: authRateLimit } }, async (request, reply) =>
    controller.register(request, reply),
  );

  app.post('/login', { config: { rateLimit: authRateLimit } }, async (request, reply) =>
    controller.login(request, reply),
  );

  app.post('/logout', { config: { rateLimit: authRateLimit } }, async (request, reply) =>
    controller.logout(request, reply),
  );

  app.get('/me', { preHandler: guard }, async (request) => controller.me(request));
}
