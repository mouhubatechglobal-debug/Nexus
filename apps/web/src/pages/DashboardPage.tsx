import { ACTIVITY, PIPELINE_STAGES, PROJECTS, REQUESTS_14D, REQUEST_LABELS_14D } from '../data/mock';
import { AreaChart, ProgressRing } from '../components/Charts';
import { Icon } from '../components/Icon';
import { Card, PageHeader, ProgressBar, StatCard, Badge } from '../components/ui';
import { Link } from '../router';
import { useHealth } from '../lib/useHealth';

export function DashboardPage() {
  const health = useHealth();
  const activeProjects = PROJECTS.filter((p) => p.status === 'actif');

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
          delta="+2"
          hint="cette semaine"
          icon="folder"
          tone="blue"
          spark={[3, 4, 4, 5, 5, 6, 6]}
        />
        <StatCard
          label="Tâches IA aujourd'hui"
          value="147"
          delta="+18 %"
          hint="vs hier"
          icon="zap"
          tone="violet"
          spark={[80, 96, 90, 110, 122, 118, 147]}
        />
        <StatCard
          label="Couverture tests"
          value="87,4 %"
          delta="+1,2"
          hint="7 derniers jours"
          icon="flask"
          tone="cyan"
          spark={[82, 83, 84, 84, 85, 86, 87]}
        />
        <StatCard
          label="Déploiements · 24 h"
          value="6"
          delta="0"
          hint="aucun échec"
          icon="upload-cloud"
          tone="green"
          spark={[2, 3, 5, 4, 4, 5, 6]}
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
            title="Requêtes API — 14 derniers jours"
            subtitle="Milliers de requêtes par jour"
            actions={<Badge tone="green">+12 %</Badge>}
          >
            <AreaChart
              data={REQUESTS_14D}
              labels={REQUEST_LABELS_14D}
              tone="blue"
              unit=" k"
              ariaLabel="Évolution des requêtes API quotidiennes sur 14 jours, de 31 000 à 58 000"
            />
          </Card>

          <Card
            title="Projets en cours"
            subtitle={`${activeProjects.length} projets actifs`}
            actions={
              <Link to="/projects" className="see-all">
                Tout voir
                <Icon name="arrow-right" size={14} />
              </Link>
            }
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {PROJECTS.slice(0, 3).map((project) => (
                <ProgressBar
                  key={project.id}
                  label={`${project.name} — ${project.tasksDone}/${project.tasksTotal} tâches`}
                  value={project.progress}
                  tone={project.progress >= 70 ? 'green' : project.progress >= 40 ? 'blue' : 'violet'}
                />
              ))}
            </div>
          </Card>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <Card title="Activité récente">
            <ol className="timeline">
              {ACTIVITY.map((item) => (
                <li key={item.title} className="timeline-item">
                  <span className="timeline-icon">
                    <Icon name={item.icon} size={15} />
                  </span>
                  <span className="timeline-body">
                    <span className="timeline-title">{item.title}</span>
                    <p className="timeline-detail">{item.detail}</p>
                  </span>
                  <span className="timeline-time">{item.time}</span>
                </li>
              ))}
            </ol>
          </Card>

          <Card title="Santé du pipeline" subtitle="Moyenne glissante des validations">
            <div className="test-summary">
              <ProgressRing value={87} tone="violet" label="87 % de validations en première passe" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minWidth: 0 }}>
                <ProgressBar label="Builds verts" value={94} tone="green" size="sm" />
                <ProgressBar label="Revues dans les 24 h" value={78} tone="cyan" size="sm" />
                <ProgressBar label="Dette technique" value={22} tone="amber" size="sm" />
              </div>
            </div>
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
                PostgreSQL et Redis ne sont pas connectés à cette étape (Prompt 02 : interface uniquement). La
                sonde <code>/api/health</code> reflète l'état réel du backend.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
