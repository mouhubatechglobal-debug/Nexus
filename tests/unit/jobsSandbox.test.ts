import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  InProcessQueue,
  createDigestProcessor,
  QUEUE_NAMES,
} from '@nexus/workers';
import {
  ARCHITECTURE_ONLY,
  DEFAULT_SANDBOX_POLICY,
  SandboxPolicyError,
  SandboxUnavailableError,
  createFirecrackerDriver,
  createGvisorDriver,
  createLocalProcessDriver,
  defaultDrivers,
  runInSandbox,
  validatePolicy,
} from '@nexus/sandbox';
import { JOB_RETRY_POLICY } from '@nexus/contracts';

/* ------------------- Prompt 17 — jobs (driver mémoire) ---------------- */

function makeDeps(counts: { projects: number; brain: number; events: number }, failFirst = 0) {
  let calls = 0;
  return {
    deps: {
      countProjects: async () => {
        calls += 1;
        if (calls <= failFirst) throw new Error('panique temporaire');
        return counts.projects;
      },
      countBrainEntries: async () => counts.brain,
      countAnalyticsEvents: async () => counts.events,
    },
    getCalls: () => calls,
  };
}

describe('Jobs — Queue → Worker → Job → Result (driver mémoire)', () => {
  it('exécute le job interne réel digest avec progression et résultat validé', async () => {
    const { deps } = makeDeps({ projects: 7, brain: 12, events: 34 });
    const queue = new InProcessQueue(QUEUE_NAMES.digest, createDigestProcessor(deps));

    const { jobId } = await queue.enqueue({ organizationId: '00000000-0000-0000-0000-000000000001', requestedBy: '00000000-0000-0000-0000-000000000002' });
    expect(jobId).toMatch(/^mem_/);

    // Attente de complétion (poll court).
    let record = queue.get(jobId)!;
    for (let i = 0; i < 100 && record.status !== 'completed'; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      record = queue.get(jobId)!;
    }
    expect(record.status).toBe('completed');
    expect(record.progress).toBe(100);
    expect(record.result).toEqual({
      projects: 7,
      brainEntries: 12,
      analyticsEvents: 34,
      computedAt: expect.any(String),
    });
  });

  it('retry avec backoff : un échec temporaire finit en succès (attempts ≥ 2)', async () => {
    const { deps } = makeDeps({ projects: 1, brain: 2, events: 3 }, 1);
    const queue = new InProcessQueue(QUEUE_NAMES.digest, createDigestProcessor(deps));
    const { jobId } = await queue.enqueue({ organizationId: '00000000-0000-0000-0000-000000000001', requestedBy: '00000000-0000-0000-0000-000000000002' });

    let record = queue.get(jobId)!;
    for (let i = 0; i < 150 && record.status !== 'completed'; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      record = queue.get(jobId)!;
    }
    expect(record.status).toBe('completed');
    expect(record.attempts).toBeGreaterThanOrEqual(2);
  });

  it('échec définitif : statut failed + message d’erreur', async () => {
    const queue = new InProcessQueue(QUEUE_NAMES.digest, async () => {
      throw new Error('échec permanent');
    });
    const { jobId } = await queue.enqueue({ organizationId: '00000000-0000-0000-0000-000000000001', requestedBy: '00000000-0000-0000-0000-000000000002' });

    let record = queue.get(jobId)!;
    const maxAttempts = JOB_RETRY_POLICY.attempts;
    for (let i = 0; i < 300 && record.status !== 'failed'; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      record = queue.get(jobId)!;
    }
    expect(record.status).toBe('failed');
    expect(record.error).toContain('échec permanent');
    expect(record.attempts).toBe(maxAttempts);
  });

  it('payload invalide → rejet (validation Zod)', async () => {
    const { deps } = makeDeps({ projects: 0, brain: 0, events: 0 });
    const processor = createDigestProcessor(deps);
    await expect(processor({ organizationId: 'pas-un-uuid' as never })).rejects.toThrow();
  });
});

/* --------------------- Prompt 18 — sandbox ---------------------------- */

describe('Sandbox — abstraction et refus par défaut', () => {
  it('politique par défaut verrouillée (réseau none, fs none)', () => {
    expect(DEFAULT_SANDBOX_POLICY.network).toBe('none');
    expect(DEFAULT_SANDBOX_POLICY.filesystem).toBe('none');
    expect(validatePolicy({}).network).toBe('none');
  });

  it('politiques hors bornes → SandboxPolicyError', () => {
    expect(() => validatePolicy({ memoryMb: 999_999 })).toThrow(SandboxPolicyError);
    expect(() => validatePolicy({ timeoutMs: 1 })).toThrow(SandboxPolicyError);
    expect(() => validatePolicy({ cpuShares: 0 })).toThrow(SandboxPolicyError);
    expect(() => validatePolicy({ network: 'bridged' })).toThrow(SandboxPolicyError);
  });

  it('tous les drivers sont ARCHITECTURE_ONLY et refusent l’exécution', async () => {
    const drivers = defaultDrivers();
    expect(drivers).toHaveLength(3);
    for (const driver of drivers) {
      expect(driver.architectureOnly).toBe(true);
      await expect(runInSandbox({}, 'code malveillant', driver)).rejects.toThrow(SandboxUnavailableError);
    }
  });

  it('le marqueur ARCHITECTURE_ONLY est explicite dans l’erreur', async () => {
    try {
      await runInSandbox({}, 'x', createGvisorDriver());
      expect.unreachable();
    } catch (error) {
      expect((error as SandboxUnavailableError).marker).toBe(ARCHITECTURE_ONLY);
      expect(String(error)).toContain('ARCHITECTURE_ONLY');
    }
  });

  it('le driver local-process reste refusé même si on tente de l’utiliser', async () => {
    const unsafe = createLocalProcessDriver(false);
    await expect(runInSandbox({ memoryMb: 256 }, 'echo pwned', unsafe)).rejects.toThrow(/refus/);
    // Même « autorisé » manuellement, le driver n'exécute RIEN (stub refus).
    const forced = createLocalProcessDriver(true);
    await expect(runInSandbox({}, 'echo pwned', forced)).rejects.toThrow(/NON sécurisé/);
    void createFirecrackerDriver;
  });

  it('InProcessQueue : cancel() annule un job en attente et le worker ne l’exécute jamais', async () => {
    const { InProcessQueue } = await import('@nexus/workers');
    let started = 0;
    let release: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queue = new InProcessQueue('nexus.digest', async () => {
      started += 1;
      await gate;
      return { projects: 0, brainEntries: 0, analyticsEvents: 0, computedAt: new Date().toISOString() };
    });
    const { jobId } = await queue.enqueue({ organizationId: 'org-cancel', requestedBy: 'user-1' });
    // Laisse le worker passer en running, puis annule un SECOND job encore en attente.
    await new Promise((resolve) => setTimeout(resolve, 10));
    const second = await queue.enqueue({ organizationId: 'org-cancel', requestedBy: 'user-1' });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(queue.cancel(second.jobId)).toBe(true);
    expect(queue.get(second.jobId)?.status).toBe('cancelled');
    expect(queue.cancel(second.jobId)).toBe(false); // déjà annulé
    expect(queue.cancel('inconnu')).toBe(false);

    release?.();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(queue.get(jobId)?.status).toBe('completed');
    expect(started).toBe(1); // le job annulé n'a JAMAIS démarré
  });
});
