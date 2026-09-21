import { fileURLToPath } from 'node:url';
import type { DbHandle } from './client.js';

/** Dossier des migrations générées par drizzle-kit (`npm run db:generate`). */
export const MIGRATIONS_FOLDER = fileURLToPath(new URL('../drizzle', import.meta.url));

/**
 * Applique les migrations SQL générées (table de suivi `drizzle.__drizzle_migrations`).
 * Fonctionne identiquement pour le driver standard (node-postgres)
 * et le driver embarqué (PGlite).
 */
export async function runMigrations(handle: DbHandle): Promise<void> {
  if (handle.driver === 'embedded') {
    const { migrate } = await import('drizzle-orm/pglite/migrator');
    await migrate(handle.db as never, { migrationsFolder: MIGRATIONS_FOLDER });
    return;
  }
  const { migrate } = await import('drizzle-orm/node-postgres/migrator');
  await migrate(handle.db, { migrationsFolder: MIGRATIONS_FOLDER });
}
