import { useCallback, useEffect, useState } from 'react';
import { SUGGESTIONS, type Suggestion } from '../data/mock';
import { ApiError, api, type AuditReport } from '../lib/api';
import { Icon } from '../components/Icon';
import { Badge, Button, Card, EmptyState, FilterChips, PageHeader, type BadgeTone } from '../components/ui';

const PRIORITY_TONE: Record<Suggestion['priority'], BadgeTone> = {
  haute: 'red',
  moyenne: 'amber',
  basse: 'neutral',
};

const CATEGORY_TONE: Record<Suggestion['category'], BadgeTone> = {
  performance: 'cyan',
  ux: 'blue',
  sécurité: 'violet',
  coût: 'green',
};

const STATUS_TONE: Record<AuditReport['results'][number]['status'], BadgeTone> = {
  PASS: 'green',
  WARN: 'amber',
  FAIL: 'red',
  NOT_TESTED: 'neutral',
};

/** Section NEXUS Doctor — audits réels du projet actif. */
function DoctorPanel() {
  const projectId = window.localStorage.getItem('nexus.activeProject');
  const [reports, setReports] = useState<AuditReport[] | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    try {
      setReports(await api.auditsList(projectId));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Chargement impossible');
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

  if (!projectId) {
    return (
      <Card title="NEXUS Doctor" subtitle="Audit structuré du projet">
        <EmptyState icon="flask" title="Aucun projet actif" hint="Ouvrez un projet depuis Projects pour lancer un audit." />
      </Card>
    );
  }

  const latest = reports?.[0] ?? null;

  return (
    <Card
      title="NEXUS Doctor"
      subtitle="Audit structuré — un contrôle non exécutable est NOT_TESTED, jamais PASS"
      actions={
        <Button size="sm" icon="flask" onClick={run} disabled={running}>
          {running ? 'Audit en cours…' : 'Lancer l’audit'}
        </Button>
      }
    >
      {error ? <p className="saved-note" style={{ color: 'var(--danger)' }} role="alert">{error}</p> : null}

      {!latest && !running ? (
        <EmptyState icon="flask" title="Aucun audit" hint="Lancez le premier audit Doctor de ce projet." />
      ) : null}

      {latest ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <p className="muted" style={{ fontSize: 12.5 }}>
            Dernier audit : {new Date(latest.createdAt).toLocaleString('fr-FR')} —{' '}
            <strong style={{ color: 'var(--text-1)' }}>{latest.summary.pass} PASS</strong>,{' '}
            {latest.summary.warn} WARN, {latest.summary.fail} FAIL,{' '}
            {latest.summary.notTested} NOT_TESTED
            {reports && reports.length > 1 ? ` · ${reports.length} audits dans l’historique` : ''}
          </p>
          <ul className="checks">
            {latest.results.map((check) => (
              <li key={check.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <Badge tone={STATUS_TONE[check.status]}>{check.status}</Badge>
                <span style={{ fontSize: 12.5, color: 'var(--text-2)', flex: 1, minWidth: 180 }}>{check.message}</span>
                <span className="muted mono" style={{ fontSize: 11 }}>{check.category}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}

export function AmeliorationPage() {
  const [category, setCategory] = useState('toutes');
  const [applied, setApplied] = useState<Set<string>>(new Set());

  const filtered = SUGGESTIONS.filter((suggestion) => category === 'toutes' || suggestion.category === category);

  const applyAll = () => {
    setApplied(new Set(filtered.map((suggestion) => suggestion.id)));
  };

  const toggle = (id: string) => {
    setApplied((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <>
      <PageHeader
        title="Amélioration"
        description="Audit Doctor en temps réel et recommandations — appliquez-les en un clic."
        actions={
          <Button icon="sparkles" onClick={applyAll} disabled={filtered.every((s) => applied.has(s.id))}>
            Tout appliquer
          </Button>
        }
      />

      <DoctorPanel />

      <FilterChips
        ariaLabel="Filtrer par catégorie"
        value={category}
        onChange={setCategory}
        options={[
          { value: 'toutes', label: 'Toutes', count: SUGGESTIONS.length },
          { value: 'performance', label: 'Performance' },
          { value: 'ux', label: 'UX' },
          { value: 'sécurité', label: 'Sécurité' },
          { value: 'coût', label: 'Coûts' },
        ]}
      />

      <div className="suggestion-list">
        {filtered.map((suggestion) => {
          const isApplied = applied.has(suggestion.id);
          return (
            <article key={suggestion.id} className={`suggestion-card prio-${suggestion.priority}`}>
              <div className="suggestion-top">
                <div style={{ minWidth: 0 }}>
                  <h2 className="suggestion-title">{suggestion.title}</h2>
                  <p className="suggestion-detail" style={{ marginTop: 3 }}>
                    {suggestion.detail}
                  </p>
                </div>
                <Badge tone={PRIORITY_TONE[suggestion.priority]}>{suggestion.priority}</Badge>
              </div>

              <div className="suggestion-foot">
                <Badge tone={CATEGORY_TONE[suggestion.category]}>{suggestion.category}</Badge>
                <Badge tone="neutral">gain : {suggestion.gain}</Badge>
                <Badge tone="neutral">effort : {suggestion.effort}</Badge>
                {isApplied ? (
                  <Button variant="ghost" size="sm" icon="check" onClick={() => toggle(suggestion.id)}>
                    Appliquée — annuler
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" icon="zap" onClick={() => toggle(suggestion.id)}>
                    Appliquer
                  </Button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      <p className="muted" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
        <Icon name="bulb" size={14} />
        Les recommandations sont recalculées après chaque analyse complète (toutes les 6 heures).
      </p>
    </>
  );
}
