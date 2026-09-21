import { defineConfig } from 'drizzle-kit';

/**
 * Configuration Drizzle Kit (génération / application des migrations).
 * Utilisation : `npm run db:generate` puis `npm run db:push`
 * (nécessite DATABASE_URL, voir .env.example).
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env['DATABASE_URL'] ?? 'postgres://nexus:nexus@localhost:5432/nexus',
  },
  strict: true,
  verbose: true,
});
