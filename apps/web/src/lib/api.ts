import { healthResponseSchema, type HealthResponse } from '@nexus/contracts';
import { err, ok, type Result } from '@nexus/core';

/**
 * Client HTTP minimal du frontend. Passe par le proxy `/api` du serveur
 * Vite en développement (aucune URL absolue côté navigateur).
 */
export async function fetchHealth(signal?: AbortSignal): Promise<Result<HealthResponse, string>> {
  try {
    const response = await fetch('/api/health', { signal });
    if (!response.ok) {
      return err(`Réponse HTTP ${response.status}`);
    }
    const parsed = healthResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      return err('Payload /health invalide');
    }
    return ok(parsed.data);
  } catch {
    return err('API injoignable');
  }
}
