import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { organizationSchema, type Organization } from '@nexus/contracts';
import type { Database } from '@nexus/db';
import { organizationMembers, organizations } from '@nexus/db';

/** Organisations : liste des organisations de l'utilisateur, création. */
export function createOrgService(db: Database) {
  return {
    /** Organisations de l'utilisateur, avec son rôle dans chacune. */
    async listForUser(userId: string): Promise<Organization[]> {
      const rows = await db
        .select({
          id: organizations.id,
          name: organizations.name,
          slug: organizations.slug,
          role: organizationMembers.role,
          createdAt: organizations.createdAt,
        })
        .from(organizationMembers)
        .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
        .where(eq(organizationMembers.userId, userId));

      return rows.map((row) =>
        organizationSchema.parse({
          id: row.id,
          name: row.name,
          slug: row.slug,
          role: row.role,
          createdAt: row.createdAt.toISOString(),
        }),
      );
    },

    /** Crée une organisation ; le créateur devient OWNER. */
    async create(userId: string, name: string): Promise<Organization> {
      const slug = `${name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || 'org'}-${randomBytes(3).toString('hex')}`;

      return db.transaction(async (tx) => {
        const [org] = await tx
          .insert(organizations)
          .values({ name, slug, createdBy: userId })
          .returning();
        if (!org) throw new Error('Création organisation impossible');
        await tx.insert(organizationMembers).values({
          organizationId: org.id,
          userId,
          role: 'owner',
        });
        return organizationSchema.parse({
          id: org.id,
          name: org.name,
          slug: org.slug,
          role: 'owner',
          createdAt: org.createdAt.toISOString(),
        });
      });
    },
  };
}

export type OrgService = ReturnType<typeof createOrgService>;
