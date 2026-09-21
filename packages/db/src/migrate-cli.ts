/**
 * CLI de migration : applique les migrations SQL générées à la base
 * configurée (DATABASE_URL + DB_DRIVER).
 *
 *   npm run db:migrate          # depuis la racine
 *   npm run db:generate -w @nexus/db   # génère les migrations
 */
import { loadDotEnv, loadEnv } from '@nexus/config';
import { createDbFromDriver, runMigrations } from './index.js';

async function main(): Promise<void> {
  loadDotEnv();
  const env = loadEnv();

  console.log(`[db] driver=${env.DB_DRIVER} — application des migrations…`);
  const handle = await createDbFromDriver(env.DB_DRIVER, env.DATABASE_URL);
  try {
    await runMigrations(handle);
    await handle.ping();
    console.log('[db] migrations appliquées — connexion vérifiée ✓');
  } finally {
    await handle.close();
  }
}

main().catch((error) => {
  console.error('[db] échec de la migration :', error);
  process.exit(1);
});
