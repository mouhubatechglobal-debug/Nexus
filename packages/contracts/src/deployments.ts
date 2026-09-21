import { z } from 'zod';

/** Statuts de déploiement et d'étape. */
export const deploymentStatusSchema = z.enum([
  'pending',
  'running',
  'success',
  'failed',
  'cancelled',
]);
export type DeploymentStatus = z.infer<typeof deploymentStatusSchema>;

export const deploymentStageNameSchema = z.enum([
  'build',
  'test',
  'security',
  'staging',
  'production',
]);
export type DeploymentStageName = z.infer<typeof deploymentStageNameSchema>;

export const deploymentStageSchema = z.object({
  name: deploymentStageNameSchema,
  status: deploymentStatusSchema,
  logs: z.array(z.object({ at: z.string(), message: z.string() })),
  error: z.string().nullable(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
});
export type DeploymentStage = z.infer<typeof deploymentStageSchema>;

export const deploymentSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  environment: z.enum(['staging', 'production']),
  status: deploymentStatusSchema,
  /** Null tant que l'action explicite de promotion n'a pas été faite. */
  confirmedAt: z.string().nullable(),
  stages: z.array(deploymentStageSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Deployment = z.infer<typeof deploymentSchema>;

export const createDeploymentSchema = z.object({
  environment: z.enum(['staging', 'production']),
});
export type CreateDeploymentInput = z.infer<typeof createDeploymentSchema>;

export const promoteDeploymentSchema = z.object({
  confirm: z.literal(true, { message: 'La promotion en production exige confirm: true' }),
});
