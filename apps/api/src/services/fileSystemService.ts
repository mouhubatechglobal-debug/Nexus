import { and, asc, eq, like, ne } from 'drizzle-orm';
import {
  fileContentSchema,
  fileNodeSchema,
  type CreateFileInput,
  type FileContent,
  type FileNode,
} from '@nexus/contracts';
import type { Database } from '@nexus/db';
import { fileVersions, projectFiles } from '@nexus/db';
import { AppError } from '../middleware/errors.js';
import { ERROR_CODES } from '@nexus/contracts';

/**
 * NEXUS Forge — filesystem VIRTUEL d'un projet (stocké en base).
 *
 * Sécurité critique :
 * - aucun accès au disque hôte : tout est en base, rattaché à un projet ;
 * - validation stricte des chemins : relatif, segments bornés à
 *   [A-Za-z0-9._-], refus de `..`, `.`, barres inverses, chemins
 *   absolus, encodages suspects (%..) — pas de path traversal, pas
 *   d'accès hors projet ni à des fichiers système ;
 * - chaîne de contrôle effectuée en amont : utilisateur → organisation
 *   → projet (requireProjectAccess) → fichier (project_id indexé).
 */

const SEGMENT_PATTERN = /^[A-Za-z0-9._-]+$/;
const MAX_DEPTH = 12;

const MIME_BY_EXTENSION: Record<string, string> = {
  md: 'text/markdown',
  json: 'application/json',
  ts: 'text/typescript',
  tsx: 'text/typescript',
  js: 'text/javascript',
  css: 'text/css',
  html: 'text/html',
  svg: 'image/svg+xml',
  txt: 'text/plain',
  yml: 'text/yaml',
  yaml: 'text/yaml',
};

function mimeForPath(path: string): string {
  const extension = path.split('.').pop()?.toLowerCase() ?? '';
  return MIME_BY_EXTENSION[extension] ?? 'application/octet-stream';
}

/**
 * Valide et normalise un chemin relatif de projet.
 * Lève une erreur de validation si le chemin est dangereux.
 */
export function validateProjectPath(rawPath: string): string {
  const candidate = rawPath.trim();
  if (candidate.length === 0 || candidate.length > 256) {
    throw new AppError(400, ERROR_CODES.VALIDATION_ERROR, 'Chemin vide ou trop long.');
  }
  if (candidate.startsWith('/') || candidate.includes('\\') || candidate.includes('\0')) {
    throw new AppError(400, ERROR_CODES.VALIDATION_ERROR, 'Chemin invalide : absolu ou mal formé.');
  }
  if (/%2e|%2f|%5c/i.test(candidate) || candidate.includes('..')) {
    throw new AppError(400, ERROR_CODES.VALIDATION_ERROR, 'Chemin invalide : traversée détectée.');
  }
  const segments = candidate.split('/');
  if (segments.length > MAX_DEPTH) {
    throw new AppError(400, ERROR_CODES.VALIDATION_ERROR, 'Chemin trop profond.');
  }
  for (const segment of segments) {
    if (segment === '' || segment === '.' || segment === '..' || !SEGMENT_PATTERN.test(segment)) {
      throw new AppError(400, ERROR_CODES.VALIDATION_ERROR, `Segment de chemin invalide : « ${segment} »`);
    }
  }
  return segments.join('/');
}

function parentOf(path: string): string | null {
  const segments = path.split('/');
  segments.pop();
  return segments.length === 0 ? null : segments.join('/');
}

/** Vérifie que tous les dossiers parents existent (création de fichier). */
async function ensureParents(db: Database, projectId: string, userId: string, path: string): Promise<void> {
  let current = parentOf(path);
  const missing: string[] = [];
  while (current) {
    const rows = await db
      .select({ path: projectFiles.path })
      .from(projectFiles)
      .where(and(eq(projectFiles.projectId, projectId), eq(projectFiles.path, current)))
      .limit(1);
    if (rows.length === 0) missing.unshift(current);
    current = parentOf(current);
  }
  for (const directory of missing) {
    await db.insert(projectFiles).values({
      projectId,
      path: directory,
      name: directory.split('/').pop() ?? directory,
      isDirectory: true,
      mime: 'inode/directory',
      createdBy: userId,
    });
  }
}

export function createFileSystemService(db: Database) {
  return {
    validateProjectPath,

    /** Liste arborescente (préfixe optionnel, ex. `src/`). */
    async list(projectId: string, prefix?: string): Promise<FileNode[]> {
      const normalizedPrefix = prefix ? validateProjectPath(prefix) : null;
      const where = normalizedPrefix
        ? and(
            eq(projectFiles.projectId, projectId),
            like(projectFiles.path, `${normalizedPrefix}/%`),
          )
        : eq(projectFiles.projectId, projectId);
      const rows = await db.select().from(projectFiles).where(where).orderBy(asc(projectFiles.path));
      return rows.map((row) => fileNodeSchema.parse(toNode(row)));
    },

    async read(projectId: string, rawPath: string): Promise<FileContent> {
      const path = validateProjectPath(rawPath);
      const rows = await db
        .select()
        .from(projectFiles)
        .where(and(eq(projectFiles.projectId, projectId), eq(projectFiles.path, path)))
        .limit(1);
      const row = rows[0];
      if (!row) {
        throw new AppError(404, ERROR_CODES.NOT_FOUND, 'Fichier introuvable.');
      }
      if (row.isDirectory) {
        throw new AppError(400, ERROR_CODES.VALIDATION_ERROR, 'Ceci est un dossier.');
      }
      return fileContentSchema.parse({ ...toNode(row), content: row.content ?? '' });
    },

    async create(projectId: string, userId: string, input: CreateFileInput): Promise<FileNode> {
      const path = validateProjectPath(input.path);
      const existing = await db
        .select({ id: projectFiles.id })
        .from(projectFiles)
        .where(and(eq(projectFiles.projectId, projectId), eq(projectFiles.path, path)))
        .limit(1);
      if (existing.length > 0) {
        throw new AppError(409, ERROR_CODES.CONFLICT, 'Un élément existe déjà à ce chemin.');
      }

      const isDirectory = input.type === 'directory';
      const content = isDirectory ? null : (input.content ?? '');
      await ensureParents(db, projectId, userId, path);

      const [row] = await db
        .insert(projectFiles)
        .values({
          projectId,
          path,
          name: path.split('/').pop() ?? path,
          isDirectory,
          mime: isDirectory ? 'inode/directory' : (input.mime ?? mimeForPath(path)),
          size: content ? Buffer.byteLength(content, 'utf8') : 0,
          content,
          createdBy: userId,
        })
        .returning();

      if (!row) {
        throw new AppError(500, ERROR_CODES.INTERNAL_ERROR, 'Création du fichier impossible.');
      }
      if (content !== null) {
        // Version initiale historisée.
        await db.insert(fileVersions).values({ fileId: row.id, version: 1, content, createdBy: userId });
      }
      return fileNodeSchema.parse(toNode(row));
    },

    /** Écriture : incrémente la version et archive le contenu précédent. */
    async update(projectId: string, userId: string, rawPath: string, content: string): Promise<FileNode> {
      const path = validateProjectPath(rawPath);
      const rows = await db
        .select()
        .from(projectFiles)
        .where(and(eq(projectFiles.projectId, projectId), eq(projectFiles.path, path)))
        .limit(1);
      const row = rows[0];
      if (!row) {
        throw new AppError(404, ERROR_CODES.NOT_FOUND, 'Fichier introuvable.');
      }
      if (row.isDirectory) {
        throw new AppError(400, ERROR_CODES.VALIDATION_ERROR, 'Impossible d’écrire dans un dossier.');
      }

      const nextVersion = row.version + 1;
      const updated = await db.transaction(async (tx) => {
        const [saved] = await tx
          .update(projectFiles)
          .set({
            content,
            version: nextVersion,
            size: Buffer.byteLength(content, 'utf8'),
            updatedAt: new Date(),
          })
          .where(eq(projectFiles.id, row.id))
          .returning();
        await tx.insert(fileVersions).values({ fileId: row.id, version: nextVersion, content, createdBy: userId });
        return saved;
      });

      if (!updated) {
        throw new AppError(500, ERROR_CODES.INTERNAL_ERROR, 'Écriture impossible.');
      }
      return fileNodeSchema.parse(toNode(updated));
    },

    /** Renommage/déplacement — récursif pour les dossiers. */
    async rename(projectId: string, userId: string, rawPath: string, rawNewPath: string): Promise<FileNode[]> {
      const path = validateProjectPath(rawPath);
      const newPath = validateProjectPath(rawNewPath);
      if (newPath === path) {
        throw new AppError(400, ERROR_CODES.VALIDATION_ERROR, 'Le chemin est identique.');
      }

      const rows = await db
        .select()
        .from(projectFiles)
        .where(and(eq(projectFiles.projectId, projectId), eq(projectFiles.path, path)))
        .limit(1);
      const target = rows[0];
      if (!target) {
        throw new AppError(404, ERROR_CODES.NOT_FOUND, 'Fichier introuvable.');
      }

      // Conflit de destination ?
      const conflicts = await db
        .select({ id: projectFiles.id })
        .from(projectFiles)
        .where(and(eq(projectFiles.projectId, projectId), eq(projectFiles.path, newPath)))
        .limit(1);
      if (conflicts.length > 0) {
        throw new AppError(409, ERROR_CODES.CONFLICT, 'La destination existe déjà.');
      }

      await ensureParents(db, projectId, userId, newPath);

      // Descendants du dossier déplacé.
      const descendants = await db
        .select()
        .from(projectFiles)
        .where(
          and(
            eq(projectFiles.projectId, projectId),
            like(projectFiles.path, `${path}/%`),
            ne(projectFiles.path, path),
          ),
        );

      await db.transaction(async (tx) => {
        await tx
          .update(projectFiles)
          .set({
            path: newPath,
            name: newPath.split('/').pop() ?? newPath,
            updatedAt: new Date(),
          })
          .where(eq(projectFiles.id, target.id));
        for (const descendant of descendants) {
          const moved = `${newPath}${descendant.path.slice(path.length)}`;
          await tx
            .update(projectFiles)
            .set({ path: moved, name: moved.split('/').pop() ?? moved, updatedAt: new Date() })
            .where(eq(projectFiles.id, descendant.id));
        }
      });

      const after = await db
        .select()
        .from(projectFiles)
        .where(
          target.isDirectory
            ? like(projectFiles.path, `${newPath}%`)
            : eq(projectFiles.path, newPath),
        )
        .orderBy(asc(projectFiles.path));
      return after.map((row) => fileNodeSchema.parse(toNode(row)));
    },

    /** Suppression — récursive pour les dossiers (versions en cascade). */
    async remove(projectId: string, rawPath: string): Promise<number> {
      const path = validateProjectPath(rawPath);
      const deleted = await db
        .delete(projectFiles)
        .where(and(eq(projectFiles.projectId, projectId), eq(projectFiles.path, path)))
        .returning({ id: projectFiles.id });

      if (deleted.length === 0) {
        // Peut-être un dossier avec enfants : suppression par préfixe.
        const removed = await db
          .delete(projectFiles)
          .where(and(eq(projectFiles.projectId, projectId), like(projectFiles.path, `${path}/%`)))
          .returning({ id: projectFiles.id });
        if (removed.length === 0) {
          throw new AppError(404, ERROR_CODES.NOT_FOUND, 'Fichier introuvable.');
        }
        return removed.length;
      }

      // Dossier : supprimer aussi les descendants.
      await db
        .delete(projectFiles)
        .where(and(eq(projectFiles.projectId, projectId), like(projectFiles.path, `${path}/%`)));
      return 1;
    },
  };
}

type FileRow = {
  id: string;
  projectId: string;
  path: string;
  name: string;
  isDirectory: boolean;
  mime: string;
  size: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

function toNode(row: FileRow) {
  return {
    id: row.id,
    projectId: row.projectId,
    path: row.path,
    name: row.name,
    isDirectory: row.isDirectory,
    mime: row.mime,
    size: row.size,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export type FileSystemService = ReturnType<typeof createFileSystemService>;
