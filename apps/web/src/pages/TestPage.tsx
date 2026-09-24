import { useCallback, useEffect, useState } from 'react';
import { ApiError, api, type AuditReport } from '../lib/api';
import { ProgressRing } from '../components/Charts';
import { Badge, Button, Card, DataTable, EmptyState, PageHeader, StatCard, type BadgeTone, type Column } from '../components/ui';

const STATUS_TONE: Record<AuditReport['results'][number]['status'], BadgeTone> = {
  PASS: 'green',
  WARN: 'amber',
  FAIL: 'red',
  NOT_TESTED: 'neutral',
};

interface AuditRow {
  id: string;
  category: string;
  status: AuditReport['results'][number]['status'];
  message: string;
}

const COLUMNS: Column<AuditRow>[] = [
  { key: 'category', header: 'Catégorie', render: (row) => <span className="cell-strong">{row.category}</span> },
  { key: 'status', header: 'Statut', render: (row) => <Badge tone={STATUS_TONE[row.status]}>{row.status}</Badge> },
  { key: 'message', header: 'Détail' },
];

/**
 * Test — qualité du projet actif via NEXUS Doctor (RÉEL).
 * Les statuts viennent d'audits exécutés côté serveur : un contrôle non
 * exécutable est NOT_TESTED, jamais PASS. Les suites de tests du dépôt
 * (`npm test`) tournent en CI — elles ne sont jamais simulées ici.
 */
export function TestPage() {
  const projectId = window.localStorage.getItem('nexus.activeProject');
  const [reports, setReports] = useState<AuditReport[] | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    try {
      setError(null);
      setReports(await api.auditsList(projectId));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Chargement impossible');
      setReports([]);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async () => {
    if (!projectId) return;
    setRunning(true);
    setError(null);
    try {
      await api.auditsRun(projectId);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Audit impossible');
    } finally {
      setRunning(false);
    }
  };

  const latest = reports?.[0] ?? null;
  const executed = latest ? latest.summary.pass + latest.summary.warn + latest.summary.fail : 0;
  const passRatio = executed > 0 ? Math.round((latest!.summary.pass / executed) * 100) : 0;
  const rows: AuditRow[] = latest?.results.map((check) => ({ id: check.id, category: check.category, status: check.status, message: check.message })) ?? [];

  if (!projectId) {
    return (
      <>
        <PageHeader title="Test" description="Qualité du projet actif via NEXUS Doctor." />
        <Card>
          <EmptyState icon="flask" title="Aucun projet actif" hint="Ouvrez un projet depuis Projects pour lancer des audits réels." />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Test"
        description="Qualité du projet actif — audits Doctor réels, exécutés côté serveur."
        actions={
          <Button icon="flask" onClick={() => void run()} disabled={running}>
            {running ? 'Audit en cours…' : 'Lancer un audit'}
          </Button>
        }
      />

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="stat-grid">
        <StatCard label="Contrôles exécutés" value={String(executed)} icon="flask" tone="blue" hint={latest ? `audit du ${new Date(latest.createdAt).toLocaleDateString('fr-FR')}` : 'aucun audit'} />
        <StatCard label="PASS" value={String(latest?.summary.pass ?? 0)} icon="check" tone="green" hint="contrôles réussis" />
        <StatCard label="WARN / FAIL" value={`${latest?.summary.warn ?? 0} / ${latest?.summary.fail ?? 0}`} icon="alert" tone={(latest?.summary.fail ?? 0) > 0 ? 'red' : 'violet'} hint="à corriger" />
        <StatCard label="NOT_TESTED" value={String(latest?.summary.notTested ?? 0)} icon="clock" tone="cyan" hint="non exécutable — jamais compté comme PASS" />
      </div>

      <div className="split-2">
        <Card title="Dernier audit Doctor" subtitle={latest ? new Date(latest.createdAt).toLocaleString('fr-FR') : 'Aucun audit pour ce projet'}>
          {reports === null && !running ? (
            <EmptyState icon="clock" title="Chargement…" hint="Récupération des audits réels." />
          ) : rows.length === 0 ? (
            <EmptyState icon="flask" title="Aucun contrôle" hint="Lancez le premier audit Doctor de ce projet." />
          ) : (
            <DataTable columns={COLUMNS} rows={rows} rowKey={(row) => row.id} caption="Contrôles Doctor du projet actif" />
          )}
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <Card title="Réussite des contrôles exécutés" subtitle="PASS / contrôles réellement exécutés">
            <div className="test-summary">
              <ProgressRing value={passRatio} tone="violet" label={`${passRatio} % de contrôles exécutés en PASS`} />
              <p className="muted" style={{ fontSize: 12.5 }}>
                Calculé sur les {executed} contrôles exécutés uniquement — les {latest?.summary.notTested ?? 0} NOT_TESTED
                ne gonflent jamais le score.
              </p>
            </div>
          </Card>

          <Card title="Suites de tests du dépôt" subtitle="Exécution CI / locale — jamais simulée ici">
            <p className="muted" style={{ fontSize: 13 }}>
              Les suites automatisées (unitaires, intégration API, interface) s'exécutent avec{' '}
              <code>npm test</code> dans le dépôt et en CI — leurs résultats réels ne sont pas inventés dans cette
              interface. {reports && reports.length > 1 ? `${reports.length} audits Doctor conservés pour ce projet.` : ''}
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
