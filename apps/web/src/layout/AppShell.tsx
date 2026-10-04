import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { RouteDefinition } from '../router';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

/**
 * Coque applicative : sidebar (drawer sur mobile), topbar et zone
 * de contenu. La navigation se ferme au changement de route et à Échap.
 */
export function AppShell({ route, children }: { route: RouteDefinition; children: ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    setNavOpen(false);
  }, [route.id]);

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setNavOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navOpen]);

  useEffect(() => {
    document.body.classList.toggle('nav-open', navOpen);
    return () => document.body.classList.remove('nav-open');
  }, [navOpen]);

  return (
    <div className="shell">
      <a className="skip-link" href="#contenu">
        Aller au contenu
      </a>
      <button
        type="button"
        className="nav-overlay"
        aria-label="Fermer la navigation"
        tabIndex={-1}
        onClick={() => setNavOpen(false)}
      />
      <Sidebar activeId={route.id} onNavigate={() => setNavOpen(false)} />
      <div className="shell-area">
        <Topbar route={route} navOpen={navOpen} onMenu={() => setNavOpen((open) => !open)} />
        <main id="contenu" className="page" tabIndex={-1}>
          {children}
        </main>
        <footer className="app-footer">
          <p>Nexus · Digital Creation OS — v0.2.0 · interface de démonstration, données temporaires</p>
        </footer>
      </div>
    </div>
  );
}
