import { useEffect, useState } from 'react';
import type { HealthResponse } from '@nexus/contracts';
import { fetchHealth } from './lib/api.js';

function StatusDot({ up }: { up: boolean }) {
  return <span className={up ? 'dot dot-up' : 'dot dot-down'} aria-hidden="true" />;
}

export default function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const poll = () => {
      fetchHealth()
        .then((result) => {
          if (cancelled) return;
          if (result.ok) {
            setHealth(result.value);
            setError(null);
          } else {
            setError(result.error);
          }
        })
        .catch(() => {
          if (!cancelled) setError('API injoignable');
        });
    };

    poll();
    const interval = window.setInterval(poll, 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  return (
    <main className="shell">
      <header className="hero">
        <p className="eyebrow">Prompt 01 · Structure de base</p>
        <h1>
          Nexus<span className="accent">.</span>
        </h1>
        <p className="tagline">Digital Creation OS</p>
      </header>

      <section className="card" aria-live="polite">
        <h2>État de la plateforme</h2>
        {error !== null && (
          <p className="status-line muted">
            <StatusDot up={false} /> API injoignable — démarrez <code>npm run dev</code>.
          </p>
        )}
        {error === null && health === null && <p className="status-line muted">Connexion à l’API…</p>}
        {health !== null && (
          <>
            <p className="status-line">
              API <StatusDot up={health.status === 'ok'} />
              <strong>{health.status === 'ok' ? ' opérationnelle' : ' dégradée'}</strong>
              <span className="muted"> · v{health.version} · uptime {health.uptimeSeconds}s</span>
            </p>
            <ul className="checks">
              <li>
                <StatusDot up={health.checks.database === 'up'} /> PostgreSQL&nbsp;:{' '}
                <strong>{health.checks.database}</strong>
              </li>
              <li>
                <StatusDot up={health.checks.redis === 'up'} /> Redis&nbsp;:{' '}
                <strong>{health.checks.redis}</strong>
              </li>
            </ul>
          </>
        )}
      </section>

      <footer className="footer muted">
        Monorepo React · Vite · TypeScript · Fastify · PostgreSQL · Drizzle · Zod · Redis · BullMQ
      </footer>
    </main>
  );
}
