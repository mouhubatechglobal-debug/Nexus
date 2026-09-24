import { useCallback, useEffect, useState } from 'react';
import { ApiError, api, type Deployment, type DeploymentStage, type Project } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Icon } from '../components/Icon';
import {
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  PageHeader,
  SelectField,
  StatCard,
  type BadgeTone,
  type Column,
} from '../components/ui';

const STATUS_TONE: Record<Deployment['status'], BadgeTone> = {
  pending: 'amber',
  running: 'cyan',
  success: 'green',
  failed: 'red',
  cancelled: 'neutral',
};

const STATUS_LABEL: Record<Deployment['status'], string> = {
  pending: 'en attente',
  running: 'en cours',
  success: 'succès',
  failed: 'échec',
  cancelled: 'annulé',
};

const STAGE_LABEL: Record<DeploymentStage['name'], string> = {
  build: 'Build',
  test: 'Tests',
  security: 'Sécurité',
  staging: 'Staging',
  production: 'Production',
};

const STAGE_ORDER: DeploymentStage['name'][] = ['build', 'test', 'security', 'staging', 'production'];

function stageIcon(status: Deployment['status']): 'check' | 'zap' | 'clock' | 'alert' | 'close' {
  if (status === 'success') return 'check';
  if (status === 'running') return 'zap';
  if (status === 'failed') return 'alert';
  if (status === 'cancelled') return 'close';
  return 'clock';
}

/**
 * Deploy — connecté au pipeline RÉEL (Prompt 19).
 * Staging : pipeline complet automatique (build → test → security → staging).
 * Production : JAMAIS automatique — création en attente puis promotion
 * par une action explicite (confirm), réservée aux admins.
 */
export function DeployPage() {
  const { organization } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<string | null>(() => window.localStorage.getItem('nexus.activeProject'));
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadProjects = useCallback(async () => {
    if (!organization) return;
    try {
      const page = await api.projects(organization.id, { limit: 100 });
      setProjects(page.data);
      setProjectId((current) =>
        current && page.data.some((p) => p.id === current) ? current : (page.data[0]?.id ?? null),
      );
    } catch {
      setProjects([]);
    }
  }, [organization]);

  const loadDeployments = useCallback(async (id: string) => {
    try {
      setError(null);
      setDeployments(await api.deploymentsList(id));
    } catch (caught) {
      setDeployments([]);
      setError(caught instanceof ApiError ? caught.message : 'Chargement des déploiements impossible');
    }
  }, []);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    if (projectId) void loadDeployments(projectId);
    else setDeployments([]);
  }, [projectId, loadDeployments]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Action impossible');
    } finally {
      setBusy(false);
    }
  };

  const createDeployment = (environment: 'staging' | 'production') =>
    run(async () => {
      if (!projectId) return;
      const deployment = await api.deploymentCreate(projectId, environment);
      await loadDeployments(projectId);
      setNotice(
        environment === 'staging'
          ? 'Pipeline staging exécuté.'
          : 'Déploiement de production créé en attente — la mise en production exige une confirmation explicite.',
      );
      void deployment;
    });

  const promote = (deployment: Deployment) =>
    run(async () => {
      if (!projectId) return;
      await api.deploymentPromote(projectId, deployment.id);
      await loadDeployments(projectId);
      setNotice('Mise en production confirmée — pipeline exécuté.');
    });

  const cancel = (deployment: Deployment) =>
    run(async () => {
      if (!projectId) return;
      await api.deploymentCancel(projectId, deployment.id);
      await loadDeployments(projectId);
      setNotice('Déploiement annulé.');
    });

  const latest = deployments[0] ?? null;
  const pendingProduction = deployments.find((d) => d.environment === 'production' && d.status === 'pending') ?? null;
  const succeeded = deployments.filter((d) => d.status === 'success').length;
  const failed = deployments.filter((d) => d.status === 'failed').length;

  const columns: Column<Deployment>[] = [
    { key: 'environment', header: 'Environnement', render: (row) => <span className="cell-strong">{row.environment === 'production' ? 'Production' : 'Staging'}</span> },
    { key: 'status', header: 'Statut', render: (row) => <Badge tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</Badge> },
    {
      key: 'stages',
      header: 'Étapes réussies',
      render: (row) => (
        <span className="mono">
          {row.stages.filter((s) => s.status === 'success').length}/{row.stages.length}
        </span>
      ),
    },
    {
      key: 'confirmedAt',
      header: 'Confirmé production',
      render: (row) =>
        row.environment === 'production' ? (
          row.confirmedAt ? (
            <Badge tone="green">oui</Badge>
          ) : (
            <Badge tone="amber">non</Badge>
          )
        ) : (
          <span className="muted">—</span>
        ),
    },
    { key: 'createdAt', header: 'Date', align: 'right', render: (row) => new Date(row.createdAt).toLocaleString('fr-FR') },
  ];

  return (
    <>
      <PageHeader
        title="Deploy"
        description="Pipeline de livraison réel — la production n'est jamais automatique."
        actions={
          projectId ? (
            <>
              <Button variant="outline" icon="branch" disabled={busy} onClick={() => void createDeployment('production')}>
                Déployer en production
              </Button>
              <Button icon="upload-cloud" disabled={busy} onClick={() => void createDeployment('staging')}>
                Déployer en staging
              </Button>
            </>
          ) : undefined
        }
      />

      {projects.length === 0 ? (
        <Card>
          <EmptyState icon="upload-cloud" title="Aucun projet" hint="Créez un projet depuis la page Projects pour déployer." />
        </Card>
      ) : (
        <>
          <div className="list-toolbar">
            <div style={{ minWidth: 240 }}>
              <SelectField
                id="deploy-project"
                ariaLabel="Projet à déployer"
                value={projectId ?? ''}
                onChange={(value) => {
                  setProjectId(value);
                  window.localStorage.setItem('nexus.activeProject', value);
                }}
                options={projects.map((project) => ({ value: project.id, label: project.name }))}
              />
            </div>
          </div>

          {(error || notice) && (
            <p className={error ? 'form-error' : 'saved-note'} role={error ? 'alert' : 'status'}>
              {error ?? notice}
            </p>
          )}

          <div className="env-grid">
            <Card className="env-card">
              <div className="env-top">
                <h2 className="env-name">Dernier pipeline</h2>
                {latest ? <Badge tone={STATUS_TONE[latest.status]}>{STATUS_LABEL[latest.status]}</Badge> : <Badge tone="neutral">aucun</Badge>}
              </div>
              <div className="env-meta">
                <span>{latest ? (latest.environment === 'production' ? 'Production' : 'Staging') : 'Aucun déploiement encore'}</span>
                <span>{latest ? new Date(latest.createdAt).toLocaleString('fr-FR') : 'Lancez un déploiement staging'}</span>
                <span>Production = action explicite obligatoire</span>
              </div>
              {pendingProduction ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button size="sm" icon="check" disabled={busy} onClick={() => void promote(pendingProduction)}>
                    Confirmer la mise en production
                  </Button>
                  <Button variant="ghost" size="sm" icon="close" disabled={busy} onClick={() => void cancel(pendingProduction)}>
                    Annuler
                  </Button>
                </div>
              ) : (
                <Button variant="outline" size="sm" icon="clock" disabled>
                  {latest?.status === 'running' ? 'Pipeline en cours…' : 'Aucune action requise'}
                </Button>
              )}
            </Card>

            <Card className="env-card">
              <div className="env-top">
                <h2 className="env-name">Historique</h2>
                <Badge tone="blue">{deployments.length} déploiement{deployments.length > 1 ? 's' : ''}</Badge>
              </div>
              <div className="env-meta">
                <span>{succeeded} succès</span>
                <span>{failed} échec{failed > 1 ? 's' : ''}</span>
                <span>Étapes : build → test → security → staging → production</span>
              </div>
            </Card>
          </div>

          {latest ? (
            <Card title="Pipeline" subtitle={`${latest.environment === 'production' ? 'Production' : 'Staging'} — ${STATUS_LABEL[latest.status]}`}>
              <div className="steps">
                {STAGE_ORDER.map((name) => {
                  const stage = latest.stages.find((s) => s.name === name);
                  if (!stage) return null;
                  return (
                    <div
                      key={name}
                      className={`step${stage.status === 'success' ? ' step-done' : stage.status === 'running' ? ' step-current' : ''}`}
                      title={stage.error ?? stage.logs.slice(-1)[0]?.message ?? STAGE_LABEL[name]}
                    >
                      <Icon name={stageIcon(stage.status)} size={15} />
                      <span>{STAGE_LABEL[name]}</span>
                    </div>
                  );
                })}
              </div>
              {latest.status === 'failed' && (
                <p className="form-error" role="alert">
                  {latest.stages.find((s) => s.error)?.error ?? 'Pipeline en échec.'}
                </p>
              )}
            </Card>
          ) : null}

          <Card title="Historique des déploiements" subtitle="Déploiements réels du projet sélectionné">
            {deployments.length === 0 ? (
              <EmptyState icon="clock" title="Aucun déploiement" hint="Lancez un premier déploiement staging." />
            ) : (
              <DataTable columns={columns} rows={deployments.slice(0, 10)} rowKey={(row) => row.id} caption="Historique des déploiements" />
            )}
          </Card>

          <div className="stat-grid">
            <StatCard label="Déploiements" value={String(deployments.length)} icon="upload-cloud" tone="blue" hint="toutes environnements" />
            <StatCard label="Succès" value={String(succeeded)} icon="check" tone="green" hint="pipelines terminés" />
            <StatCard label="Échecs" value={String(failed)} icon="alert" tone="red" hint="dont sécurité" />
          </div>
        </>
      )}
    </>
  );
}
