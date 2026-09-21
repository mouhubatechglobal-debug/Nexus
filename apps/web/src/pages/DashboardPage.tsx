import { useCallback, useEffect, useState } from 'react';
import { PIPELINE_STAGES } from '../data/mock';
import { AreaChart } from '../components/Charts';
import { Icon } from '../components/Icon';
import { Badge, Card, FilterChips, PageHeader, ProgressBar, StatCard } from '../components/ui';
import { Link } from '../router';
import { api, type AnalyticsEnvironment, type AnalyticsEvent, type AnalyticsMetrics, type Project } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useHealth } from '../lib/useHealth';

const ENV_LABEL: Record<AnalyticsEnvironment, string> = { demo: 'Démo', live: 'Live' };

/**
 * Dashboard — données réelles : projets (API), analytics (Prompt 20),
 * sonde de santé. Les environnements DEMO et LIVE ne sont jamais mélangés.
 */
export function DashboardPage() {
  const health = useHealth();
  const { organization } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [environment, setEnvironment] = useState<AnalyticsEnvironment>('demo');
  const [metrics, setMetrics] = useState<AnalyticsMetrics | null>(null);
  const [recent, setRecent] = useState<AnalyticsEvent[]>([]);

  const load = useCallback(async () => {
    if (!organization) return;
    try {
      const [page, metricsResult, eventsResult] = await Promise.all([
        api.projects(organization.id, { limit: 100 }),
        api.analyticsMetrics(organization.id, environment, 7),
        api.analyticsEvents({ organizationId: organization.id, environment, page: 1, limit: 5 }),
      ]);
      setProjects(page.data);
      setMetrics(metricsResult);
      setRecent(eventsResult.data);
    } catch {
      // Dashboard dégradé : les compteurs restent à zéro, aucun chiffre inventé.
      setProjects([]);
      setMetrics(null);
      setRecent([]);
    }
  }, [organization, environment]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeProjects = projects.filter((project) => project.status === 'active');
  const daily = metrics?.daily ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const eventsToday = daily.find((entry) => entry.day.slice(0, 10) === today)?.count ?? 0;
  const topTypes = (metrics?.byType ?? []).slice(0, 5);
  const maxType = Math.max(1, ...topTypes.map((entry) => entry.count));

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Vue d'ensemble de votre espace de création — signaux, projets et pipeline."
        actions={
          <>
            <Link to="/idea" className="btn btn-outline">
              <Icon name="bulb" size={16} />
              Nouvelle idée
            </Link>
            <Link to="/projects" className="btn btn-primary">
              <Icon name="plus" size={16} />
              Nouveau projet
            </Link>
          </>
        }
      />

      <div className="stat-grid">
        <StatCard
          label="Projets actifs"
          value={String(activeProjects.length)}
          hint={`${projects.length} projet${projects.length > 1 ? 's' : ''} au total`}
          icon="folder"
          tone="blue"
        />
        <StatCard
          label="Événements · 7 j"
          value={String(metrics?.totalEvents ?? 0)}
          hint={`analytics ${ENV_LABEL[environment].toLowerCase()}`}
          icon="chart"
          tone="cyan"
        />
        <StatCard
          label="Événements aujourd'hui"
          value={String(eventsToday)}
          hint={`environnement ${ENV_LABEL[environment].toLowerCase()}`}
          icon="zap"
          tone="violet"
        />
        <StatCard
          label="Types d'événements"
          value={String(metrics?.byType.length ?? 0)}
          hint="types distincts enregistrés"
          icon="layers"
          tone="green"
        />
      </div>

      <div className="dash-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <Card
            title="Pipeline de création"
            subtitle="Le flux Idea – Deploy de votre espace"
            actions={
              <Link to="/conception" className="see-all">
                Pipeline complet
                <Icon name="arrow-right" size={14} />
              </Link>
            }
          >
            <div className="pipeline">
              {PIPELINE_STAGES.map((stage) => (
                <Link key={stage.id} to={stage.path} className={`pipeline-stage tone-${stage.tone}`}>
                  <Icon name={stage.id === 'code' ? 'code' : stage.id === 'research' ? 'search-doc' : stage.id === 'conception' ? 'pen' : stage.id === 'test' ? 'flask' : stage.id === 'deploy' ? 'upload-cloud' : 'bulb'} size={16} />
                  <span>{stage.label}</span>
                  <span className="pipeline-count">{stage.count}</span>
                </Link>
              ))}
            </div>
          </Card>

          <Card
            title="Événements analytics — 7 derniers jours"
            subtitle={`Données réelles · environnement ${ENV_LABEL[environment]}`}
            actions={
              <FilterChips
                ariaLabel="Environnement analytics du dashboard"
                value={environment}
                onChange={(value) => setEnvironment(value as AnalyticsEnvironment)}
                options={[
                  { value: 'demo', label: 'Démo' },
                  { value: 'live', label: 'Live' },
                ]}
              />
            }
          >
            {daily.length === 0 ? (
              <p className="muted" style={{ fontSize: 13 }}>
                Aucun événement analytics sur la période — les données réelles apparaîtront ici dès le premier
                événement enregistré.
              </p>
            ) : (
              <AreaChart
                data={daily.map((entry) => entry.count)}
                labels={daily.map((entry) => entry.day.slice(5).split('-').reverse().join('/'))}
                tone="blue"
                ariaLabel={`Événements analytics quotidiens sur 7 jours, environnement ${ENV_LABEL[environment]}`}
              />
            )}
          </Card>

          <Card
            title="Projets en cours"
            subtitle={`${projects.length} projet${projects.length > 1 ? 's' : ''} — état réel`}
            actions={
              <Link to="/projects" className="see-all">
                Tout voir
                <Icon name="arrow-right" size={14} />
              </Link>
            }
          >
            {projects.length === 0 ? (
              <p className="muted" style={{ fontSize: 13 }}>
                Aucun projet — créez-en un depuis la page Projects.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {projects.slice(0, 4).map((project) => (
                  <p key={project.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, margin: 0, fontSize: 13.5 }}>
                    <span className="cell-strong">{project.name}</span>
                    <Badge tone={project.status === 'active' ? 'green' : project.status === 'draft' ? 'amber' : 'neutral'}>
                      {project.status === 'active' ? 'actif' : project.status === 'draft' ? 'brouillon' : 'archivé'}
                    </Badge>
                  </p>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <Card title="Activité récente" subtitle={`Événements ${ENV_LABEL[environment]} les plus récents`}>
            {recent.length === 0 ? (
              <p className="muted" style={{ fontSize: 13 }}>
                Aucun événement — l'activité réelle du projet s'affichera ici.
              </p>
            ) : (
              <ol className="timeline">
                {recent.map((event) => (
                  <li key={event.id} className="timeline-item">
                    <span className="timeline-icon">
                      <Icon name="zap" size={15} />
                    </span>
                    <span className="timeline-body">
                      <span className="timeline-title mono">{event.type}</span>
                      <p className="timeline-detail">
                        {event.projectId ? `Projet ${event.projectId.slice(0, 8)} · ` : ''}
                        {Object.keys(event.metadata).length} métadonnée(s)
                      </p>
                    </span>
                    <span className="timeline-time">{new Date(event.occurredAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <Card title="Événements par type" subtitle={`Top ${topTypes.length || '—'} · ${ENV_LABEL[environment]}`}>
            {topTypes.length === 0 ? (
              <p className="muted" style={{ fontSize: 13 }}>
                Aucune donnée — les types réels apparaîtront ici.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {topTypes.map((entry) => (
                  <ProgressBar
                    key={entry.type}
                    label={`${entry.type} (${entry.count})`}
                    value={Math.round((entry.count / maxType) * 100)}
                    tone={entry.type.startsWith('deploy') ? 'cyan' : entry.type.startsWith('pay') ? 'green' : 'blue'}
                    size="sm"
                  />
                ))}
              </div>
            )}
          </Card>

          <Card
            title="État des services"
            subtitle="Sonde temps réel de l'API"
            actions={
              <Link to="/settings" className="see-all">
                Settings
              </Link>
            }
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13.5 }}>
                <span className={`api-pill api-${health === 'up' ? 'ok' : health === 'unknown' ? 'wait' : 'down'}`}>
                  <span className="dot" aria-hidden="true" />
                  API {health === 'up' ? 'opérationnelle' : health === 'unknown' ? 'vérification…' : 'hors ligne'}
                </span>
              </p>
              <p className="muted" style={{ fontSize: 12.5 }}>
                PostgreSQL est réellement connecté (sonde <code>/api/health</code>). La file de jobs utilise le
                driver mémoire tant que Redis n'est pas configuré — voir <code>QUEUE_DRIVER</code>.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
