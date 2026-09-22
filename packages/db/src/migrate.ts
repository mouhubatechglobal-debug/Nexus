import { fileURLToPath } from 'node:url';
import type { DbHandle } from './client.js';

/** Dossier des migrations générées par drizzle-kit (`npm run db:generate`). */
export const MIGRATIONS_FOLDER = fileURLToPath(new URL('../drizzle', import.meta.url));

/**
 * Applique les migrations SQL générées (table de suivi `drizzle.__drizzle_migrations`).
 * Délègue au handle (le driver PostgreSQL protège l'opération avec un verrou
 * consultatif — indispensable en serverless où plusieurs instances démarrent
 * en parallèle). Fonctionne identiquement pour le driver standard
 * (node-postgres) et le driver embarqué (PGlite).
 */
export async function runMigrations(handle: DbHandle): Promise<void> {
  await handle.migrate();
}
