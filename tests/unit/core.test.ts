import { describe, expect, it } from 'vitest';
import { createId, err, isErr, isOk, NEXUS_NAME, NEXUS_TAGLINE, ok } from '@nexus/core';

describe('@nexus/core', () => {
  it('expose l’identité de la plateforme', () => {
    expect(NEXUS_NAME).toBe('Nexus');
    expect(NEXUS_TAGLINE).toBe('Digital Creation OS');
  });

  it('génère des identifiants préfixés uniques', () => {
    const a = createId();
    const b = createId();
    expect(a).toMatch(/^nxs_[0-9a-f]{20}$/);
    expect(a).not.toBe(b);
  });

  it('gère le pattern Result', () => {
    const success = ok(42);
    const failure = err(new Error('boom'));

    expect(isOk(success)).toBe(true);
    expect(isErr(success)).toBe(false);
    if (isOk(success)) expect(success.value).toBe(42);

    expect(isErr(failure)).toBe(true);
    if (isErr(failure)) expect(failure.error.message).toBe('boom');
  });
});
