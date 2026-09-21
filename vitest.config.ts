import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const pkg = (name: string) =>
  fileURLToPath(new URL(`./packages/${name}/src/index.ts`, import.meta.url));

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@nexus/config': pkg('config'),
      '@nexus/contracts': pkg('contracts'),
      '@nexus/core': pkg('core'),
      '@nexus/db': pkg('db'),
      '@nexus/observability': pkg('observability'),
      '@nexus/workers': fileURLToPath(
        new URL('./services/workers/src/index.ts', import.meta.url),
      ),
      '@nexus/api': fileURLToPath(new URL('./apps/api/src/app.ts', import.meta.url)),
    },
  },
});
