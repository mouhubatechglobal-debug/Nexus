// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import App from '../../apps/web/src/App';
import { ROUTES } from '../../apps/web/src/routes';

afterEach(cleanup);

function goTo(path: string): void {
  act(() => {
    window.location.hash = `#${path}`;
  });
  act(() => {
    window.dispatchEvent(new Event('hashchange'));
  });
}

describe('Interface NEXUS — navigation et rendu', () => {
  it('affiche la sidebar avec les 12 destinations', () => {
    render(<App />);
    const nav = screen.getByRole('navigation', { name: 'Navigation principale' });
    for (const route of ROUTES) {
      expect(within(nav).getByRole('link', { name: new RegExp(route.label) })).toBeTruthy();
    }
  });

  it('expose un lien d’évitement vers le contenu', () => {
    render(<App />);
    expect(screen.getByRole('link', { name: 'Aller au contenu' })).toBeTruthy();
  });

  it.each(ROUTES.map((route) => [route.path, route.label] as const))(
    'rend la page %s avec son titre',
    (path, label) => {
      render(<App />);
      goTo(path);
      expect(screen.getByRole('heading', { level: 1, name: label })).toBeTruthy();
      expect(document.title).toContain(label);
    },
  );

  it('retombe sur le Dashboard pour un chemin inconnu', () => {
    render(<App />);
    goTo('/inexistant');
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeTruthy();
  });
});
