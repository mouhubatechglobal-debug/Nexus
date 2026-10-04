import { and, eq } from 'drizzle-orm';
import { ERROR_CODES } from '@nexus/contracts';
import { roleAtLeast, type MemberRole } from '@nexus/contracts';
import type { Database } from '@nexus/db';
import { organizationMembers, projects } from '@nexus/db';
import { AppError } from './errors.js';
import type { SessionUser } from '../services/authService.js';

/**
 * Chaîne d'autorisation de NEXUS :
 *   utilisateur (session) → organisation (membership) → rôle → permission.
 *
 * Isolation multi-tenant (anti-IDOR) :
 * - une ressource d'une organisation étrangère renvoie 404 (l'existence
 *   n'est jamais révélée) — un changement d'ID dans l'URL ne permet
 *   donc pas de contourner l'isolation ;
 * - un rôle insuffisant dans SA propre organisation renvoie 403.
 */

export interface Membership {
  role: MemberRole;
}

export async function getMembership(
  db: Database,
  userId: string,
  organizationId: string,
): Promise<Membership | null> {
  const rows = await db
    .select({ role: organizationMembers.role })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, organizationId),
        eq(organizationMembers.userId, userId),
      ),
    )
    .limit(1);
  const role = rows[0]?.role;
  return role ? { role } : null;
}

/** Exige que l'utilisateur soit membre de l'organisation avec un rôle ≥ minimum. */
export async function requireOrgAccess(
  db: Database,
  user: SessionUser,
  organizationId: string,
  minimum: MemberRole,
): Promise<Membership> {
  const membership = await getMembership(db, user.id, organizationId);
  if (!membership) {
    // 404 volontaire : pas de fuite d'existence sur une org étrangère.
    throw new AppError(404, ERROR_CODES.NOT_FOUND, 'Organisation introuvable.');
  }
  if (!roleAtLeast(membership.role, minimum)) {
    throw new AppError(
      403,
      ERROR_CODES.INSUFFICIENT_ROLE,
      `Rôle « ${membership.role} » insuffisant : « ${minimum} » requis.`,
    );
  }
  return membership;
}

export interface ProjectAccess {
  role: MemberRole;
  [key: string]: unknown;
}

/**
 * Exige un projet accessible : le projet doit exister ET appartenir à
 * une organisation dont l'utilisateur est membre (rôle ≥ minimum).
 * Projet inexistant ou organisation étrangère → même réponse (404).
 */
export async function requireProjectAccess(
  db: Database,
  user: SessionUser,
  projectId: string,
  minimum: MemberRole = 'member',
): Promise<ProjectAccess> {
  const rows = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  const project = rows[0];
  if (!project) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, 'Projet introuvable.');
  }

  const membership = await getMembership(db, user.id, project.organizationId);
  if (!membership) {
    // Isolation : un projet d'une autre organisation = « introuvable ».
    throw new AppError(404, ERROR_CODES.NOT_FOUND, 'Projet introuvable.');
  }
  if (!roleAtLeast(membership.role, minimum)) {
    throw new AppError(
      403,
      ERROR_CODES.INSUFFICIENT_ROLE,
      `Rôle « ${membership.role} » insuffisant : « ${minimum} » requis.`,
    );
  }

  return { ...project, role: membership.role };
}
