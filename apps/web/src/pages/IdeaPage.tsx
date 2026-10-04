import { useCallback, useEffect, useState } from 'react';
import { ApiError, api, type Idea } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Badge, Button, Card, EmptyState, PageHeader, TextField } from '../components/ui';

const STATUS_TONE: Record<Idea['status'], 'cyan' | 'violet' | 'green'> = { nouveau: 'cyan', evalue: 'violet', valide: 'green' };
const STATUS_LABEL: Record<Idea['status'], string> = { nouveau: 'nouveau', evalue: 'évalué', valide: 'validé' };

interface Draft {
  title: string;
  detail: string;
  tags: string;
}

const EMPTY_DRAFT: Draft = { title: '', detail: '', tags: '' };

/**
 * Idea — capture d'idées RÉELLE (table `ideas`, scopée par organisation).
 * Les votes sont incrémentés côté serveur ; aucun état local fantôme.
 */
export function IdeaPage() {
  const { organization } = useAuth();
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!organization) return;
    setLoading(true);
    try {
      setError(null);
      const page = await api.ideas(organization.id);
      setIdeas(page.data);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Chargement des idées impossible');
      setIdeas([]);
    } finally {
      setLoading(false);
    }
  }, [organization]);

  useEffect(() => {
    void load();
  }, [load]);

  const addIdea = async () => {
    if (!organization) return;
    if (draft.title.trim().length < 3) {
      setError('Donnez un titre d’au moins 3 caractères.');
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const tags = draft.tags.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 4);
      await api.ideaCreate({ organizationId: organization.id, title: draft.title.trim(), detail: draft.detail.trim(), tags });
      setDraft(EMPTY_DRAFT);
      setNotice('Idée enregistrée.');
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Enregistrement impossible');
    } finally {
      setBusy(false);
    }
  };

  const vote = async (idea: Idea) => {
    if (!organization) return;
    setError(null);
    try {
      await api.ideaVote(idea.id, organization.id);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Vote impossible');
    }
  };

  return (
    <>
      <PageHeader
        title="Idea"
        description="Capturez et évaluez de nouvelles idées avant de les transformer en projets."
      />

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="saved-note" role="status">
          {notice}
        </p>
      )}

      <div className="split-2">
        <Card title="Nouvelle idée" subtitle="Enregistrée dans votre espace, persistante">
          <form
            className="form-grid"
            onSubmit={(event) => {
              event.preventDefault();
              void addIdea();
            }}
          >
            <TextField
              id="idea-title"
              label="Titre"
              required
              placeholder="Ex. Palette de commandes (Ctrl+K)"
              value={draft.title}
              onChange={(title) => setDraft((d) => ({ ...d, title }))}
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
              <Button type="submit" icon="plus" disabled={busy}>
                {busy ? 'Enregistrement…' : 'Ajouter au backlog'}
              </Button>
              <Button
                variant="outline"
                icon="sparkles"
                type="button"
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
          {loading ? (
            <EmptyState icon="clock" title="Chargement…" hint="Récupération du backlog réel." />
          ) : ideas.length === 0 ? (
            <EmptyState icon="bulb" title="Backlog vide" hint="Ajoutez votre première idée avec le formulaire." />
          ) : (
            <div className="idea-list">
              {ideas.map((idea) => (
                <article key={idea.id} className="idea-card">
                  <div className="idea-top">
                    <div style={{ minWidth: 0 }}>
                      <h3 className="idea-title">{idea.title}</h3>
                    </div>
                    <Badge tone={STATUS_TONE[idea.status]}>{STATUS_LABEL[idea.status]}</Badge>
                  </div>

                  {idea.detail ? <p className="idea-detail">{idea.detail}</p> : null}

                  <div className="idea-meta">
                    {idea.tags.map((tag) => (
                      <span key={tag} className="tag">
                        {tag}
                      </span>
                    ))}
                  </div>

                  <div className="idea-foot">
                    <span className="idea-score">
                      <strong>{idea.votes}</strong>
                      {idea.votes > 1 ? 'soutiens' : 'soutien'}
                    </span>
                    <Button variant="outline" size="sm" icon="zap" onClick={() => void vote(idea)} aria-label={`Soutenir l'idée ${idea.title}`}>
                      Soutenir
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
