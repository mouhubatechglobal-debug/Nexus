import { createHash, randomBytes } from 'node:crypto';
import type { CookieSerializeOptions } from '@fastify/cookie';
import { hash as argon2Hash, verify as argon2Verify } from '@node-rs/argon2';
import { ERROR_CODES } from '@nexus/contracts';
import { AppError } from '../middleware/errors.js';
import type { AppConfig } from '../config/index.js';
import type { Database } from '@nexus/db';
import {
  organizationMembers,
  organizations,
  sessions,
  users,
} from '@nexus/db';
import { and, eq, gt, isNull, lt } from 'drizzle-orm';
import type { RegisterInput } from '../schemas/auth.js';

/**
 * Authentification réelle :
 * - mots de passe hachés Argon2id (paramètres OWASP) — jamais en clair ;
 * - sessions opaques : le cookie porte un jeton aléatoire (256 bits),
 *   la base ne stocke que son SHA-256 ;
 * - expiration et révocation en base ;
 * - temps de vérification égalisé pour empêcher l'énumération d'e-mails.
 */

/**
 * Paramètres Argon2id (recommandation OWASP). L'algorithme par défaut de
 * @node-rs/argon2 est déjà Argon2id.
 */
const ARGON2ID_OPTIONS = {
  memoryCost: 19_456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

export const SESSION_COOKIE = 'nexus_session';

/** Ligne utilisateur minimale exposée (jamais le hash). */
export interface SessionUser {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: Date;
}

export interface RequestMeta {
  userAgent?: string | undefined;
  ip: string;
}

/** Hash précalculé : coût constant même pour un e-mail inconnu. */
const DUMMY_HASH_PROMISE = argon2Hash('nexus-timing-equalizer-1', ARGON2ID_OPTIONS);

function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export interface AuthServiceOptions {
  db: Database;
  config: Pick<AppConfig, 'SESSION_TTL_HOURS' | 'isProduction' | 'cookieSecure'>;
}

export function createAuthService(options: AuthServiceOptions) {
  const { db, config } = options;

  const cookieOptions = (): CookieSerializeOptions => ({
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    maxAge: config.SESSION_TTL_HOURS * 60 * 60,
  });

  async function createSession(userId: string, meta: RequestMeta) {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + config.SESSION_TTL_HOURS * 60 * 60 * 1000);

    await db.insert(sessions).values({
      userId,
      tokenHash: hashToken(token),
      userAgent: meta.userAgent ?? null,
      ipAddress: meta.ip,
      expiresAt,
    });

    // Hygiène : purge des sessions expirées de cet utilisateur.
    await db
      .delete(sessions)
      .where(and(eq(sessions.userId, userId), lt(sessions.expiresAt, new Date())));

    return { token, expiresAt };
  }

  return {
    SESSION_COOKIE,
    cookieOptions,

    /** Inscrit l'utilisateur (avec organisation personnelle) et ouvre une session. */
    async register(input: RegisterInput, meta: RequestMeta): Promise<{ user: SessionUser; token: string }> {
      const existing = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, input.email))
        .limit(1);

      if (existing.length > 0) {
        throw new AppError(409, ERROR_CODES.EMAIL_TAKEN, 'Un compte existe déjà avec cette adresse e-mail.');
      }

      const passwordHash = await argon2Hash(input.password, ARGON2ID_OPTIONS);
      const displayName = input.displayName ?? null;

      const created = await db.transaction(async (tx) => {
        const [user] = await tx
          .insert(users)
          .values({
            email: input.email,
            passwordHash,
            displayName,
          })
          .returning({
            id: users.id,
            email: users.email,
            displayName: users.displayName,
            createdAt: users.createdAt,
          });

        if (!user) {
          throw new AppError(500, ERROR_CODES.INTERNAL_ERROR, 'Création du compte impossible.');
        }

        const orgName = input.organizationName ?? `${displayName ?? input.email.split('@')[0] ?? 'studio'}`;
        const [organization] = await tx
          .insert(organizations)
          .values({
            name: orgName,
            slug: `${slugify(orgName) || 'org'}-${randomBytes(3).toString('hex')}`,
            createdBy: user.id,
          })
          .returning({ id: organizations.id });

        if (organization) {
          await tx.insert(organizationMembers).values({
            organizationId: organization.id,
            userId: user.id,
            role: 'owner',
          });
        }

        return user;
      });

      const { token } = await createSession(created.id, meta);
      return { user: created, token };
    },

    /** Vérifie les identifiants et ouvre une session. */
    async login(email: string, password: string, meta: RequestMeta): Promise<{ user: SessionUser; token: string }> {
      const rows = await db
        .select({
          id: users.id,
          email: users.email,
          passwordHash: users.passwordHash,
          displayName: users.displayName,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      const row = rows[0];

      // Temps de vérification égalisé : un e-mail inconnu coûte autant
      // qu'un mot de passe erroné (pas d'énumération par le temps).
      const validPassword = await argon2Verify(
        row?.passwordHash ?? (await DUMMY_HASH_PROMISE),
        password,
      ).catch(() => false);

      if (!row || !validPassword) {
        throw new AppError(401, ERROR_CODES.INVALID_CREDENTIALS, 'E-mail ou mot de passe incorrect.');
      }

      await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, row.id));

      const { token } = await createSession(row.id, meta);
      return {
        user: { id: row.id, email: row.email, displayName: row.displayName, createdAt: row.createdAt },
        token,
      };
    },

    /** Révoque la session correspondant au jeton (s'il existe). */
    async logout(token: string | undefined): Promise<void> {
      if (!token) return;
      await db
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(and(eq(sessions.tokenHash, hashToken(token)), isNull(sessions.revokedAt)));
    },

    /** Résout un jeton de session en utilisateur (null si invalide/expiré/révoqué). */
    async getUserByToken(token: string | undefined): Promise<SessionUser | null> {
      if (!token || token.length < 20 || token.length > 128) return null;
      const rows = await db
        .select({
          id: users.id,
          email: users.email,
          displayName: users.displayName,
          createdAt: users.createdAt,
        })
        .from(sessions)
        .innerJoin(users, eq(users.id, sessions.userId))
        .where(
          and(
            eq(sessions.tokenHash, hashToken(token)),
            isNull(sessions.revokedAt),
            gt(sessions.expiresAt, new Date()),
          ),
        )
        .limit(1);

      return rows[0] ?? null;
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
