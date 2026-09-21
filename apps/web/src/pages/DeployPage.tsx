import { useState } from 'react';
import { DEPLOYMENTS, type Deployment } from '../data/mock';
import { Icon } from '../components/Icon';
import { Badge, Button, Card, DataTable, PageHeader, StatCard, type BadgeTone, type Column } from '../components/ui';

const STATUS_TONE: Record<Deployment['status'], BadgeTone> = {
  succès: 'green',
  'en cours': 'cyan',
  échec: 'red',
};

const PIPELINE = [
  { label: 'Commit', state: 'done' },
  { label: 'Build', state: 'done' },
  { label: 'Tests', state: 'done' },
  { label: 'Artefacts', state: 'current' },
  { label: 'Release', state: 'todo' },
] as const;

export function DeployPage() {
  const [stagingOk, setStagingOk] = useState(false);

  const rows = DEPLOYMENTS.map((d) =>
    d.env === 'staging' && d.status === 'en cours' && stagingOk ? { ...d, status: 'succès' as const } : d,
  );

  const columns: Column<Deployment>[] = [
    { key: 'version', header: 'Version', render: (row) => <span className="cell-strong mono">{row.version}</span> },
    { key: 'env', header: 'Environnement' },
    { key: 'status', header: 'Statut', render: (row) => <Badge tone={STATUS_TONE[row.status]}>{row.status}</Badge> },
    { key: 'commit', header: 'Commit', render: (row) => <span className="mono">{row.commit}</span> },
    { key: 'date', header: 'Date', align: 'right' },
  ];

  return (
    <>
      <PageHeader
        title="Deploy"
        description="Livraison continue entre environnements."
        actions={
          <Button icon="upload-cloud" onClick={() => setStagingOk(true)} disabled={stagingOk}>
            {stagingOk ? 'Staging à jour' : 'Déployer en staging'}
          </Button>
        }
      />

      <div className="env-grid">
        <Card className="env-card">
          <div className="env-top">
            <h2 className="env-name">Production</h2>
            <Badge tone="green">succès</Badge>
          </div>
          <div className="env-meta">
            <span className="mono">v1.8.2 · 9f1c2ab</span>
            <span>Dernier déploiement : aujourd’hui, 09:12</span>
            <span>Disponibilité 30 j : 99,98 %</span>
          </div>
          <Button variant="outline" size="sm" icon="branch">
            Redéployer
          </Button>
        </Card>

        <Card className="env-card">
          <div className="env-top">
            <h2 className="env-name">Staging</h2>
            <Badge tone={stagingOk ? 'green' : 'cyan'}>{stagingOk ? 'succès' : 'en cours'}</Badge>
          </div>
          <div className="env-meta">
            <span className="mono">v1.9.0-rc.3 · c47e8d1</span>
            <span>{stagingOk ? 'Déploiement terminé' : 'Artefacts en préparation…'}</span>
            <span>Canary : 25 % du trafic</span>
          </div>
          <Button variant="outline" size="sm" icon="clock" disabled>
            Suivre (bientôt)
          </Button>
        </Card>

        <Card className="env-card">
          <div className="env-top">
            <h2 className="env-name">Développement</h2>
            <Badge tone="neutral">local</Badge>
          </div>
          <div className="env-meta">
            <span className="mono">v0.2.0-dev · sandbox</span>
            <span>Rechargement à chaud actif</span>
            <span>Aucun coût d’infrastructure</span>
          </div>
          <Button variant="ghost" size="sm" icon="play">
            Voir les logs
          </Button>
        </Card>
      </div>

      <Card title="Pipeline en cours" subtitle="v1.9.0-rc.3 – staging">
        <div className="steps">
          {PIPELINE.map((step) => (
            <div
              key={step.label}
              className={`step${step.state === 'done' ? ' step-done' : step.state === 'current' ? ' step-current' : ''}`}
            >
              <Icon name={step.state === 'done' ? 'check' : step.state === 'current' ? 'zap' : 'clock'} size={15} />
              <span>{step.label}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Historique des déploiements" subtitle="5 dernières livraisons">
        <DataTable columns={columns} rows={rows} rowKey={(row) => `${row.version}-${row.commit}`} caption="Historique des déploiements" />
      </Card>

      <div className="stat-grid">
        <StatCard label="Lead time" value="2 h 14" delta="-18 %" icon="clock" tone="cyan" hint="commit – production" />
        <StatCard label="Fréquence" value="12 / sem." delta="+2" icon="upload-cloud" tone="blue" />
        <StatCard label="Taux de rollback" value="4,2 %" delta="-1,1" icon="branch" tone="violet" />
      </div>
    </>
  );
}
