// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../apps/web/src/App';
import { ROUTES } from '../../apps/web/src/routes';

/**
 * L'interface exige une session : on simule l'API (l'application est
 * testée de bout en bout par tests/integration — ici on teste le rendu).
 */
vi.mock('../../apps/web/src/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../apps/web/src/lib/api')>();
  const user = {
    id: '00000000-0000-0000-0000-000000000001',
    email: 'demo@nexus.test',
    displayName: 'Démo',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
  const project = {
    id: '00000000-0000-0000-0000-000000000002',
    organizationId: '00000000-0000-0000-0000-000000000003',
    name: 'Projet démo',
    slug: 'projet-demo',
    description: null,
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
  return {
    ...actual,
    ApiError: class extends Error {},
    api: {
      me: vi.fn().mockResolvedValue({ user }),
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      organizations: vi.fn().mockResolvedValue([
        { id: '00000000-0000-0000-0000-000000000003', name: 'Studio Démo', slug: 'studio-demo', role: 'owner', createdAt: '2026-01-01T00:00:00.000Z' },
      ]),
      createOrganization: vi.fn(),
      projects: vi.fn().mockResolvedValue({ data: [project], page: 1, limit: 9, total: 1, totalPages: 1 }),
      createProject: vi.fn(),
      deleteProject: vi.fn(),
      brainList: vi.fn().mockResolvedValue([]),
      brainCreate: vi.fn(),
      brainDelete: vi.fn(),
      filesList: vi.fn().mockResolvedValue([]),
      fileRead: vi.fn(),
      fileCreate: vi.fn(),
      fileWrite: vi.fn(),
      fileRename: vi.fn(),
      fileDelete: vi.fn(),
      studioGet: vi.fn().mockResolvedValue({ design: null }),
      studioSave: vi.fn(),
      labList: vi.fn().mockResolvedValue([]),
      labCreate: vi.fn(),
      auditsList: vi.fn().mockResolvedValue([]),
      auditsRun: vi.fn(),
    },
  };
});

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(cleanup);

function goTo(path: string): void {
  act(() => {
    window.location.hash = `#${path}`;
  });
  act(() => {
    window.dispatchEvent(new Event('hashchange'));
  });
}

describe('Interface NEXUS — navigation et rendu (session simulée)', () => {
  it('affiche la sidebar avec les 12 destinations', async () => {
    render(<App />);
    await waitFor(() => expect(screen.queryByText('Connexion à NEXUS…')).toBeNull());
    const nav = screen.getByRole('navigation', { name: 'Navigation principale' });
    for (const route of ROUTES) {
      expect(within(nav).getByRole('link', { name: new RegExp(route.label) })).toBeTruthy();
    }
  });

  it('expose un lien d’évitement vers le contenu', async () => {
    render(<App />);
    await waitFor(() => expect(screen.queryByText('Connexion à NEXUS…')).toBeNull());
    expect(screen.getByRole('link', { name: 'Aller au contenu' })).toBeTruthy();
  });

  it.each(ROUTES.map((route) => [route.path, route.label] as const))(
    'rend la page %s avec son titre',
    async (path, label) => {
      render(<App />);
      await waitFor(() => expect(screen.queryByText('Connexion à NEXUS…')).toBeNull());
      goTo(path);
      expect(screen.getByRole('heading', { level: 1, name: label })).toBeTruthy();
      expect(document.title).toContain(label);
    },
  );

  it('retombe sur le Dashboard pour un chemin inconnu', async () => {
    render(<App />);
    await waitFor(() => expect(screen.queryByText('Connexion à NEXUS…')).toBeNull());
    goTo('/inexistant');
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeTruthy();
  });
});
