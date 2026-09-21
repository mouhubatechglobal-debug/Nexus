/**
 * NEXUS Agents — architecture d'agents à permissions explicites.
 *
 * Principe de sécurité fondateur :
 * - les permissions existantes sont énumérées dans `AgentPermission`
 *   (union de types) : « shell », « secrets » ou « fs global » n'existent
 *   PAS dans le système — impossible d'en accorder, même par erreur ;
 * - chaque agent déclare un ensemble FIXE de permissions ;
 * - l'orchestrateur refuse toute tâche demandant une permission
 *   non déclarée et journalise chaque action (autorisée ou refusée) ;
 * - un contexte d'exécution est lié à UNE organisation et UN projet :
 *   aucune capability ne peut en atteindre une autre.
 */

/** Permissions possibles — fermées par construction. */
export type AgentPermission =
  | 'files:read'
  | 'files:write'
  | 'brain:read'
  | 'brain:write'
  | 'design:read'
  | 'design:write'
  | 'lab:read'
  | 'lab:write'
  | 'analysis:run'
  | 'web:research'
  | 'report:write';

/** Capacités qu'aucun agent n'aura JAMAIS (garde-fou documenté). */
export type ForbiddenCapability = 'shell' | 'secrets' | 'global-filesystem' | 'cross-organization';

export const AGENT_NAMES = [
  'architect',
  'developer',
  'designer',
  'researcher',
  'tester',
  'auditor',
  'marketing',
] as const;

export type AgentName = (typeof AGENT_NAMES)[number];

/** Permissions fixes par agent. L'Auditor n'a AUCUNE écriture. */
export const AGENT_PERMISSIONS: Record<AgentName, readonly AgentPermission[]> = {
  architect: ['files:read', 'brain:read', 'brain:write', 'design:read', 'analysis:run'],
  developer: ['files:read', 'files:write'],
  designer: ['files:read', 'design:read', 'design:write'],
  researcher: ['web:research', 'brain:read', 'lab:read', 'lab:write'],
  tester: ['files:read', 'analysis:run', 'lab:write'],
  auditor: ['files:read', 'analysis:run', 'report:write'],
  marketing: ['brain:read', 'lab:read', 'web:research'],
} as const;

/** Erreur de permission — signalée, jamais silencieuse. */
export class AgentPermissionError extends Error {
  readonly permission: AgentPermission;
  constructor(permission: AgentPermission, agent: AgentName) {
    super(`L'agent « ${agent} » n'a pas la permission « ${permission} ».`);
    this.name = 'AgentPermissionError';
    this.permission = permission;
  }
}

/** Contexte d'exécution : lié à un utilisateur, une org, un projet. */
export interface AgentContext {
  agent: AgentName;
  userId: string;
  organizationId: string;
  projectId: string;
  /** Capacités réelles, fournies par l'hôte selon les permissions. */
  capabilities: AgentCapabilities;
}

/** Actions journalisées par l'orchestrateur. */
export interface AgentAction {
  permission: AgentPermission;
  allowed: boolean;
  detail: string;
}

/** Résultat standardisé d'une exécution d'agent. */
export interface AgentResult {
  agent: AgentName;
  status: 'success' | 'denied' | 'failed';
  output?: string;
  error?: string;
  actions: AgentAction[];
}

/**
 * Capacités injectées : chaque fonction vérifie la permission via
 * `requirePermission` AVANT d'atteindre la ressource. Aucune fonction
 * shell/fichier global n'existe ici.
 */
export interface AgentCapabilities {
  requirePermission: (permission: AgentPermission) => void;
  record: (action: AgentAction) => void;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  readBrain(kind: string): Promise<unknown[]>;
  writeBrain(kind: string, title: string, content: string): Promise<void>;
  readDesign(): Promise<unknown>;
  writeDesign(design: unknown): Promise<void>;
  readLab(kind: string): Promise<unknown[]>;
  writeLab(kind: string, title: string, content: string): Promise<void>;
  analyze(target: string): Promise<string>;
  research(query: string): Promise<unknown[]>;
  report(title: string, content: string): Promise<void>;
}

/** Définition d'un agent. */
export interface AgentDefinition {
  name: AgentName;
  description: string;
  /** Tâche : reçoit un contexte dont les capabilities sont gardées. */
  run(context: AgentContext, task: AgentTask): Promise<string>;
}

/** Tâche demandée à un agent, avec les permissions qu'elle requiert. */
export interface AgentTask {
  description: string;
  requiredPermissions: readonly AgentPermission[];
  /** Détails pour le journal d'actions. */
  target?: string;
}

/** Orchestrateur : enregistre les agents et applique les permissions. */
export class AgentOrchestrator {
  private readonly agents = new Map<AgentName, AgentDefinition>();

  register(definition: AgentDefinition): void {
    this.agents.set(definition.name, definition);
  }

  has(name: AgentName): boolean {
    return this.agents.has(name);
  }

  /** Permissions effectives d'un agent (source de vérité : AGENT_PERMISSIONS). */
  permissionsOf(name: AgentName): readonly AgentPermission[] {
    return AGENT_PERMISSIONS[name] ?? [];
  }

  /**
   * Exécute une tâche : vérifie d'abord les permissions requises,
   * puis fournit un contexte dont TOUT appel de capability est contrôlé
   * et journalisé. Une permission manquante → statut `denied`.
   */
  async run(name: AgentName, task: AgentTask, request: {
    userId: string;
    organizationId: string;
    projectId: string;
    /** Capteurs réels de l'hôte (accès org/projet déjà vérifiés en amont). */
    host: Omit<AgentCapabilities, 'requirePermission' | 'record'>;
  }): Promise<AgentResult> {
    const definition = this.agents.get(name);
    const actions: AgentAction[] = [];

    if (!definition) {
      return { agent: name, status: 'failed', error: `Agent « ${name} » inconnu.`, actions };
    }

    // 1) La tâche ne doit demander que des permissions détenues.
    const granted = AGENT_PERMISSIONS[name];
    for (const permission of task.requiredPermissions) {
      const allowed = granted.includes(permission);
      actions.push({ permission, allowed, detail: `tâche : ${task.description}` });
      if (!allowed) {
        return { agent: name, status: 'denied', error: `Permission « ${permission} » refusée.`, actions };
      }
    }

    // 2) Capabilities gardées : chaque accès vérifie + journalise.
    const requirePermission = (permission: AgentPermission): void => {
      if (!granted.includes(permission)) {
        throw new AgentPermissionError(permission, name);
      }
    };
    const record = (action: AgentAction): void => {
      actions.push(action);
    };
    const guarded = (permission: AgentPermission, detail: string, operation: () => Promise<unknown>): Promise<unknown> => {
      requirePermission(permission);
      record({ permission, allowed: true, detail });
      return operation();
    };

    const capabilities: AgentCapabilities = {
      requirePermission,
      record,
      readFile: (path) => guarded('files:read', `lecture ${path}`, () => request.host.readFile(path)),
      writeFile: (path, content) =>
        guarded('files:write', `écriture ${path}`, () => request.host.writeFile(path, content)),
      readBrain: (kind) => guarded('brain:read', `lecture brain ${kind}`, () => request.host.readBrain(kind)),
      writeBrain: (kind, title, content) =>
        guarded('brain:write', `écriture brain ${kind}`, () => request.host.writeBrain(kind, title, content)),
      readDesign: () => guarded('design:read', 'lecture design', () => request.host.readDesign()),
      writeDesign: (design) => guarded('design:write', 'écriture design', () => request.host.writeDesign(design)),
      readLab: (kind) => guarded('lab:read', `lecture lab ${kind}`, () => request.host.readLab(kind)),
      writeLab: (kind, title, content) =>
        guarded('lab:write', `écriture lab ${kind}`, () => request.host.writeLab(kind, title, content)),
      analyze: (target) => guarded('analysis:run', `analyse ${target}`, () => request.host.analyze(target)),
      research: (query) => guarded('web:research', `recherche ${query}`, () => request.host.research(query)),
      report: (title, content) => guarded('report:write', `rapport ${title}`, () => request.host.report(title, content)),
    };

    const context: AgentContext = {
      agent: name,
      userId: request.userId,
      organizationId: request.organizationId,
      projectId: request.projectId,
      capabilities,
    };

    try {
      const output = await definition.run(context, task);
      return { agent: name, status: 'success', output, actions };
    } catch (error) {
      if (error instanceof AgentPermissionError) {
        record({ permission: error.permission, allowed: false, detail: error.message });
        return { agent: name, status: 'denied', error: error.message, actions };
      }
      return { agent: name, status: 'failed', error: String(error), actions };
    }
  }
}

/* ------------------------- Agents NEXUS ------------------------------ */

export const AGENTS: Record<AgentName, AgentDefinition> = {
  architect: {
    name: 'architect',
    description: 'Conçoit la structure technique et documente les décisions dans le Brain.',
    async run(context, task) {
      const analysis = await context.capabilities.analyze(task.target ?? task.description);
      await context.capabilities.writeBrain(
        'architecture',
        `Architecture — ${task.description.slice(0, 80)}`,
        analysis,
      );
      return analysis;
    },
  },
  developer: {
    name: 'developer',
    description: 'Lit les fichiers autorisés et applique les modifications demandées.',
    async run(context, task) {
      const current = await context.capabilities.readFile(task.target ?? 'README.md');
      const updated = `${current}\n\n<!-- ${task.description} -->\n`;
      await context.capabilities.writeFile(task.target ?? 'README.md', updated);
      return `Modification appliquée à ${task.target ?? 'README.md'}.`;
    },
  },
  designer: {
    name: 'designer',
    description: 'Fait évoluer le document de conception NEXUS Studio.',
    async run(context, task) {
      const design = (await context.capabilities.readDesign()) as Record<string, unknown> | null;
      await context.capabilities.writeDesign({
        ...(design ?? {}),
        notes: [...((design?.notes as string[]) ?? []), task.description],
      });
      return `Conception mise à jour : ${task.description}`;
    },
  },
  researcher: {
    name: 'researcher',
    description: 'Recherche des sources et consigne des hypothèses dans le Lab.',
    async run(context, task) {
      const findings = await context.capabilities.research(task.description);
      await context.capabilities.writeLab(
        'hypothesis',
        `Hypothèse — ${task.description.slice(0, 80)}`,
        `Sources consultées : ${findings.length}`,
      );
      return `${findings.length} source(s) analysée(s).`;
    },
  },
  tester: {
    name: 'tester',
    description: 'Analyse le code et produit des résultats de test dans le Lab.',
    async run(context, task) {
      const analysis = await context.capabilities.analyze(task.target ?? task.description);
      await context.capabilities.writeLab('result', `Test — ${task.description.slice(0, 80)}`, analysis);
      return analysis;
    },
  },
  auditor: {
    name: 'auditor',
    description: 'Lit et analyse — AUCUNE action d’écriture ni destructive.',
    async run(context, task) {
      const analysis = await context.capabilities.analyze(task.target ?? task.description);
      await context.capabilities.report(`Audit — ${task.description.slice(0, 60)}`, analysis);
      return analysis;
    },
  },
  marketing: {
    name: 'marketing',
    description: 'S’appuie sur le Brain et la recherche pour proposer un positionnement.',
    async run(context, task) {
      const knowledge = await context.capabilities.readBrain('objective');
      return `Positionnement proposé (${knowledge.length} objectif(s) lus) : ${task.description}`;
    },
  },
} as const;

/** Orchestrateur pré-configuré avec les 7 agents NEXUS. */
export function createNexusOrchestrator(): AgentOrchestrator {
  const orchestrator = new AgentOrchestrator();
  for (const name of AGENT_NAMES) {
    orchestrator.register(AGENTS[name]);
  }
  return orchestrator;
}
