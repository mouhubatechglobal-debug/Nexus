/**
 * NEXUS Sandbox — abstraction d'exécution isolée.
 *
 * Architecture : Job → Sandbox → Execution → Result.
 *
 * ⚠️  ARCHITECTURE_ONLY — RÈGLE ABSOLUE :
 * - aucun code utilisateur non fiable n'est JAMAIS exécuté dans le
 *   processus principal du backend (ni eval, ni vm, ni child_process ici) ;
 * - les drivers réels (gVisor, Firecracker) sont prévus mais NON
 *   implémentés dans cet environnement ;
 * - le driver « local-process » est volontairement REFUSÉ par défaut :
 *   il n'est pas sécurisé (pas d'isolation matérielle) — l'activer
 *   exigerait un drapeau explicite hors production, et ne le rendrait
 *   toujours PAS propre à la production.
 *
 * NE PAS PRÉSENTER CE MODULE COMME SÉCURISÉ EN PRODUCTION.
 */

/** Politique d'exécution demandée à un sandbox. */
export interface SandboxPolicy {
  /** Part de CPU (1024 = 1 vCPU). */
  cpuShares: number;
  /** Mémoire maximale en Mo. */
  memoryMb: number;
  /** Délai maximal d'exécution en ms. */
  timeoutMs: number;
  /** Politique réseau. */
  network: 'none' | 'loopback' | 'bridged';
  /** Accès filesystem. */
  filesystem: 'none' | 'workspace-read' | 'workspace-read-write';
}

export const SANDBOX_POLICY_LIMITS = {
  cpuShares: { min: 32, max: 1024 },
  memoryMb: { min: 64, max: 2048 },
  timeoutMs: { min: 500, max: 60_000 },
} as const;

/** Politique par défaut : le plus verrouillé possible. */
export const DEFAULT_SANDBOX_POLICY: SandboxPolicy = {
  cpuShares: 128,
  memoryMb: 256,
  timeoutMs: 10_000,
  network: 'none',
  filesystem: 'none',
};

/** Erreur de validation de politique. */
export class SandboxPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SandboxPolicyError';
  }
}

/** Valide et borne une politique (défense en profondeur). */
export function validatePolicy(policy: Partial<SandboxPolicy>): SandboxPolicy {
  const merged: SandboxPolicy = { ...DEFAULT_SANDBOX_POLICY, ...policy };
  const limits = SANDBOX_POLICY_LIMITS;
  if (!Number.isInteger(merged.cpuShares) || merged.cpuShares < limits.cpuShares.min || merged.cpuShares > limits.cpuShares.max) {
    throw new SandboxPolicyError(`cpuShares hors bornes [${limits.cpuShares.min}, ${limits.cpuShares.max}]`);
  }
  if (!Number.isInteger(merged.memoryMb) || merged.memoryMb < limits.memoryMb.min || merged.memoryMb > limits.memoryMb.max) {
    throw new SandboxPolicyError(`memoryMb hors bornes [${limits.memoryMb.min}, ${limits.memoryMb.max}]`);
  }
  if (!Number.isInteger(merged.timeoutMs) || merged.timeoutMs < limits.timeoutMs.min || merged.timeoutMs > limits.timeoutMs.max) {
    throw new SandboxPolicyError(`timeoutMs hors bornes [${limits.timeoutMs.min}, ${limits.timeoutMs.max}]`);
  }
  if (merged.network === 'bridged') {
    throw new SandboxPolicyError('Réseau bridged interdit : none ou loopback uniquement.');
  }
  return merged;
}

export interface ExecutionResult {
  ok: boolean;
  stdout: string | null;
  stderr: string | null;
  exitCode: number | null;
  timedOut: boolean;
  /** Nom du driver ayant exécuté (traçabilité). */
  driver: string;
}

/** Marqueur d'honnêteté : driver prévu mais non disponible. */
export const ARCHITECTURE_ONLY = 'ARCHITECTURE_ONLY' as const;

export class SandboxUnavailableError extends Error {
  readonly driver: string;
  readonly marker = ARCHITECTURE_ONLY;
  constructor(driver: string, reason: string) {
    super(`[ARCHITECTURE_ONLY] Le driver « ${driver} » n'est pas disponible ici : ${reason}`);
    this.name = 'SandboxUnavailableError';
    this.driver = driver;
  }
}

export interface SandboxDriver {
  readonly name: string;
  /** `true` = abstraction seule, aucune exécution réelle. */
  readonly architectureOnly: boolean;
  /** Description honnête de l'état. */
  readonly status: string;
  execute(policy: SandboxPolicy, code: string): Promise<ExecutionResult>;
}

/** Driver réel prévu : gVisor (runsc) — non implémenté dans cet env. */
export function createGvisorDriver(): SandboxDriver {
  return {
    name: 'gvisor',
    architectureOnly: true,
    status: 'Prévu pour intégration gVisor (runsc). Non disponible dans cet environnement.',
    async execute() {
      throw new SandboxUnavailableError('gvisor', 'binaire runsc absent');
    },
  };
}

/** Driver réel prévu : Firecracker (microVM) — non implémenté. */
export function createFirecrackerDriver(): SandboxDriver {
  return {
    name: 'firecracker',
    architectureOnly: true,
    status: 'Prévu pour intégration Firecracker (microVM). Non disponible dans cet environnement.',
    async execute() {
      throw new SandboxUnavailableError('firecracker', 'microVM absente');
    },
  };
}

/**
 * Driver « local-process » : REFUSÉ PAR DÉFAUT. L'exécution locale de
 * code non fiable n'est pas une isolation — même avec des limites CPU/RAM.
 * `allowUnsafe` ne doit JAMAIS valoir true en production.
 */
export function createLocalProcessDriver(allowUnsafe = false): SandboxDriver {
  return {
    name: 'local-process',
    architectureOnly: true,
    status: allowUnsafe
      ? 'DÉSACTIVÉ PAR CONCEPTION — activé manuellement hors production, NON sécurisé.'
      : 'Refusé par défaut : exécution locale de code non fiable interdite.',
    async execute() {
      throw new SandboxUnavailableError(
        'local-process',
        allowUnsafe ? 'activé manuellement mais NON sécurisé (interdit en production)' : 'refus par défaut (sécurité)',
      );
    },
  };
}

/** Drivers exposés — tous ARCHITECTURE_ONLY dans cet environnement. */
export function defaultDrivers(): SandboxDriver[] {
  return [createGvisorDriver(), createFirecrackerDriver(), createLocalProcessDriver(false)];
}

/**
 * Point d'entrée unique : TOUTE exécution de code non fiable passe par
 * ici, via un driver isolé. Aucun chemin d'exécution direct n'existe.
 */
export async function runInSandbox(
  policy: Partial<SandboxPolicy>,
  code: string,
  driver: SandboxDriver,
): Promise<ExecutionResult> {
  const validated = validatePolicy(policy);
  if (driver.architectureOnly) {
    await driver.execute(validated, code); // lève SandboxUnavailableError
  }
  return driver.execute(validated, code);
}
