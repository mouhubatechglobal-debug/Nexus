import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Configuration de développement :
 * - écoute sur 0.0.0.0 (accès conteneur / sandbox) ;
 * - `allowedHosts: true` pour accepter l'hôte de preview proxifié ;
 * - proxy /api vers l'API Fastify (pas d'appel localhost côté navigateur).
 */
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: process.env['API_PROXY_TARGET'] ?? 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
    proxy: {
      '/api': {
        target: process.env['API_PROXY_TARGET'] ?? 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  build: {
    sourcemap: true,
  },
});
