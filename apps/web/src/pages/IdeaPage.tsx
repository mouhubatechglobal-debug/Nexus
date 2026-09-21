import { useState } from 'react';
import { IDEAS, type Idea } from '../data/mock';
import { Badge, Button, Card, EmptyState, PageHeader, ProgressBar, TextField, type BadgeTone } from '../components/ui';

const IMPACT_TONE: Record<Idea['impact'], BadgeTone> = { fort: 'green', moyen: 'amber', faible: 'neutral' };
const STATUS_TONE: Record<Idea['status'], BadgeTone> = { nouveau: 'cyan', évalué: 'violet', validé: 'green' };

interface Draft {
  title: string;
  detail: string;
  tags: string;
}

const EMPTY_DRAFT: Draft = { title: '', detail: '', tags: '' };

export function IdeaPage() {
  const [ideas, setIdeas] = useState<Idea[]>(IDEAS);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [error, setError] = useState<string | null>(null);

  const addIdea = () => {
    if (draft.title.trim().length < 3) {
      setError('Donnez un titre d’au moins 3 caractères.');
      return;
    }
    const idea: Idea = {
      id: `IDEA-${Math.floor(Math.random() * 900 + 100)}`,
      title: draft.title.trim(),
      detail: draft.detail.trim() || 'Description à compléter.',
      tags: draft.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 4),
      impact: 'moyen',
      effort: 'moyen',
      score: 0,
      votes: 0,
      status: 'nouveau',
    };
    setIdeas((previous) => [idea, ...previous]);
    setDraft(EMPTY_DRAFT);
    setError(null);
  };

  const vote = (id: string) => {
    setIdeas((previous) =>
      previous.map((idea) => (idea.id === id ? { ...idea, votes: idea.votes + 1 } : idea)),
    );
  };

  return (
    <>
      <PageHeader
        title="Idea"
        description="Capturez et évaluez de nouvelles idées avant de les transformer en projets."
      />

      <div className="split-2">
        <Card title="Nouvelle idée" subtitle="Décrivez votre intuition — Nexus l'évaluera plus tard">
          <form
            className="form-grid"
            onSubmit={(event) => {
              event.preventDefault();
              addIdea();
            }}
          >
            <TextField
              id="idea-title"
              label="Titre"
              required
              placeholder="Ex. Palette de commandes (Ctrl+K)"
              value={draft.title}
              onChange={(title) => setDraft((d) => ({ ...d, title }))}
              hint={error ?? undefined}
            />
            <div className="field">
              <label className="field-label" htmlFor="idea-detail">
                Description
              </label>
              <textarea
                id="idea-detail"
                className="input"
                rows={4}
                placeholder="Le problème, la solution imaginée, les bénéfices…"
                value={draft.detail}
                onChange={(event) => setDraft((d) => ({ ...d, detail: event.target.value }))}
              />
            </div>
            <TextField
              id="idea-tags"
              label="Tags (séparés par des virgules)"
              placeholder="ux, performance…"
              value={draft.tags}
              onChange={(tags) => setDraft((d) => ({ ...d, tags }))}
            />
            <div className="form-actions">
              <Button type="submit" icon="plus">
                Ajouter au backlog
              </Button>
              <Button
                variant="outline"
                icon="sparkles"
                onClick={() =>
                  setDraft({
                    title: 'Raccourcis d’export rapides',
                    detail: 'Exporter un projet ou un rapport en un raccourci, format au choix.',
                    tags: 'ux, productivité',
                  })
                }
              >
                M’inspirer
              </Button>
            </div>
          </form>
        </Card>

        <Card title={`Backlog d'idées — ${ideas.length}`} subtitle="Votez pour prioriser les évaluations">
          {ideas.length === 0 ? (
            <EmptyState icon="bulb" title="Backlog vide" hint="Ajoutez votre première idée avec le formulaire." />
          ) : (
            <div className="idea-list">
              {ideas.map((idea) => (
                <article key={idea.id} className="idea-card">
                  <div className="idea-top">
                    <div style={{ minWidth: 0 }}>
                      <p className="mono muted" style={{ fontSize: 11 }}>
                        {idea.id}
                      </p>
                      <h3 className="idea-title">{idea.title}</h3>
                    </div>
                    <Badge tone={STATUS_TONE[idea.status]}>{idea.status}</Badge>
                  </div>

                  <p className="idea-detail">{idea.detail}</p>

                  <div className="idea-meta">
                    <Badge tone={IMPACT_TONE[idea.impact]}>impact {idea.impact}</Badge>
                    <Badge tone="neutral">effort {idea.effort}</Badge>
                    {idea.tags.map((tag) => (
                      <span key={tag} className="tag">
                        {tag}
                      </span>
                    ))}
                  </div>

                  {idea.score > 0 ? <ProgressBar value={idea.score} label="Potentiel estimé" tone={idea.score >= 75 ? 'green' : 'blue'} size="sm" /> : null}

                  <div className="idea-foot">
                    <span className="idea-score">
                      <strong>{idea.score > 0 ? idea.score : '—'}</strong>
                      score Nexus
                    </span>
                    <Button variant="outline" size="sm" icon="zap" onClick={() => vote(idea.id)} aria-label={`Soutenir l'idée ${idea.title}`}>
                      Soutenir ({idea.votes})
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
