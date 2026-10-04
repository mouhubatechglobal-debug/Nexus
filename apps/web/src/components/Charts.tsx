import { useId } from 'react';
import type { BadgeTone } from './ui';

/**
 * Graphiques SVG légers et déterministes (sans dépendance externe),
 * dimensionnés pour rester lisibles de 320 px à 1920 px.
 */

export function AreaChart({
  data,
  labels,
  tone = 'blue',
  height = 220,
  unit = '',
  ariaLabel,
}: {
  data: number[];
  labels: string[];
  tone?: BadgeTone;
  height?: number;
  unit?: string;
  ariaLabel: string;
}) {
  const gradientId = useId();
  const width = 640;
  const padTop = 12;
  const padBottom = 26;
  const usableH = height - padTop - padBottom;
  const max = Math.max(...data) * 1.15 || 1;
  const step = data.length > 1 ? width / (data.length - 1) : width;

  const y = (v: number) => padTop + (1 - v / max) * usableH;
  const line = data
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)} ${y(v).toFixed(1)}`)
    .join(' ');
  const area = `${line} L${width} ${(padTop + usableH).toFixed(1)} L0 ${(padTop + usableH).toFixed(1)} Z`;

  const gridLines = [0.25, 0.5, 0.75, 1].map((f) => padTop + f * usableH);
  const labelEvery = Math.max(1, Math.ceil(data.length / 6));

  return (
    <figure className="chart" role="img" aria-label={ariaLabel}>
      <svg viewBox={`0 0 ${width} ${height}`} className="chart-svg" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" className={`chart-fill-1 tone-${tone}`} />
            <stop offset="100%" className="chart-fill-2" />
          </linearGradient>
        </defs>
        {gridLines.map((gy) => (
          <line key={gy} x1="0" x2={width} y1={gy} y2={gy} className="chart-grid" />
        ))}
        <path d={area} fill={`url(#${gradientId})`} />
        <path d={line} fill="none" className={`chart-line tone-${tone}`} />
        {data.map((v, i) => (
          <circle key={i} cx={i * step} cy={y(v)} r="3" className={`chart-dot tone-${tone}`}>
            <title>{`${labels[i] ?? ''} — ${v.toLocaleString('fr-FR')}${unit}`}</title>
          </circle>
        ))}
      </svg>
      <figcaption className="chart-labels" aria-hidden="true">
        {data.map((_, i) =>
          i % labelEvery === 0 || i === data.length - 1 ? (
            <span key={i} className="chart-label mono">
              {labels[i]}
            </span>
          ) : null,
        )}
      </figcaption>
    </figure>
  );
}

export function BarChart({
  items,
  tone = 'cyan',
  ariaLabel,
}: {
  items: { label: string; value: number; hint: string }[];
  tone?: BadgeTone;
  ariaLabel: string;
}) {
  const max = Math.max(...items.map((i) => i.value)) || 1;
  return (
    <div className="bars" role="img" aria-label={ariaLabel}>
      {items.map((item) => (
        <div className="bar-item" key={item.label}>
          <span className="bar-value mono">{item.hint}</span>
          <div className="bar-track" aria-hidden="true">
            <div className={`bar-fill tone-${tone}`} style={{ height: `${Math.max(5, (item.value / max) * 100)}%` }} />
          </div>
          <span className="bar-label">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

export function ProgressRing({
  value,
  size = 96,
  stroke = 9,
  tone = 'violet',
  label,
}: {
  value: number;
  size?: number;
  stroke?: number;
  tone?: BadgeTone;
  label?: string;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(100, Math.max(0, value));
  const offset = circumference * (1 - clamped / 100);
  return (
    <div className="ring" role="img" aria-label={label ?? `Progression ${Math.round(clamped)} %`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} className="ring-track" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          className={`ring-fill tone-${tone}`}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference.toFixed(2)}
          strokeDashoffset={offset.toFixed(2)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="ring-value">
        {Math.round(clamped)}
        <small>%</small>
      </span>
    </div>
  );
}
