import { useEffect, useState } from 'react';
import { fetchHealth } from './api';

export type HealthState = 'unknown' | 'up' | 'down';

/**
 * État de l'API, rafraîchi périodiquement.
 * Aucune erreur non gérée : `fetchHealth` renvoie déjà un `Result`.
 */
export function useHealth(pollMs = 30_000): HealthState {
  const [state, setState] = useState<HealthState>('unknown');

  useEffect(() => {
    let cancelled = false;

    const check = () => {
      void fetchHealth().then((result) => {
        if (!cancelled) setState(result.ok ? 'up' : 'down');
      });
    };

    check();
    const timer = window.setInterval(check, pollMs);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [pollMs]);

  return state;
}
