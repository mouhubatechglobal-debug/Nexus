import { z } from 'zod';

/** Rôles de membre, du plus faible au plus fort : MEMBER < ADMIN < OWNER. */
export const memberRoleSchema = z.enum(['member', 'admin', 'owner']);
export type MemberRole = z.infer<typeof memberRoleSchema>;

const ROLE_RANK: Record<MemberRole, number> = { member: 1, admin: 2, owner: 3 };

/** Vérifie que `role` est au moins `minimum`. */
export function roleAtLeast(role: MemberRole, minimum: MemberRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

/** Organisation exposée à l'API (avec le rôle de l'appelant). */
export const organizationSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  role: memberRoleSchema,
  createdAt: z.string(),
});
export type Organization = z.infer<typeof organizationSchema>;

export const createOrganizationSchema = z.object({
  name: z.string().trim().min(2, 'Nom trop court').max(80),
});
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
