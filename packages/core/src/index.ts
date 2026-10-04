/**
 * Types et utilitaires fondamentaux partagés par toutes les applications
 * et tous les services NEXUS. Sans dépendance externe.
 */

export const NEXUS_NAME = 'Nexus';
export const NEXUS_TAGLINE = 'Digital Creation OS';

/** Identifiant court préfixé, ex. `nxs_9f1c…`. */
export function createId(prefix = 'nxs'): string {
  const random =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 20)
      : Math.random().toString(36).slice(2, 14);
  return `${prefix}_${random}`;
}

/** Résultat typé à la Rust : évite les exceptions pour le flux de contrôle. */
export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export const ok = <T>(value: T): { ok: true; value: T } => ({ ok: true, value });

export const err = <E>(error: E): { ok: false; error: E } => ({
  ok: false,
  error,
});

export function isOk<T, E>(result: Result<T, E>): result is { ok: true; value: T } {
  return result.ok;
}

export function isErr<T, E>(result: Result<T, E>): result is { ok: false; error: E } {
  return !result.ok;
}
