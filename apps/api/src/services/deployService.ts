import { and, asc, eq } from 'drizzle-orm';
import { deploymentSchema, type CreateDeploymentInput, type Deployment, type DeploymentStageName } from '@nexus/contracts';
import type { Database } from '@nexus/db';
import { deploymentStages, deployments, projectFiles } from '@nexus/db';
import { AppError } from '../middleware/errors.js';
import { ERROR_CODES } from '@nexus/contracts';

/**
 * NEXUS Deploy — pipeline BUILD → TEST → SECURITY → STAGING → PRODUCTION.
 *
 * - exécution en environnement CONTRÔLÉ (étapes simulées, horodatées et
 *   journalisées) — AUCUN déploiement réel n'est déclenché ;
 * - l'étape SECURITY exécute un vrai contrôle (scan de secrets) ;
 * - PRODUCTION exige une action explicite (`promote` avec confirm:true) ;
 * - statuts : pending / running / success / failed / cancelled.
 */
const STAGE_ORDER: DeploymentStageName[] = ['build', 'test', 'security', 'staging', 'production'];

/** Scan réel de secrets dans les fichiers du projet (étape SECURITY). */
async function securityScan(db: Database, projectId: string): Promise<string[]> {
  const rows = await db
    .select({ path: projectFiles.path, content: projectFiles.content })
    .from(projectFiles)
    .where(and(eq(projectFiles.projectId, projectId), eq(projectFiles.isDirectory, false)));
  const patterns = [/BEGIN [A-Z ]*PRIVATE KEY/, /AKIA[0-9A-Z]{16}/, /-----BEGIN CERTIFICATE-----/];
  const findings: string[] = [];
  for (const row of rows) {
    const content = row.content ?? '';
    if (patterns.some((pattern) => pattern.test(content))) {
      findings.push(row.path);
    }
  }
  return findings;
}

export function createDeployService(db: Database) {
  async function loadStages(deploymentId: string) {
    const rows = await db
      .select()
      .from(deploymentStages)
      .where(eq(deploymentStages.deploymentId, deploymentId));
    return rows.sort(
      (a, b) => STAGE_ORDER.indexOf(a.name) - STAGE_ORDER.indexOf(b.name),
    );
  }

  async function serialize(deploymentId: string): Promise<Deployment> {
    const [deployment] = await db.select().from(deployments).where(eq(deployments.id, deploymentId)).limit(1);
    if (!deployment) throw new AppError(404, ERROR_CODES.NOT_FOUND, 'Déploiement introuvable.');
    const stages = await loadStages(deploymentId);
    return deploymentSchema.parse({
      ...deployment,
      confirmedAt: deployment.confirmedAt?.toISOString() ?? null,
      createdAt: deployment.createdAt.toISOString(),
      updatedAt: deployment.updatedAt.toISOString(),
      stages: stages.map((stage) => ({
        name: stage.name,
        status: stage.status,
        error: stage.error,
        startedAt: stage.startedAt?.toISOString() ?? null,
        finishedAt: stage.finishedAt?.toISOString() ?? null,
        logs: (stage.logs as { at: string; message: string }[]) ?? [],
      })),
    });
  }

  async function appendLog(stageId: string, message: string): Promise<void> {
    const [stage] = await db.select().from(deploymentStages).where(eq(deploymentStages.id, stageId)).limit(1);
    if (!stage) return;
    const logs = [...((stage.logs as { at: string; message: string }[]) ?? []), { at: new Date().toISOString(), message }];
    await db.update(deploymentStages).set({ logs }).where(eq(deploymentStages.id, stageId));
  }

  /** Exécute les étapes applicables, dans l'ordre, jusqu'au blocage. */
  async function runPipeline(deploymentId: string): Promise<Deployment> {
    const [deployment] = await db.select().from(deployments).where(eq(deployments.id, deploymentId)).limit(1);
    if (!deployment) throw new AppError(404, ERROR_CODES.NOT_FOUND, 'Déploiement introuvable.');

    await db.update(deployments).set({ status: 'running', updatedAt: new Date() }).where(eq(deployments.id, deploymentId));

    const stages = await loadStages(deploymentId);
    const stageByName = new Map(stages.map((stage) => [stage.name, stage]));

    for (const name of STAGE_ORDER) {
      const stage = stageByName.get(name);
      if (!stage || stage.status !== 'pending') continue;

      // PRODUCTION bloquée sans confirmation explicite.
      if (name === 'production' && deployment.environment === 'production' && !deployment.confirmedAt) {
        await db.update(deployments).set({ status: 'pending', updatedAt: new Date() }).where(eq(deployments.id, deploymentId));
        break;
      }

      await db
        .update(deploymentStages)
        .set({ status: 'running', startedAt: new Date() })
        .where(eq(deploymentStages.id, stage.id));

      let failed: string | null = null;

      if (name === 'security') {
        const findings = await securityScan(db, deployment.projectId);
        if (findings.length > 0) {
          failed = `Secrets détectés dans : ${findings.join(', ')}`;
          await appendLog(stage.id, `Scan de secrets : ${findings.length} problème(s)`);
        } else {
          await appendLog(stage.id, 'Scan de secrets : aucun problème détecté.');
        }
      } else if (name === 'production' && deployment.environment === 'staging') {
        // Étape non applicable à un déploiement staging.
        await db
          .update(deploymentStages)
          .set({ status: 'cancelled', finishedAt: new Date(), error: null })
          .where(eq(deploymentStages.id, stage.id));
        await appendLog(stage.id, 'Non applicable : déploiement staging.');
        continue;
      } else {
        // Environnement contrôlé : étape simulée, horodatée, journalisée.
        await appendLog(stage.id, `Étape ${name} exécutée en environnement contrôlé (simulation).`);
      }

      if (failed) {
        await db
          .update(deploymentStages)
          .set({ status: 'failed', finishedAt: new Date(), error: failed })
          .where(eq(deploymentStages.id, stage.id));
        await db.update(deployments).set({ status: 'failed', updatedAt: new Date() }).where(eq(deployments.id, deploymentId));
        break;
      }

      await db
        .update(deploymentStages)
        .set({ status: 'success', finishedAt: new Date() })
        .where(eq(deploymentStages.id, stage.id));
    }

    // Statut global.
    const [current] = await db.select().from(deployments).where(eq(deployments.id, deploymentId)).limit(1);
    if (current && current.status === 'running') {
      const after = await loadStages(deploymentId);
      const applicable = after.filter((stage) => !(stage.name === 'production' && current.environment === 'staging'));
      const allDone = applicable.every((stage) => stage.status === 'success' || stage.status === 'cancelled');
      await db
        .update(deployments)
        .set({ status: allDone ? 'success' : 'pending', updatedAt: new Date() })
        .where(eq(deployments.id, deploymentId));
    }

    return serialize(deploymentId);
  }

  return {
    /** Crée un déploiement et lance les étapes autorisées. */
    async create(projectId: string, userId: string, input: CreateDeploymentInput): Promise<Deployment> {
      const [deployment] = await db
        .insert(deployments)
        .values({ projectId, environment: input.environment, createdBy: userId })
        .returning();
      if (!deployment) throw new AppError(500, ERROR_CODES.INTERNAL_ERROR, 'Création du déploiement impossible.');

      await db.insert(deploymentStages).values(
        STAGE_ORDER.map((name) => ({ deploymentId: deployment.id, name })),
      );

      return runPipeline(deployment.id);
    },

    /** Promotion explicite en production (action humaine requise). */
    async promote(deploymentId: string, userId: string): Promise<Deployment> {
      void userId;
      const [deployment] = await db.select().from(deployments).where(eq(deployments.id, deploymentId)).limit(1);
      if (!deployment) throw new AppError(404, ERROR_CODES.NOT_FOUND, 'Déploiement introuvable.');
      if (deployment.environment !== 'production') {
        throw new AppError(400, ERROR_CODES.VALIDATION_ERROR, 'Ce déploiement n’est pas destiné à la production.');
      }
      if (deployment.confirmedAt) {
        throw new AppError(409, ERROR_CODES.CONFLICT, 'Production déjà confirmée.');
      }
      if (deployment.status !== 'pending') {
        throw new AppError(409, ERROR_CODES.CONFLICT, `Pipeline en statut « ${deployment.status} » : promotion impossible.`);
      }
      await db.update(deployments).set({ confirmedAt: new Date(), updatedAt: new Date() }).where(eq(deployments.id, deploymentId));
      return runPipeline(deploymentId);
    },

    async cancel(deploymentId: string, userId: string): Promise<Deployment> {
      void userId;
      const [deployment] = await db.select().from(deployments).where(eq(deployments.id, deploymentId)).limit(1);
      if (!deployment) throw new AppError(404, ERROR_CODES.NOT_FOUND, 'Déploiement introuvable.');
      if (deployment.status === 'success' || deployment.status === 'cancelled') {
        throw new AppError(409, ERROR_CODES.CONFLICT, `Statut « ${deployment.status} » : annulation impossible.`);
      }
      await db
        .update(deploymentStages)
        .set({ status: 'cancelled', finishedAt: new Date() })
        .where(and(eq(deploymentStages.deploymentId, deploymentId), eq(deploymentStages.status, 'pending')));
      await db
        .update(deploymentStages)
        .set({ status: 'cancelled', finishedAt: new Date() })
        .where(and(eq(deploymentStages.deploymentId, deploymentId), eq(deploymentStages.status, 'running')));
      await db.update(deployments).set({ status: 'cancelled', updatedAt: new Date() }).where(eq(deployments.id, deploymentId));
      return serialize(deploymentId);
    },

    async list(projectId: string): Promise<Deployment[]> {
      const rows = await db
        .select({ id: deployments.id })
        .from(deployments)
        .where(eq(deployments.projectId, projectId))
        .orderBy(asc(deployments.createdAt));
      return Promise.all(rows.map((row) => serialize(row.id)));
    },

    async get(deploymentId: string): Promise<Deployment> {
      return serialize(deploymentId);
    },

    /** Recalcule la disponibilité : utilisé par les tests. */
    run: runPipeline,
  };
}

export type DeployService = ReturnType<typeof createDeployService>;
