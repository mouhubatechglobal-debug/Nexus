import { useMemo, useState } from 'react';
import { SUGGESTIONS, type Suggestion } from '../data/mock';
import { Icon } from '../components/Icon';
import { Badge, Button, Card, EmptyState, FilterChips, PageHeader, StatCard, type BadgeTone } from '../components/ui';

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

export function AmeliorationPage() {
  const [category, setCategory] = useState('toutes');
  const [applied, setApplied] = useState<Set<string>>(new Set());

  const filtered = useMemo(
    () => SUGGESTIONS.filter((suggestion) => category === 'toutes' || suggestion.category === category),
    [category],
  );

  const apply = (id: string) => {
    setApplied((previous) => new Set(previous).add(id));
  };

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
        description="Recommandations générées par Nexus — appliquez-les en un clic."
        actions={
          <Button icon="sparkles" onClick={applyAll} disabled={filtered.every((s) => applied.has(s.id))}>
            Tout appliquer
          </Button>
        }
      />

      <div className="stat-grid">
        <StatCard
          label="Recommandations"
          value={String(SUGGESTIONS.length)}
          icon="sparkles"
          tone="violet"
          hint={`${applied.size} appliquée${applied.size > 1 ? 's' : ''}`}
        />
        <StatCard label="Gain cumulé estimé" value="+31 %" icon="chart" tone="cyan" hint="performance & coûts" />
        <StatCard label="Effort prioritaire" value="faible" icon="zap" tone="green" hint="3 actions < 1 journée" />
      </div>

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

      {filtered.length === 0 ? (
        <Card>
          <EmptyState icon="sparkles" title="Aucune recommandation dans cette catégorie" />
        </Card>
      ) : (
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
                    <Button variant="outline" size="sm" icon="zap" onClick={() => apply(suggestion.id)}>
                      Appliquer
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <p className="muted" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
        <Icon name="bulb" size={14} />
        Les recommandations sont recalculées après chaque analyse complète (toutes les 6 heures).
      </p>
    </>
  );
}
