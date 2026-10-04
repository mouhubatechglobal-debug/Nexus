import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DbHandle } from './client.js';

/**
 * Résout le dossier des migrations générées par drizzle-kit
 * (`npm run db:generate`). Multi-candidats car le layout de fichiers diffère
 * selon le contexte :
 * - exécution normale : `packages/db/dist/…` → `../drizzle` (layout source) ;
 * - bundle serverless aplati (Vercel @vercel/node + esbuild) :
 *   `import.meta.url` pointe vers le fichier unique de la fonction —
 *   les dossiers additionnels (`includeFiles`) peuvent arriver en racine
 *   de fonction ou en sous-chemin préservé.
 * Le premier candidat contenant `meta/_journal.json` gagne ; erreur
 * explicite listant les chemins testés sinon (aucun échec silencieux).
 */
export function resolveMigrationsFolder(): string {
  const moduleDir = fileURLToPath(new URL('.', import.meta.url));
  const candidates: string[] = [
    process.env['NEXUS_MIGRATIONS_DIR'] ?? '',
    fileURLToPath(new URL('../drizzle', import.meta.url)),
    fileURLToPath(new URL('./drizzle', import.meta.url)),
    fileURLToPath(new URL('./packages/db/drizzle', import.meta.url)),
    join(process.cwd(), 'packages', 'db', 'drizzle'),
    join(moduleDir, '..', 'drizzle'),
  ].filter((value) => value.length > 0);

  for (const candidate of candidates) {
    if (existsSync(join(candidate, 'meta', '_journal.json'))) {
      return candidate;
    }
  }
  throw new Error(
    `Dossier des migrations introuvable (recherche de meta/_journal.json dans : ${candidates.join(', ')}). ` +
      'Définissez NEXUS_MIGRATIONS_DIR si les migrations sont ailleurs.',
  );
}

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
