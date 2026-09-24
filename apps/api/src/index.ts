import { loadDotEnv, loadEnv } from '@nexus/config';
import { buildApp } from './app.js';

async function main(): Promise<void> {
  loadDotEnv();
  const env = loadEnv();
  const handle = await buildApp({ env });

  const shutdown = async (signal: string) => {
    handle.app.log.info({ signal }, 'Arrêt de l’API…');
    await handle.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  // 0.0.0.0 : écoute accessible depuis l'extérieur du conteneur/sandbox.
  await handle.app.listen({ port: env.PORT, host: '0.0.0.0' });
  handle.app.log.info(
    `API NEXUS prête sur http://0.0.0.0:${env.PORT} (db: ${env.DB_DRIVER})`,
  );
}

main().catch((error) => {
  // Logger pas encore instancié à ce stade : sortie stderr.
  console.error('Échec du démarrage de l’API NEXUS :', error);
  process.exit(1);
});
