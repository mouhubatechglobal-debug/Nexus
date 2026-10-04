import type { IncomingMessage, ServerResponse } from 'node:http';
import { loadDotEnv, loadEnv } from '@nexus/config';
import { buildApp, type AppHandle } from '../apps/api/src/app.js';

/**
 * Point d'entrée Vercel (Node serverless) de l'API NEXUS.
 *
 * L'application Fastify est construite UNE FOIS par instance froide puis
 * réutilisée (pattern singleton async). Chaque requête HTTP arrive avec le
 * préfixe `/api` (rewrite vercel.json) — on le retire pour retrouver les
 * chemins internes (`/health`, `/v1/...`), exactement comme le proxy Vite
 * en développement.
 *
 * Base de données : DB_DRIVER=postgres OBLIGATOIRE (DATABASE_URL) — le
 * driver embarqué PGlite est refusé en production par la config (stockage
 * éphémère sur serverless). Les migrations s'appliquent automatiquement au
 * premier démarrage (verrou consultatif : sûre même si plusieurs instances
 * démarrent en parallèle).
 */

let ready: Promise<AppHandle> | null = null;

function getHandle(): Promise<AppHandle> {
  ready ??= (async () => {
    loadDotEnv();
    const env = loadEnv();
    return buildApp({ env });
  })();
  return ready;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const handle = await getHandle();
  const url = req.url ?? '/';
  req.url = url === '/api' || url === '/api/' ? '/' : url.startsWith('/api/') ? url.slice(4) : url;
  await handle.app.ready();
  handle.app.routing(req, res);
}
