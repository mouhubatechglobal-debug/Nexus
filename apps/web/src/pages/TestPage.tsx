import { useState } from 'react';
import { COVERAGE, TEST_SUITES, type TestSuite } from '../data/mock';
import { ProgressRing } from '../components/Charts';
import { Icon } from '../components/Icon';
import { Badge, Button, Card, DataTable, PageHeader, ProgressBar, StatCard, type BadgeTone, type Column } from '../components/ui';

const STATUS_TONE: Record<TestSuite['status'], BadgeTone> = {
  réussi: 'green',
  échec: 'red',
  partiel: 'amber',
};

export function TestPage() {
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState('il y a 3 h');

  const total = TEST_SUITES.reduce((sum, suite) => sum + suite.total, 0);
  const passed = TEST_SUITES.reduce((sum, suite) => sum + suite.passed, 0);
  const failed = total - passed;

  const runSuite = () => {
    setRunning(true);
    window.setTimeout(() => {
      setRunning(false);
      setLastRun('à l’instant');
    }, 1800);
  };

  const columns: Column<TestSuite>[] = [
    { key: 'name', header: 'Suite', render: (suite) => <span className="cell-strong">{suite.name}</span> },
    {
      key: 'status',
      header: 'Statut',
      render: (suite) => <Badge tone={STATUS_TONE[suite.status]}>{suite.status}</Badge>,
    },
    { key: 'score', header: 'Résultat', render: (suite) => <span className="mono">{suite.passed}/{suite.total}</span> },
    { key: 'duration', header: 'Durée', align: 'right' },
  ];

  return (
    <>
      <PageHeader
        title="Test"
        description="Qualité, couverture et suites automatisées."
        actions={
          <Button icon="play" onClick={runSuite} disabled={running}>
            {running ? 'Exécution…' : 'Relancer la suite'}
          </Button>
        }
      />

      <div className="stat-grid">
        <StatCard label="Tests au total" value={String(total)} icon="flask" tone="blue" hint={`dernière exécution : ${lastRun}`} />
        <StatCard label="Réussis" value={String(passed)} icon="check" tone="green" delta="+3" />
        <StatCard label="Échecs" value={String(failed)} icon="alert" tone={failed > 0 ? 'red' : 'green'} hint="2 suites à corriger" />
        <StatCard label="Durée médiane" value="1,7 s" icon="clock" tone="violet" delta="-0,3 s" />
      </div>

      <div className="split-2">
        <Card
          title="Suites de tests"
          subtitle={running ? 'Nouvelle exécution en cours…' : `Dernière exécution : ${lastRun}`}
          actions={<Badge tone={failed > 0 ? 'amber' : 'green'}>{failed > 0 ? `${failed} échec(s)` : 'Tout passe'}</Badge>}
        >
          <DataTable columns={columns} rows={TEST_SUITES} rowKey={(suite) => suite.name} caption="Suites de tests et leur statut" />
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <Card title="Couverture globale" subtitle="Lignes couvertes, tous modules">
            <div className="test-summary">
              <ProgressRing value={87} tone="violet" label="Couverture globale de 87 %" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minWidth: 0 }}>
                {COVERAGE.map((module) => (
                  <ProgressBar
                    key={module.module}
                    label={module.module}
                    value={module.value}
                    tone={module.value >= 90 ? 'green' : module.value >= 80 ? 'cyan' : 'amber'}
                    size="sm"
                  />
                ))}
              </div>
            </div>
          </Card>

          <Card title="Prochaines actions suggérées">
            <ul style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13, color: 'var(--text-2)' }}>
              <li style={{ display: 'flex', gap: 9 }}>
                <span style={{ color: 'var(--danger)', flexShrink: 0 }}>
                  <Icon name="alert" size={15} />
                </span>
                Corriger les 3 tests de <code>services/workers</code> (connexion Redis mockée).
              </li>
              <li style={{ display: 'flex', gap: 9 }}>
                <span style={{ color: 'var(--warning)', flexShrink: 0 }}>
                  <Icon name="alert" size={15} />
                </span>
                4 parcours e2e instables sur le flux de déploiement — à rejouer.
              </li>
              <li style={{ display: 'flex', gap: 9 }}>
                <span style={{ color: 'var(--cyan)', flexShrink: 0 }}>
                  <Icon name="zap" size={15} />
                </span>
                Objectif de couverture web : passer de 81 % à 85 % ce sprint.
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
