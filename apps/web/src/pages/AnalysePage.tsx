import { useCallback, useEffect, useState } from 'react';
import { ApiError, api, type AnalyticsEnvironment, type AnalyticsEvent, type AnalyticsMetrics } from '../lib/api';
import { useAuth } from '../lib/auth';
import { AreaChart, BarChart } from '../components/Charts';
import { Badge, Button, Card, DataTable, EmptyState, FilterChips, PageHeader, StatCard, type Column } from '../components/ui';

const ENV_LABEL: Record<AnalyticsEnvironment, string> = { demo: 'Démo', live: 'Live' };

/**
 * Analyse — connecté aux Analytics RÉELS (Prompt 20).
 * Les environnements DEMO et LIVE ne sont JAMAIS mélangés : un sélecteur
 * explicite pilote chaque requête et chaque métrique affichée.
 */
export function AnalysePage() {
  const { organization } = useAuth();
  const [environment, setEnvironment] = useState<AnalyticsEnvironment>('demo');
  const [range, setRange] = useState('7');
  const [metrics, setMetrics] = useState<AnalyticsMetrics | null>(null);
  const [events, setEvents] = useState<AnalyticsEvent[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const days = Number(range);

  const load = useCallback(async () => {
    if (!organization) return;
    try {
      setError(null);
      const [metricsResult, eventsResult] = await Promise.all([
        api.analyticsMetrics(organization.id, environment, days),
        api.analyticsEvents({ organizationId: organization.id, environment, page, limit: 10 }),
      ]);
      setMetrics(metricsResult);
      setEvents(eventsResult.data);
      setTotalPages(eventsResult.totalPages);
      setTotal(eventsResult.total);
    } catch (caught) {
      setMetrics(null);
      setEvents([]);
      setError(caught instanceof ApiError ? caught.message : 'Chargement des analytics impossible');
    }
  }, [organization, environment, days, page]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [environment, range]);

  const daily = metrics?.daily ?? [];
  const labels = daily.map((entry) => entry.day.slice(5).split('-').reverse().join('/'));
  const topTypes = (metrics?.byType ?? []).slice(0, 6).map((entry) => ({ label: entry.type, value: entry.count, hint: `${entry.count} événement${entry.count > 1 ? 's' : ''}` }));
  const average = daily.length > 0 ? Math.round((metrics?.totalEvents ?? 0) / daily.length) : 0;

  const columns: Column<AnalyticsEvent>[] = [
    { key: 'type', header: 'Type', render: (row) => <span className="cell-strong mono">{row.type}</span> },
    { key: 'environment', header: 'Environnement', render: (row) => <Badge tone={row.environment === 'live' ? 'green' : 'violet'}>{ENV_LABEL[row.environment]}</Badge> },
    { key: 'projectId', header: 'Projet', render: (row) => <span className="mono">{row.projectId ? row.projectId.slice(0, 8) : '—'}</span> },
    {
      key: 'metadata',
      header: 'Métadonnées',
      render: (row) => {
        const keys = Object.keys(row.metadata);
        return <span className="muted">{keys.length === 0 ? '—' : `${keys.length} clé${keys.length > 1 ? 's' : ''}`}</span>;
      },
    },
    { key: 'occurredAt', header: 'Date', align: 'right', render: (row) => new Date(row.occurredAt).toLocaleString('fr-FR') },
  ];

  return (
    <>
      <PageHeader
        title="Analyse"
        description="Signaux d'usage réels — les environnements démo et live ne sont jamais mélangés."
        actions={
          <FilterChips
            ariaLabel="Environnement analytics"
            value={environment}
            onChange={(value) => setEnvironment(value as AnalyticsEnvironment)}
            options={[
              { value: 'demo', label: 'Démo' },
              { value: 'live', label: 'Live' },
            ]}
          />
        }
      />

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="stat-grid">
        <StatCard
          label={`Événements · ${days} j`}
          value={String(metrics?.totalEvents ?? 0)}
          hint={`environnement ${ENV_LABEL[environment].toLowerCase()}`}
          icon="chart"
          tone="blue"
        />
        <StatCard label="Moyenne / jour" value={String(average)} hint="sur la période" icon="zap" tone="cyan" />
        <StatCard label="Types actifs" value={String(metrics?.byType.length ?? 0)} hint="types distincts" icon="layers" tone="violet" />
        <StatCard label="Événements listés" value={String(total)} hint="total pagination" icon="search-doc" tone="green" />
      </div>

      <Card
        title="Événements par jour"
        subtitle={`Analytics ${ENV_LABEL[environment]} — événements réels enregistrés`}
        actions={
          <FilterChips
            ariaLabel="Période du graphique"
            value={range}
            onChange={(value) => setRange(value === '30' ? '30' : '7')}
            options={[
              { value: '7', label: '7 j' },
              { value: '30', label: '30 j' },
            ]}
          />
        }
      >
        {daily.length === 0 ? (
          <EmptyState icon="chart" title="Aucune donnée analytics" hint="Aucun événement enregistré sur la période pour cet environnement." />
        ) : (
          <AreaChart data={daily.map((entry) => entry.count)} labels={labels} tone="blue" ariaLabel={`Événements analytics quotidiens sur ${days} jours (environnement ${ENV_LABEL[environment]})`} />
        )}
      </Card>

      <div className="split-2">
        <Card title="Répartition par type" subtitle="Top types d'événements">
          {topTypes.length === 0 ? (
            <EmptyState icon="layers" title="Aucun type" hint="Les événements enregistrés apparaîtront ici." />
          ) : (
            <BarChart items={topTypes} tone="violet" ariaLabel="Nombre d'événements par type" />
          )}
        </Card>

        <Card title="Derniers événements" subtitle={`Page ${page} / ${totalPages}`}>
          {events.length === 0 ? (
            <EmptyState icon="search-doc" title="Aucun événement" hint="Enregistrez des événements via l'API POST /v1/analytics/events." />
          ) : (
            <>
              <DataTable columns={columns} rows={events} rowKey={(row) => row.id} caption="Derniers événements analytics" />
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  Précédent
                </Button>
                <Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  Suivant
                </Button>
              </div>
            </>
          )}
        </Card>
      </div>
    </>
  );
}
