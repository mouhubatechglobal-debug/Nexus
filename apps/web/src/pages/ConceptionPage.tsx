import { CONCEPTION, type ConceptionItem, type ConceptionStage } from '../data/mock';
import { Badge, Card, PageHeader, Tag, type BadgeTone } from '../components/ui';

const STAGES: { id: ConceptionStage; label: string; hint: string }[] = [
  { id: 'wireframes', label: 'Wireframes', hint: 'Structures et parcours' },
  { id: 'ui', label: 'Design UI', hint: 'Écrans haute fidélité' },
  { id: 'prêt', label: 'Prêt pour dev', hint: 'Spécifiés et validés' },
];

const TYPE_TONE: Record<ConceptionItem['type'], BadgeTone> = {
  écran: 'blue',
  composant: 'violet',
  flux: 'cyan',
};

export function ConceptionPage() {
  return (
    <>
      <PageHeader
        title="Conception"
        description="De l'écran au système prêt à coder."
        actions={<Badge tone="amber">Aperçu démo — non persisté</Badge>}
      />

      <Card title="Tableau de conception" subtitle="Faites défiler horizontalement sur mobile — chaque colonne est une étape.">
        <div className="kanban">
          {STAGES.map((stage) => {
            const items = CONCEPTION.filter((item) => item.stage === stage.id);
            return (
              <section key={stage.id} className="kanban-col" aria-label={`${stage.label} — ${items.length} éléments`}>
                <header className="kanban-head">
                  <span>
                    {stage.label}
                    <span className="muted" style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>
                      {' '}
                      · {stage.hint}
                    </span>
                  </span>
                  <span className="kanban-count mono">{items.length}</span>
                </header>
                {items.map((item) => (
                  <article key={item.id} className="kanban-card">
                    <div className="kanban-card-top">
                      <h3 className="kanban-name">{item.name}</h3>
                      <Badge tone={TYPE_TONE[item.type]}>{item.type}</Badge>
                    </div>
                    <div className="kanban-meta">
                      <span className="mono">{item.id} · {item.version}</span>
                      <span>{item.updated}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Tag>{item.stage}</Tag>
                    </div>
                  </article>
                ))}
                {items.length === 0 ? <p className="muted" style={{ fontSize: 12.5 }}>Colonne vide.</p> : null}
              </section>
            );
          })}
        </div>
      </Card>
    </>
  );
}
