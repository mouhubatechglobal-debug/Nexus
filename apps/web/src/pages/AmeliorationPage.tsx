import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, api, type AuditReport } from '../lib/api';
import { Badge, Button, Card, EmptyState, FilterChips, PageHeader, type BadgeTone } from '../components/ui';

const STATUS_TONE: Record<AuditReport['results'][number]['status'], BadgeTone> = {
  PASS: 'green',
  WARN: 'amber',
  FAIL: 'red',
  NOT_TESTED: 'neutral',
};

const PRIORITY_TONE: Record<AuditReport['results'][number]['status'], BadgeTone> = {
  FAIL: 'red',
  WARN: 'amber',
  NOT_TESTED: 'neutral',
  PASS: 'green',
};

const CATEGORIES = ['Performance', 'SEO', 'Accessibility', 'UX', 'Security', 'Configuration'] as const;

/**
 * Amélioration — recommandations RÉELLES dérivées du dernier audit Doctor
 * du projet actif. Aucun bouton « appliquer » fantaisiste : les constats
 * FAIL/WARN/NOT_TESTED sont les vrais résultats exécutés côté serveur.
 */
export function AmeliorationPage() {
  const projectId = window.localStorage.getItem('nexus.activeProject');
  const [reports, setReports] = useState<AuditReport[] | null>(null);
  const [category, setCategory] = useState('toutes');
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
  const improvements = useMemo(() => (latest?.results ?? []).filter((check) => check.status !== 'PASS'), [latest]);
  const filtered = improvements.filter((check) => category === 'toutes' || check.category === category);

  if (!projectId) {
    return (
      <>
        <PageHeader title="Amélioration" description="Recommandations dérivées des audits Doctor réels." />
        <Card>
          <EmptyState icon="flask" title="Aucun projet actif" hint="Ouvrez un projet depuis Projects pour lancer des audits." />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Amélioration"
        description="Recommandations issues du dernier audit Doctor — constats réels, non simulés."
        actions={
          <Button icon="flask" onClick={() => void run()} disabled={running}>
            {running ? 'Audit en cours…' : 'Relancer l’audit'}
          </Button>
        }
      />

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {latest ? (
        <p className="muted" style={{ fontSize: 12.5, marginTop: -6 }}>
          Dernier audit : {new Date(latest.createdAt).toLocaleString('fr-FR')} — {latest.summary.pass} PASS,{' '}
          {latest.summary.warn} WARN, {latest.summary.fail} FAIL, {latest.summary.notTested} NOT_TESTED.
        </p>
      ) : null}

      <FilterChips
        ariaLabel="Filtrer par catégorie"
        value={category}
        onChange={setCategory}
        options={[
          { value: 'toutes', label: 'Toutes', count: improvements.length },
          ...CATEGORIES.map((value) => ({
            value,
            label: value,
            count: improvements.filter((check) => check.category === value).length,
          })),
        ]}
      />

      <div className="suggestion-list">
        {reports === null && !running ? (
          <Card>
            <EmptyState icon="clock" title="Chargement…" hint="Récupération du dernier audit réel." />
          </Card>
        ) : filtered.length === 0 ? (
          <Card>
            <EmptyState
              icon="check"
              title={improvements.length === 0 ? 'Aucune amélioration en attente' : 'Aucun constat dans cette catégorie'}
              hint={improvements.length === 0 ? 'Tous les contrôles exécutés sont PASS — relancez un audit après vos changements.' : 'Choisissez une autre catégorie.'}
            />
          </Card>
        ) : (
          filtered.map((check) => (
            <article key={check.id} className={`suggestion-card prio-${check.status === 'FAIL' ? 'haute' : check.status === 'WARN' ? 'moyenne' : 'basse'}`}>
              <div className="suggestion-top">
                <div style={{ minWidth: 0 }}>
                  <h2 className="suggestion-title">{check.message}</h2>
                  <p className="suggestion-detail" style={{ marginTop: 3 }}>
                    Catégorie Doctor : {check.category}
                  </p>
                </div>
                <Badge tone={PRIORITY_TONE[check.status]}>{check.status === 'FAIL' ? 'priorité haute' : check.status === 'WARN' ? 'priorité moyenne' : 'à outiller'}</Badge>
              </div>
              <div className="suggestion-foot">
                <Badge tone={STATUS_TONE[check.status]}>{check.status}</Badge>
                <Badge tone="neutral">{check.category}</Badge>
              </div>
            </article>
          ))
        )}
      </div>

      {reports && reports.length > 1 ? (
        <p className="muted" style={{ fontSize: 12.5 }}>
          {reports.length} audits conservés pour ce projet — les recommandations suivent toujours le plus récent.
        </p>
      ) : null}
    </>
  );
}
