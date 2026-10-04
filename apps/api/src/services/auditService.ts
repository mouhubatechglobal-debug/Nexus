import { desc, eq, like, and } from 'drizzle-orm';
import {
  auditCheckSchema,
  auditReportSchema,
  type AuditCategory,
  type AuditCheck,
  type AuditReport,
} from '@nexus/contracts';
import type { Database } from '@nexus/db';
import { brainEntries, projectAudits, projectFiles } from '@nexus/db';

/**
 * NEXUS Doctor — audit structuré et HONNÊTE.
 *
 * Règle absolue : un contrôle n'est `PASS` que s'il a réellement été
 * exécuté avec succès. Les contrôles nécessitant une URL déployée
 * (Performance, SEO, Accessibility, UX) sont `NOT_TESTED` tant
 * qu'aucune cible n'est disponible — jamais « passés » par défaut.
 */

type CheckRunner = () => Promise<{ status: AuditCheck['status']; message: string }>;

interface CheckDefinition {
  id: string;
  category: AuditCategory;
  run: CheckRunner;
}

export function createAuditService(db: Database) {
  const buildChecks = (projectId: string): CheckDefinition[] => [
    {
      id: 'security.no-embedded-secrets',
      category: 'Security',
      run: async () => {
        // Recherche réelle de motifs de secrets dans les fichiers du projet.
        const suspects = await db
          .select({ path: projectFiles.path })
          .from(projectFiles)
          .where(
            and(
              eq(projectFiles.projectId, projectId),
              eq(projectFiles.isDirectory, false),
              like(projectFiles.content, '%BEGIN %PRIVATE KEY%'),
            ),
          )
          .limit(1);
        if (suspects.length > 0) {
          return { status: 'FAIL', message: `Clé privée détectée dans ${suspects[0]?.path}` };
        }
        return { status: 'PASS', message: 'Aucun motif de clé privée dans les fichiers du projet.' };
      },
    },
    {
      id: 'configuration.project-identity',
      category: 'Configuration',
      run: async () => {
        const rows = await db
          .select({ id: brainEntries.id })
          .from(brainEntries)
          .where(and(eq(brainEntries.projectId, projectId), eq(brainEntries.kind, 'context')))
          .limit(1);
        if (rows.length === 0) {
          return {
            status: 'WARN',
            message: 'Aucune entrée « context » dans le Brain : le projet manque de cadrage.',
          };
        }
        return { status: 'PASS', message: 'Contexte projet présent dans le Brain.' };
      },
    },
    {
      id: 'configuration.file-structure',
      category: 'Configuration',
      run: async () => {
        const rows = await db
          .select({ id: projectFiles.id })
          .from(projectFiles)
          .where(eq(projectFiles.projectId, projectId))
          .limit(1);
        if (rows.length === 0) {
          return { status: 'WARN', message: 'Aucun fichier dans l’espace Forge du projet.' };
        }
        return { status: 'PASS', message: 'Espace de fichiers initialisé.' };
      },
    },
    {
      id: 'ux.brain-preferences',
      category: 'UX',
      run: async () => {
        const rows = await db
          .select({ id: brainEntries.id })
          .from(brainEntries)
          .where(and(eq(brainEntries.projectId, projectId), eq(brainEntries.kind, 'preference')))
          .limit(1);
        return rows.length > 0
          ? { status: 'PASS', message: 'Préférences produit documentées.' }
          : { status: 'NOT_TESTED', message: 'Aucune préférence enregistrée : contrôle non applicable.' };
      },
    },
    // Contrôles nécessitant une URL déployée : HONNÊTEMENT NOT_TESTED.
    {
      id: 'performance.core-web-vitals',
      category: 'Performance',
      run: async () => ({
        status: 'NOT_TESTED' as const,
        message: 'Requiert une URL déployée (Lighthouse) — aucune cible disponible.',
      }),
    },
    {
      id: 'seo.meta-essentials',
      category: 'SEO',
      run: async () => ({
        status: 'NOT_TESTED' as const,
        message: 'Requiert une page rendue à analyser — aucune URL déployée.',
      }),
    },
    {
      id: 'accessibility.wcag-scan',
      category: 'Accessibility',
      run: async () => ({
        status: 'NOT_TESTED' as const,
        message: 'Requiert un rendu navigateur (axe-core) — non disponible.',
      }),
    },
  ];

  return {
    /** Exécute un audit complet et l'historise. */
    async run(projectId: string, userId: string): Promise<AuditReport> {
      const checks: AuditCheck[] = [];
      for (const definition of buildChecks(projectId)) {
        let result: { status: AuditCheck['status']; message: string };
        try {
          result = await definition.run();
        } catch {
          // Un contrôle en échec technique n'est JAMAIS un PASS.
          result = { status: 'NOT_TESTED', message: 'Contrôle en erreur technique.' };
        }
        checks.push(
          auditCheckSchema.parse({
            id: definition.id,
            category: definition.category,
            status: result.status,
            message: result.message,
          }),
        );
      }

      const summary = {
        pass: checks.filter((c) => c.status === 'PASS').length,
        warn: checks.filter((c) => c.status === 'WARN').length,
        fail: checks.filter((c) => c.status === 'FAIL').length,
        notTested: checks.filter((c) => c.status === 'NOT_TESTED').length,
      };

      const [row] = await db
        .insert(projectAudits)
        .values({ projectId, summary, results: checks, createdBy: userId })
        .returning();
      if (!row) {
        throw new Error('Insertion audit impossible');
      }

      return auditReportSchema.parse({
        id: row.id,
        projectId: row.projectId,
        summary,
        results: checks,
        createdAt: row.createdAt.toISOString(),
      });
    },

    /** Historique des audits du projet. */
    async history(projectId: string): Promise<AuditReport[]> {
      const rows = await db
        .select()
        .from(projectAudits)
        .where(eq(projectAudits.projectId, projectId))
        .orderBy(desc(projectAudits.createdAt))
        .limit(20);
      return rows.map((row) =>
        auditReportSchema.parse({
          id: row.id,
          projectId: row.projectId,
          summary: row.summary,
          results: row.results,
          createdAt: row.createdAt.toISOString(),
        }),
      );
    },
  };
}

export type AuditService = ReturnType<typeof createAuditService>;
