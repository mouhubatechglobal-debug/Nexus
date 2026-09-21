import { useState } from 'react';
import type { ButtonHTMLAttributes, ChangeEvent, ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { useHealth } from '../lib/useHealth';

/* ------------------------------------------------------------------ */
/* Boutons                                                             */
/* ------------------------------------------------------------------ */

export type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'danger';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  icon?: IconName;
  children?: ReactNode;
}

export function Button({ variant = 'primary', size = 'md', icon, children, className, type, ...rest }: ButtonProps) {
  const classes = ['btn', `btn-${variant}`, size === 'sm' ? 'btn-sm' : '', className ?? '']
    .filter(Boolean)
    .join(' ');
  return (
    <button type={type ?? 'button'} className={classes} {...rest}>
      {icon ? <Icon name={icon} size={size === 'sm' ? 14 : 16} /> : null}
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Badges, tags, avatars                                               */
/* ------------------------------------------------------------------ */

export type BadgeTone = 'blue' | 'violet' | 'cyan' | 'green' | 'amber' | 'red' | 'neutral';

export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Tag({ children }: { children: ReactNode }) {
  return <span className="tag">{children}</span>;
}

export function Avatar({ initials, size = 'md' }: { initials: string; size?: 'sm' | 'md' }) {
  return (
    <span className={size === 'sm' ? 'avatar avatar-sm' : 'avatar'} aria-hidden="true">
      {initials}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Cartes & sections                                                   */
/* ------------------------------------------------------------------ */

export interface CardProps {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Card({ title, subtitle, actions, children, className }: CardProps) {
  return (
    <section className={`card${className ? ` ${className}` : ''}`}>
      {title || actions ? (
        <header className="card-head">
          <div className="card-head-text">
            {title ? <h2 className="card-title">{title}</h2> : null}
            {subtitle ? <p className="card-subtitle">{subtitle}</p> : null}
          </div>
          {actions ? <div className="card-actions">{actions}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <header className="page-head">
      <div className="page-head-text">
        <h1 className="page-title">{title}</h1>
        {description ? <p className="page-desc">{description}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Indicateurs                                                         */
/* ------------------------------------------------------------------ */

export function StatCard({
  label,
  value,
  delta,
  hint,
  icon,
  tone = 'blue',
  spark,
}: {
  label: string;
  value: string;
  delta?: string;
  hint?: string;
  icon?: IconName;
  tone?: BadgeTone;
  spark?: number[];
}) {
  const positive = delta ? !delta.trim().startsWith('-') : true;
  return (
    <article className="card stat-card">
      <div className="stat-top">
        <span className={`stat-icon tone-${tone}`}>
          {icon ? <Icon name={icon} size={16} /> : null}
        </span>
        <span className="stat-label">{label}</span>
        {delta ? <span className={`delta ${positive ? 'delta-up' : 'delta-down'}`}>{delta}</span> : null}
      </div>
      <p className="stat-value">{value}</p>
      <div className="stat-foot">
        {hint ? <span className="stat-hint">{hint}</span> : <span />}
        {spark && spark.length > 1 ? <SparklineInline data={spark} tone={tone} /> : null}
      </div>
    </article>
  );
}

function SparklineInline({ data, tone }: { data: number[]; tone: BadgeTone }) {
  const width = 96;
  const height = 28;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = width / (data.length - 1);
  const points = data
    .map((v, i) => `${(i * step).toFixed(1)},${(height - 3 - ((v - min) / range) * (height - 6)).toFixed(1)}`)
    .join(' ');
  return (
    <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} width={width} height={height} aria-hidden="true">
      <polyline points={points} fill="none" className={`stroke-${tone}`} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ProgressBar({
  value,
  tone = 'blue',
  label,
  showValue = true,
  size = 'md',
}: {
  value: number;
  tone?: BadgeTone;
  label?: string;
  showValue?: boolean;
  size?: 'sm' | 'md';
}) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div className={`progress${size === 'sm' ? ' progress-sm' : ''}`}>
      {label || showValue ? (
        <div className="progress-meta">
          {label ? <span className="progress-label">{label}</span> : <span />}
          {showValue ? <span className="progress-value mono">{Math.round(clamped)}%</span> : null}
        </div>
      ) : null}
      <div
        className="progress-track"
        role="progressbar"
        aria-valuenow={Math.round(clamped)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? 'Progression'}
      >
        <div className={`progress-fill tone-${tone}`} style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tableaux                                                            */
/* ------------------------------------------------------------------ */

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
  align?: 'left' | 'right';
  compact?: boolean;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  emptyLabel = 'Aucun résultat',
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  caption?: string;
  emptyLabel?: string;
}) {
  if (rows.length === 0) {
    return <EmptyState icon="search" title={emptyLabel} hint="Modifiez vos filtres ou votre recherche." />;
  }
  return (
    <div className="table-scroll">
      <table className="table">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={c.align === 'right' ? 'align-right' : undefined}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((c) => (
                <td key={c.key} className={c.align === 'right' ? 'align-right' : undefined}>
                  {c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Formulaires                                                         */
/* ------------------------------------------------------------------ */

export function TextField({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  hint,
  required,
  readOnly,
  defaultValue,
}: {
  id: string;
  label: string;
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  type?: string;
  hint?: string;
  required?: boolean;
  readOnly?: boolean;
  defaultValue?: string;
}) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
        {required ? <span className="field-req" aria-hidden="true"> *</span> : null}
      </label>
      <input
        id={id}
        className="input"
        type={type}
        value={value}
        defaultValue={defaultValue}
        readOnly={readOnly}
        placeholder={placeholder}
        required={required}
        aria-describedby={hint ? `${id}-hint` : undefined}
        onChange={onChange ? (e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value) : undefined}
      />
      {hint ? (
        <p className="field-hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function SelectField({
  id,
  label,
  value,
  onChange,
  options,
  hint,
  ariaLabel,
}: {
  id: string;
  /** Libellé visible (optionnel si `ariaLabel` fourni). */
  label?: string;
  value: string;
  onChange?: (value: string) => void;
  options: { value: string; label: string }[];
  hint?: string;
  ariaLabel?: string;
}) {
  return (
    <div className="field">
      {label ? (
        <label className="field-label" htmlFor={id}>
          {label}
        </label>
      ) : null}
      <select
        id={id}
        className="input"
        value={value}
        aria-label={label ? undefined : ariaLabel}
        onChange={onChange ? (e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value) : undefined}
        aria-describedby={hint ? `${id}-hint` : undefined}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint ? (
        <p className="field-hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  label = 'Rechercher',
  placeholder = 'Rechercher…',
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
}) {
  return (
    <div className="search-box">
      <Icon name="search" size={15} />
      <input
        type="search"
        className="search-input"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
}) {
  const id = `toggle-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return (
    <div className="setting-row">
      <div className="setting-row-text">
        <label className="setting-label" htmlFor={id}>
          {label}
        </label>
        {description ? <p className="setting-desc">{description}</p> : null}
      </div>
      <button
        type="button"
        role="switch"
        id={id}
        aria-checked={checked}
        className={`toggle${checked ? ' toggle-on' : ''}`}
        onClick={() => onChange(!checked)}
      >
        <span className="toggle-thumb" aria-hidden="true" />
        <span className="sr-only">{checked ? 'Activé' : 'Désactivé'}</span>
      </button>
    </div>
  );
}

/** Groupe de filtres à sélection unique (chips). */
export function FilterChips({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: string; label: string; count?: number }[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  return (
    <div className="chips" role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={`chip${o.value === value ? ' chip-active' : ''}`}
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
          {typeof o.count === 'number' ? <span className="chip-count mono">{o.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Divers                                                              */
/* ------------------------------------------------------------------ */

export function EmptyState({ icon, title, hint }: { icon: IconName; title: string; hint?: string }) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon name={icon} size={22} />
      </span>
      <p className="empty-title">{title}</p>
      {hint ? <p className="empty-hint">{hint}</p> : null}
    </div>
  );
}

/** Pastille d'état de l'API (topbar), alimentée par GET /api/health. */
export function ApiPill() {
  const health = useHealth();
  const tone = health === 'up' ? 'ok' : health === 'unknown' ? 'wait' : 'down';
  const text = health === 'up' ? 'API en ligne' : health === 'unknown' ? 'API…' : 'API hors ligne';
  return (
    <span className={`api-pill api-${tone}`} role="status" aria-label={`État de l'API : ${text}`}>
      <span className="dot" aria-hidden="true" />
      <span className="api-pill-text">{text}</span>
    </span>
  );
}

/** Bouton copier-coller avec retour visuel. */
export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const onCopy = () => {
    try {
      void navigator.clipboard?.writeText(text).catch(() => undefined);
    } catch {
      /* clipboard indisponible : retour visuel quand même */
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };
  return (
    <Button variant="ghost" size="sm" icon={copied ? 'check' : 'copy'} onClick={onCopy}>
      {copied ? 'Copié' : 'Copier'}
    </Button>
  );
}
