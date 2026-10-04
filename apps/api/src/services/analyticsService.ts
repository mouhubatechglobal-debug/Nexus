import { and, count, desc, eq, gte, sql } from 'drizzle-orm';
import {
  analyticsEventSchema,
  analyticsMetricsSchema,
  type AnalyticsEnvironment,
  type AnalyticsMetrics,
  type AnalyticsEvent,
  type RecordAnalyticsEventInput,
} from '@nexus/contracts';
import type { Database } from '@nexus/db';
import { analyticsEvents } from '@nexus/db';

/**
 * NEXUS Analytics — événements et métriques.
 * Règle absolue : DEMO et LIVE ne sont JAMAIS mélangés — l'environnement
 * est obligatoire à l'écriture comme à la lecture et filtre toutes les
 * requêtes (clause WHERE systématique).
 */
export function createAnalyticsService(db: Database) {
  return {
    async record(input: RecordAnalyticsEventInput): Promise<AnalyticsEvent> {
      const [row] = await db
        .insert(analyticsEvents)
        .values({
          organizationId: input.organizationId,
          projectId: input.projectId ?? null,
          type: input.type,
          environment: input.environment,
          metadata: input.metadata,
        })
        .returning();
      if (!row) throw new Error('Insertion événement impossible');
      return analyticsEventSchema.parse({
        id: row.id,
        organizationId: row.organizationId,
        projectId: row.projectId,
        type: row.type,
        environment: row.environment,
        metadata: row.metadata,
        occurredAt: row.occurredAt.toISOString(),
      });
    },

    /** Liste paginée — environnement obligatoire, jamais mixte. */
    async list(query: {
      organizationId: string;
      environment: AnalyticsEnvironment;
      projectId?: string;
      type?: string;
      page: number;
      limit: number;
    }): Promise<{ data: AnalyticsEvent[]; page: number; limit: number; total: number; totalPages: number }> {
      const conditions = [
        eq(analyticsEvents.organizationId, query.organizationId),
        eq(analyticsEvents.environment, query.environment),
      ];
      if (query.projectId) conditions.push(eq(analyticsEvents.projectId, query.projectId));
      if (query.type) conditions.push(eq(analyticsEvents.type, query.type));
      const where = and(...conditions);

      const [rows, totals] = await Promise.all([
        db
          .select()
          .from(analyticsEvents)
          .where(where)
          .orderBy(desc(analyticsEvents.occurredAt))
          .limit(query.limit)
          .offset((query.page - 1) * query.limit),
        db.select({ value: count() }).from(analyticsEvents).where(where),
      ]);

      const total = Number(totals[0]?.value ?? 0);
      return {
        data: rows.map((row) =>
          analyticsEventSchema.parse({
            id: row.id,
            organizationId: row.organizationId,
            projectId: row.projectId,
            type: row.type,
            environment: row.environment,
            metadata: row.metadata,
            occurredAt: row.occurredAt.toISOString(),
          }),
        ),
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.limit)),
      };
    },

    /** Métriques agrégées sur N jours (env obligatoire). */
    async metrics(organizationId: string, environment: AnalyticsEnvironment, days: number): Promise<AnalyticsMetrics> {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const where = and(
        eq(analyticsEvents.organizationId, organizationId),
        eq(analyticsEvents.environment, environment),
        gte(analyticsEvents.occurredAt, since),
      );

      const [byTypeRows, dailyRows, totals] = await Promise.all([
        db
          .select({ type: analyticsEvents.type, value: count() })
          .from(analyticsEvents)
          .where(where)
          .groupBy(analyticsEvents.type),
        db
          .select({
            day: sql<string>`to_char(date_trunc('day', ${analyticsEvents.occurredAt}), 'YYYY-MM-DD')`,
            value: count(),
          })
          .from(analyticsEvents)
          .where(where)
          .groupBy(sql`date_trunc('day', ${analyticsEvents.occurredAt})`)
          .orderBy(sql`date_trunc('day', ${analyticsEvents.occurredAt})`),
        db.select({ value: count() }).from(analyticsEvents).where(where),
      ]);

      return analyticsMetricsSchema.parse({
        environment,
        totalEvents: Number(totals[0]?.value ?? 0),
        byType: byTypeRows.map((row) => ({ type: row.type, count: Number(row.value) })),
        daily: dailyRows.map((row) => ({ day: row.day, count: Number(row.value) })),
      });
    },
  };
}

export type AnalyticsService = ReturnType<typeof createAnalyticsService>;
