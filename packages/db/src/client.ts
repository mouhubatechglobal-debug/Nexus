import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema/index.js';

/** Instance Drizzle typée sur le schéma du projet. */
export type Database = NodePgDatabase<typeof schema>;

export interface DbOptions {
  /** Taille maximale du pool de connexions. */
  max?: number;
}

export interface DbHandle {
  db: Database;
  pool: pg.Pool;
  /** Ferme proprement le pool (à appeler à l'arrêt du service). */
  close(): Promise<void>;
}

/**
 * Crée un pool PostgreSQL + l'instance Drizzle associée.
 * Aucune connexion n'est ouverte avant la première requête
 * (le pool de `pg` est paresseux) : l'API démarre donc même
 * sans PostgreSQL disponible.
 */
export function createDb(databaseUrl: string, options: DbOptions = {}): DbHandle {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: options.max ?? 10,
  });

  const db = drizzle(pool, { schema });

  return {
    db,
    pool,
    async close() {
      await pool.end();
    },
  };
}

export { schema };
