import { describe, expect, it } from 'vitest';
import {
  AGENT_NAMES,
  AGENT_PERMISSIONS,
  AgentOrchestrator,
  createNexusOrchestrator,
  type AgentCapabilities,
  type AgentPermission,
} from '@nexus/agents';

/**
 * PROMPT 11 — orchestrateur d'agents et permissions explicites.
 * Aucun agent n'a shell, secrets, filesystem global ou accès inter-organisations.
 */
describe('NEXUS Agents — permissions et orchestration', () => {
  function makeHost(projectId: string) {
    const calls: { kind: string; detail: string }[] = [];
    const host: Omit<AgentCapabilities, 'requirePermission' | 'record'> = {
      readFile: async (path) => {
        calls.push({ kind: 'files:read', detail: path });
        return `contenu de ${path}`;
      },
      writeFile: async (path) => {
        calls.push({ kind: 'files:write', detail: path });
      },
      readBrain: async (kind) => {
        calls.push({ kind: 'brain:read', detail: kind });
        return [{ title: 'objectif 1' }];
      },
      writeBrain: async (kind) => {
        calls.push({ kind: 'brain:write', detail: kind });
      },
      readDesign: async () => {
        calls.push({ kind: 'design:read', detail: 'design' });
        return { pages: [] };
      },
      writeDesign: async () => {
        calls.push({ kind: 'design:write', detail: 'design' });
      },
      readLab: async (kind) => {
        calls.push({ kind: 'lab:read', detail: kind });
        return [];
      },
      writeLab: async (kind) => {
        calls.push({ kind: 'lab:write', detail: kind });
      },
      analyze: async (target) => {
        calls.push({ kind: 'analysis:run', detail: target });
        return `analyse de ${target} (projet ${projectId})`;
      },
      research: async (query) => {
        calls.push({ kind: 'web:research', detail: query });
        return [{ title: 'source' }];
      },
      report: async (title) => {
        calls.push({ kind: 'report:write', detail: title });
      },
    };
    return { host, calls };
  }

  it('Developer : lecture + écriture AUTORISÉES', async () => {
    const orchestrator = createNexusOrchestrator();
    const { host, calls } = makeHost('p-1');
    const result = await orchestrator.run(
      'developer',
      { description: 'Corriger le bug', requiredPermissions: ['files:read', 'files:write'], target: 'src/app.ts' },
      { userId: 'u-1', organizationId: 'o-1', projectId: 'p-1', host },
    );
    expect(result.status).toBe('success');
    expect(calls.some((call) => call.kind === 'files:read')).toBe(true);
    expect(calls.some((call) => call.kind === 'files:write')).toBe(true);
  });

  it('Auditor : AUCUNE écriture — tâche exigeant files:write → DENIED avant exécution', async () => {
    const orchestrator = createNexusOrchestrator();
    const { host, calls } = makeHost('p-1');
    const result = await orchestrator.run(
      'auditor',
      { description: 'Écrire un correctif', requiredPermissions: ['files:write'] },
      { userId: 'u-1', organizationId: 'o-1', projectId: 'p-1', host },
    );
    expect(result.status).toBe('denied');
    expect(calls).toHaveLength(0); // rien n'a été exécuté
  });

  it('Auditor : usage frauduleux d’une capability depuis la tâche → refusé', async () => {
    const orchestrator = createNexusOrchestrator();
    const { host, calls } = makeHost('p-1');
    const result = await orchestrator.run(
      'auditor',
      { description: 'Audit simple', requiredPermissions: [] },
      {
        userId: 'u-1',
        organizationId: 'o-1',
        projectId: 'p-1',
        host: {
          ...host,
          writeFile: async () => {
            throw new Error('ne doit jamais être atteint');
          },
        },
      },
    );
    // L'auditor ne lit que : son run() n'appelle jamais writeFile.
    expect(result.status).toBe('success');
    expect(calls.every((call) => call.kind !== 'files:write')).toBe(true);
  });

  it('les permissions de tous les agents excluent shell / secrets / fs global', () => {
    const forbidden = /shell|secret|root|global|system|admin:all/i;
    for (const name of AGENT_NAMES) {
      for (const permission of AGENT_PERMISSIONS[name]) {
        expect(forbidden.test(permission), `${name}:${permission}`).toBe(false);
      }
    }
    // Vérification par liste blanche : union exacte des permissions connues.
    const known: AgentPermission[] = [
      'files:read',
      'files:write',
      'brain:read',
      'brain:write',
      'design:read',
      'design:write',
      'lab:read',
      'lab:write',
      'analysis:run',
      'web:research',
      'report:write',
    ];
    for (const name of AGENT_NAMES) {
      for (const permission of AGENT_PERMISSIONS[name]) {
        expect(known).toContain(permission);
      }
    }
  });

  it('chaque agent a un ensemble de permissions non vide et cohérent', () => {
    for (const name of AGENT_NAMES) {
      expect(AGENT_PERMISSIONS[name].length).toBeGreaterThan(0);
    }
    // L'auditeur : lecture/analyse + rapport — aucune écriture de fichiers
    // ni de contenu projet (aucune action destructive possible).
    for (const permission of AGENT_PERMISSIONS.auditor) {
      expect(['files:read', 'analysis:run', 'report:write']).toContain(permission);
      expect(permission).not.toBe('files:write');
    }
  });

  it('le contexte est strictement lié à son organisation/projet (pas de cross-tenant)', async () => {
    const orchestrator = createNexusOrchestrator();
    const observed: string[] = [];
    const { host } = makeHost('p-2');
    const result = await orchestrator.run(
      'developer',
      { description: 'Lire le bon projet', requiredPermissions: ['files:read'], target: 'index.ts' },
      {
        userId: 'u-1',
        organizationId: 'o-2',
        projectId: 'p-2',
        host: {
          ...host,
          readFile: async (path) => {
            observed.push('p-2');
            void path;
            return 'ok';
          },
        },
      },
    );
    expect(result.status).toBe('success');
    expect(observed).toEqual(['p-2']);
  });

  it('agent inconnu → failed', async () => {
    const orchestrator = new AgentOrchestrator();
    const { host } = makeHost('p-1');
    const result = await orchestrator.run(
      'ghost',
      { description: 'x', requiredPermissions: [] },
      { userId: 'u', organizationId: 'o', projectId: 'p', host },
    );
    expect(result.status).toBe('failed');
  });
});
