import type { FastifyInstance } from 'fastify';
import { aiCompleteSchema } from '@nexus/contracts';
import { parseBody } from '../../middleware/errors.js';
import type { AuthService } from '../../services/authService.js';
import { createAuthGuard } from '../../middleware/authGuard.js';
import type { AIProvider } from '../../services/aiProviderService.js';

export interface AiRoutesOptions {
  authService: AuthService;
  provider: AIProvider;
}

/**
 * POST /v1/ai/complete — accès contrôlé au provider IA.
 * Session obligatoire. Le provider n'a ni shell, ni secrets, ni
 * filesystem : il ne transforme du texte en texte.
 */
export async function aiRoutes(app: FastifyInstance, options: AiRoutesOptions): Promise<void> {
  const guard = createAuthGuard(options.authService);

  app.post('/complete', { preHandler: guard }, async (request) => {
    const input = parseBody(aiCompleteSchema, request.body);
    return options.provider.complete(input);
  });
}
