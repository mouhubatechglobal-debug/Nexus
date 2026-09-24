import {
  aiCompleteSchema,
  aiResponseSchema,
  ERROR_CODES,
  type AiCompleteInput,
  type AiResponse,
} from '@nexus/contracts';
import { AppError } from '../middleware/errors.js';

/**
 * Abstraction AIProvider — OpenAI-compatible / DeepSeek-compatible /
 * serveur local (ex. llama.cpp sur http://127.0.0.1:8080).
 *
 * Garde-fous :
 * - la clé API vient de l'environnement (AI_API_KEY), jamais du code ni
 *   des logs ;
 * - timeout strict (AbortController) → AI_TIMEOUT ;
 * - réponse validée par Zod → réponse standardisée unique ;
 * - l'IA n'a AUCUN accès automatique : ni shell, ni secrets, ni
 *   filesystem — le service n'expose que `complete()`.
 */

export interface AIProviderConfig {
  baseUrl: string;
  model: string;
  apiKey?: string | undefined;
  timeoutMs: number;
}

export interface AIProvider {
  readonly model: string;
  complete(input: AiCompleteInput): Promise<AiResponse>;
}

/** Injection possible de fetch (tests avec mock contrôlé). */
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

interface ChatCompletionResponse {
  choices?: { message?: { content?: string } }[];
}

export function createOpenAiCompatibleProvider(
  config: AIProviderConfig,
  fetchImpl: FetchLike = fetch,
): AIProvider {
  return {
    model: config.model,

    async complete(rawInput: AiCompleteInput): Promise<AiResponse> {
      const input = aiCompleteSchema.parse(rawInput);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), config.timeoutMs);

      const startedAt = Date.now();
      try {
        const headers: Record<string, string> = {
          'content-type': 'application/json',
        };
        // Clé uniquement si fournie par l'environnement — jamais en dur.
        if (config.apiKey) {
          headers.authorization = `Bearer ${config.apiKey}`;
        }

        const response = await fetchImpl(`${config.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: config.model,
            max_tokens: input.maxTokens,
            temperature: input.temperature,
            messages: [
              ...(input.system ? [{ role: 'system', content: input.system }] : []),
              { role: 'user', content: input.prompt },
            ],
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new AppError(
            502,
            ERROR_CODES.AI_PROVIDER_ERROR,
            `Le provider IA a répondu ${response.status}.`,
          );
        }

        const payload = (await response.json()) as ChatCompletionResponse;
        const content = payload.choices?.[0]?.message?.content;
        if (typeof content !== 'string' || content.length === 0) {
          throw new AppError(
            502,
            ERROR_CODES.AI_PROVIDER_ERROR,
            'Réponse du provider IA inattendue.',
          );
        }

        return aiResponseSchema.parse({
          content,
          model: config.model,
          latencyMs: Date.now() - startedAt,
        });
      } catch (error) {
        if (error instanceof AppError) throw error;
        if (error instanceof Error && error.name === 'AbortError') {
          throw new AppError(504, ERROR_CODES.AI_TIMEOUT, 'Le provider IA n’a pas répondu à temps.');
        }
        throw new AppError(
          502,
          ERROR_CODES.AI_PROVIDER_ERROR,
          'Provider IA injoignable.',
        );
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/** Provider depuis la configuration d'environnement. */
export function createProviderFromConfig(config: AIProviderConfig): AIProvider {
  return createOpenAiCompatibleProvider(config);
}
