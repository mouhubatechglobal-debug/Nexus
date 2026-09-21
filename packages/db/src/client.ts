import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import pg from 'pg';
import * as schema from './schema/index.js';

/**
 * Instance Drizzle typée sur le schéma du projet.
 *
 * Note : le driver embarqué (PGlite) expose exactement la même API de
 * requêtes ; il est adapté à ce type à la frontière du module pour
 * garder un type unique dans toute l'application.
 */
export type Database = NodePgDatabase<typeof schema>;

/** Driver réellement utilisé par une instance. */
export type DbDriver = 'postgres' | 'embedded';

export interface DbOptions {
  /** Taille maximale du pool de connexions (driver postgres). */
  max?: number;
}

export interface DbHandle {
  db: Database;
  driver: DbDriver;
  /** Requête triviale pour les sondes /health et /ready. */
  ping(): Promise<void>;
  /** Ferme proprement le handle (à appeler à l'arrêt du service). */
  close(): Promise<void>;
}

/**
 * Crée un pool PostgreSQL + l'instance Drizzle associée (production).
 * Aucune connexion n'est ouverte avant la première requête (pool paresseux) :
 * l'API démarre donc même sans PostgreSQL disponible.
 */
export function createDb(databaseUrl: string, options: DbOptions = {}): DbHandle {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: options.max ?? 10,
  });

  const db = drizzle(pool, { schema });

  return {
    db,
    driver: 'postgres',
    async ping() {
      await pool.query('SELECT 1');
    },
    async close() {
      await pool.end();
    },
  };
}

export interface EmbeddedDbOptions {
  /**
   * Dossier de données persistant (optionnel). Par défaut : mémoire,
   * idéal pour les tests et la démonstration.
   */
  dataDir?: string;
}

/**
 * Crée une instance PostgreSQL embarquée (PGlite, WASM) — utilisée quand
 * aucun serveur PostgreSQL n'est disponible (CI, sandbox, démo).
 * Les migrations restent les fichiers SQL générés par drizzle-kit :
 * même schéma, mêmes contraintes que le driver standard.
 */
export async function createEmbeddedDb(options: EmbeddedDbOptions = {}): Promise<DbHandle> {
  const { PGlite } = await import('@electric-sql/pglite');
  const client = new PGlite(options.dataDir);
  const embedded = (await import('drizzle-orm/pglite')).drizzle(client, { schema });

  const db = embedded as unknown as Database;

  return {
    db,
    driver: 'embedded',
    async ping() {
      await db.execute(sql`SELECT 1`);
    },
    async close() {
      await client.close();
    },
  };
}

/** Fabrique selon la variable DB_DRIVER. */
export async function createDbFromDriver(
  driver: DbDriver,
  databaseUrl: string,
  options: DbOptions = {},
): Promise<DbHandle> {
  if (driver === 'embedded') {
    return createEmbeddedDb();
  }
  return createDb(databaseUrl, options);
}

export { schema };
