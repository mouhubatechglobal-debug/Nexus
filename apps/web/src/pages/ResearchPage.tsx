import { useMemo, useState } from 'react';
import { RESEARCH, SYNTHESIS, type ResearchSource } from '../data/mock';
import { Icon } from '../components/Icon';
import { Badge, Button, Card, FilterChips, PageHeader, ProgressBar, SearchInput, StatCard } from '../components/ui';

const TOPIC_TONE: Record<ResearchSource['topic'], 'blue' | 'violet' | 'cyan'> = {
  marché: 'blue',
  technique: 'cyan',
  concurrence: 'violet',
};

export function ResearchPage() {
  const [query, setQuery] = useState('');
  const [topic, setTopic] = useState('tous');
  const [synthesis, setSynthesis] = useState(SYNTHESIS);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return RESEARCH.filter((source) => {
      const matchTopic = topic === 'tous' || source.topic === topic;
      const matchQuery = q === '' || source.title.toLowerCase().includes(q) || source.source.toLowerCase().includes(q);
      return matchTopic && matchQuery;
    }).sort((a, b) => b.relevance - a.relevance);
  }, [query, topic]);

  const regenerate = () => {
    setSynthesis((previous) => {
      if (previous.length === 0) return previous;
      return [previous[previous.length - 1]!, ...previous.slice(0, -1)];
    });
  };

  return (
    <>
      <PageHeader
        title="Research"
        description="Veille et synthèses assistées par IA."
        actions={
          <Button variant="outline" icon="search-doc">
            Lancer une veille
          </Button>
        }
      />

      <div className="stat-grid">
        <StatCard label="Sources analysées" value="128" delta="+9" hint="7 derniers jours" icon="search-doc" tone="cyan" />
        <StatCard label="Rapports générés" value="9" delta="+2" hint="ce mois-ci" icon="file" tone="blue" />
        <StatCard label="Tendances détectées" value="14" hint="dont 3 critiques" icon="chart" tone="violet" />
      </div>

      <div className="list-toolbar">
        <SearchInput value={query} onChange={setQuery} label="Rechercher une source" placeholder="Titre ou source…" />
        <FilterChips
          ariaLabel="Filtrer par sujet"
          value={topic}
          onChange={setTopic}
          options={[
            { value: 'tous', label: 'Tous' },
            { value: 'marché', label: 'Marché' },
            { value: 'technique', label: 'Technique' },
            { value: 'concurrence', label: 'Concurrence' },
          ]}
        />
      </div>

      <div className="split-2">
        <Card title="Sources détectées" subtitle="Triées par pertinence">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {filtered.map((source) => (
              <article key={source.id} style={{ display: 'flex', flexDirection: 'column', gap: 7, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 600 }}>{source.title}</h3>
                    <p className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                      {source.source} · {source.date}
                    </p>
                  </div>
                  <Badge tone={TOPIC_TONE[source.topic]}>{source.topic}</Badge>
                </div>
                <ProgressBar value={source.relevance} label="Pertinence" tone={source.relevance >= 85 ? 'cyan' : 'blue'} size="sm" />
              </article>
            ))}
            {filtered.length === 0 ? (
              <p className="muted" style={{ padding: '12px 0' }}>
                Aucune source ne correspond à cette recherche.
              </p>
            ) : null}
          </div>
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <Card
            title="Synthèse de l'assistant"
            subtitle="Générée à partir des sources les plus pertinentes"
            actions={
              <Button variant="ghost" size="sm" icon="sparkles" onClick={regenerate}>
                Régénérer
              </Button>
            }
          >
            <ul style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {synthesis.map((point) => (
                <li key={point} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ color: 'var(--cyan)', flexShrink: 0, marginTop: 2 }}>
                    <Icon name="zap" size={14} />
                  </span>
                  <span style={{ fontSize: 13, color: 'var(--text-2)', overflowWrap: 'anywhere' }}>{point}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Prochaine session" subtitle="Planification suggérée">
            <p style={{ fontSize: 13, color: 'var(--text-2)' }}>
              D'après le rythme actuel, la prochaine veille complète est recommandée{' '}
              <strong style={{ color: 'var(--text-1)' }}>mardi prochain</strong>, en ciblant les signaux
              « concurrence » restés sous le seuil de pertinence 70 %.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
