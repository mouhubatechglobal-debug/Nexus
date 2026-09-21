import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import {
  createEmbeddedDb,
  organizationMembers,
  organizations,
  projects,
  runMigrations,
  users,
  type DbHandle,
} from '@nexus/db';

/**
 * Extrait le code SQLSTATE PostgreSQL d'une erreur Drizzle/PGlite.
 * L'erreur traverse plusieurs couches : DrizzleQueryError → cause (PGlite).
 */
function pgCode(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current !== null && current !== undefined; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === 'string') return code;
    const errors = (current as { errors?: unknown[] }).errors;
    if (Array.isArray(errors) && errors.length > 0) {
      current = errors[0];
      continue;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

describe('@nexus/db — schéma, contraintes et migrations', () => {
  let db: DbHandle;

  beforeAll(async () => {
    db = await createEmbeddedDb();
    await runMigrations(db);
  });

  afterAll(async () => {
    await db.close();
  });

  it('les migrations créent un schéma opérationnel (insertion + lecture)', async () => {
    const [user] = await db.db
      .insert(users)
      .values({ email: 'alice@nexus.test', passwordHash: 'argon2id$placeholder', displayName: 'Alice' })
      .returning({ id: users.id, email: users.email, createdAt: users.createdAt });

    expect(user?.id).toBeTruthy();
    expect(user?.email).toBe('alice@nexus.test');
    expect(user?.createdAt).toBeInstanceOf(Date);

    const rows = await db.db.select().from(users).where(eq(users.email, 'alice@nexus.test'));
    expect(rows).toHaveLength(1);
  });

  it('l’unicité de l’e-mail est appliquée (23505)', async () => {
    try {
      await db.db.insert(users).values({ email: 'alice@nexus.test', passwordHash: 'x' });
      expect.unreachable('l’insertion aurait dû échouer');
    } catch (error) {
      expect(pgCode(error) ?? String(error)).toContain('23505');
    }
  });

  it('les clés étrangères sont appliquées (23503)', async () => {
    try {
      await db.db.insert(projects).values({
        organizationId: randomUUID(),
        name: 'Orphelin',
        slug: 'orphan',
      });
      expect.unreachable('l’insertion aurait dû échouer');
    } catch (error) {
      expect(pgCode(error) ?? String(error)).toContain('23503');
    }
  });

  it('supprimer une organisation cascade sur membres et projets', async () => {
    const [user] = await db.db
      .insert(users)
      .values({ email: 'bob@nexus.test', passwordHash: 'argon2id$placeholder' })
      .returning({ id: users.id });

    const [org] = await db.db
      .insert(organizations)
      .values({ name: 'Studio Bob', slug: 'studio-bob', createdBy: user!.id })
      .returning({ id: organizations.id });

    await db.db.insert(organizationMembers).values({
      organizationId: org!.id,
      userId: user!.id,
      role: 'owner',
    });
    await db.db.insert(projects).values({
      organizationId: org!.id,
      name: 'Projet cascade',
      slug: 'cascade',
      createdBy: user!.id,
    });

    await db.db.delete(organizations).where(eq(organizations.id, org!.id));

    const members = await db.db
      .select()
      .from(organizationMembers)
      .where(eq(organizationMembers.organizationId, org!.id));
    const orphanProjects = await db.db
      .select()
      .from(projects)
      .where(eq(projects.organizationId, org!.id));

    expect(members).toHaveLength(0);
    expect(orphanProjects).toHaveLength(0);
  });

  it('le couple (organisation, slug) de projet est unique', async () => {
    const [user] = await db.db
      .insert(users)
      .values({ email: 'carol@nexus.test', passwordHash: 'argon2id$placeholder' })
      .returning({ id: users.id });

    const [org] = await db.db
      .insert(organizations)
      .values({ name: 'Studio Carol', slug: 'studio-carol' })
      .returning({ id: organizations.id });

    await db.db.insert(projects).values({ organizationId: org!.id, name: 'Alpha', slug: 'alpha' });

    try {
      await db.db.insert(projects).values({ organizationId: org!.id, name: 'Alpha bis', slug: 'alpha' });
      expect.unreachable('l’insertion aurait dû échouer');
    } catch (error) {
      expect(pgCode(error) ?? String(error)).toContain('23505');
    }
  });
});
