import { useState } from 'react';
import { ERROR_BREAKDOWN, LATENCY_MODULES, REQUESTS_14D, REQUEST_LABELS_14D } from '../data/mock';
import { AreaChart, BarChart } from '../components/Charts';
import { Card, FilterChips, PageHeader, ProgressBar, StatCard } from '../components/ui';

export function AnalysePage() {
  const [range, setRange] = useState('14j');
  const days = range === '7j' ? 7 : 14;

  const data = REQUESTS_14D.slice(-days);
  const labels = REQUEST_LABELS_14D.slice(-days);

  return (
    <>
      <PageHeader title="Analyse" description="Signaux d'usage et performance." />

      <div className="stat-grid">
        <StatCard label="Requêtes · 24 h" value="58,2 k" delta="+12 %" hint="vs la veille" icon="zap" tone="blue" />
        <StatCard label="Latence p95" value="182 ms" delta="-8 %" hint="objectif : 250 ms max" icon="clock" tone="cyan" />
        <StatCard label="Taux d'erreur" value="0,42 %" delta="+0,05" hint="1 incident mineur" icon="alert" tone="violet" />
        <StatCard label="Utilisateurs actifs" value="1 284" delta="+6 %" hint="7 derniers jours" icon="chart" tone="green" />
      </div>

      <Card
        title="Requêtes API"
        subtitle="Milliers de requêtes par jour"
        actions={
          <FilterChips
            ariaLabel="Période du graphique"
            value={range}
            onChange={setRange}
            options={[
              { value: '7j', label: '7 j' },
              { value: '14j', label: '14 j' },
            ]}
          />
        }
      >
        <AreaChart
          data={data}
          labels={labels}
          tone="blue"
          unit=" k"
          ariaLabel={`Requêtes API quotidiennes sur ${days} jours`}
        />
      </Card>

      <div className="split-2">
        <Card title="Latence par module" subtitle="p95 en millisecondes">
          <BarChart
            items={LATENCY_MODULES}
            tone="cyan"
            ariaLabel="Latence p95 par module : api 120 ms, workers 210 ms, postgres 45 ms, redis 8 ms, ia 340 ms"
          />
        </Card>

        <Card title="Répartition des erreurs" subtitle="Part de chaque cause sur 24 h">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {ERROR_BREAKDOWN.map((item) => (
              <ProgressBar
                key={item.label}
                label={item.label}
                value={item.value}
                tone={item.label === 'Timeouts' ? 'red' : item.label === 'Validation' ? 'amber' : 'blue'}
                size="sm"
              />
            ))}
            <p className="muted" style={{ fontSize: 12.5 }}>
              Les timeouts concernent surtout le module IA en heure de pointe — voir les recommandations
              de la page <strong>Amélioration</strong>.
            </p>
          </div>
        </Card>
      </div>
    </>
  );
}
