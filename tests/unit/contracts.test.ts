import { describe, expect, it } from 'vitest';
import { healthResponseSchema } from '@nexus/contracts';

describe('@nexus/contracts', () => {
  const valid = {
    status: 'ok',
    service: 'Nexus',
    version: '0.1.0',
    uptimeSeconds: 12,
    timestamp: '2026-01-01T00:00:00.000Z',
    checks: { database: 'up', redis: 'up' },
  };

  it('accepte une charge utile de santé valide', () => {
    const parsed = healthResponseSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
  });

  it('rejette un statut de composant inconnu', () => {
    const parsed = healthResponseSchema.safeParse({
      ...valid,
      checks: { database: 'maybe', redis: 'up' },
    });
    expect(parsed.success).toBe(false);
  });

  it('rejette un statut global hors énumération', () => {
    const parsed = healthResponseSchema.safeParse({ ...valid, status: 'excellent' });
    expect(parsed.success).toBe(false);
  });
});
