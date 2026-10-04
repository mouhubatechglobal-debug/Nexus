import { useCallback, useEffect, useState } from 'react';
import { ApiError, api, type LabEntry, type LabKind, type Project } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Badge, Button, Card, EmptyState, FilterChips, PageHeader, SelectField, TextField } from '../components/ui';
import { Icon } from '../components/Icon';

const KINDS: { value: LabKind; label: string }[] = [
  { value: 'hypothesis', label: 'Hypothèse' },
  { value: 'experiment', label: 'Expérience' },
  { value: 'question', label: 'Question' },
  { value: 'result', label: 'Résultat' },
  { value: 'source', label: 'Source' },
  { value: 'note', label: 'Note' },
  { value: 'conclusion', label: 'Conclusion' },
];

const KIND_TONE: Record<LabKind, 'blue' | 'violet' | 'cyan' | 'green' | 'amber' | 'neutral'> = {
  experiment: 'cyan',
  hypothesis: 'violet',
  question: 'blue',
  result: 'green',
  source: 'amber',
  note: 'neutral',
  conclusion: 'green',
};

/**
 * Research — connecté à NEXUS Lab (données réelles du projet).
 * Une donnée non vérifiée est TOUJOURS affichée comme telle.
 */
export function ResearchPage() {
  const { organization } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<string | null>(() => window.localStorage.getItem('nexus.activeProject'));
  const [entries, setEntries] = useState<LabEntry[]>([]);
  const [filter, setFilter] = useState('tous');
  const [kind, setKind] = useState<LabKind>('hypothesis');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!organization) return;
    api.projects(organization.id, { limit: 100 })
      .then((page) => {
        setProjects(page.data);
        setProjectId((current) => (current && page.data.some((p) => p.id === current) ? current : (page.data[0]?.id ?? null)));
      })
      .catch(() => setProjects([]));
  }, [organization]);

  const load = useCallback(async () => {
    if (!projectId) return;
    try {
      setEntries(await api.labList(projectId));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Chargement impossible');
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!projectId) return;
    try {
      await api.labCreate(projectId, {
        kind,
        title: title.trim(),
        content: content.trim(),
        sourceUrl: sourceUrl.trim() || undefined,
      });
      setTitle('');
      setContent('');
      setSourceUrl('');
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Ajout impossible');
    }
  };

  const filtered = filter === 'tous' ? entries : entries.filter((entry) => entry.kind === filter);
  const counts = KINDS.map((k) => ({ value: k.value, label: k.label, count: entries.filter((e) => e.kind === k.value).length }));

  return (
    <>
      <PageHeader
        title="Research"
        description="NEXUS Lab — hypothèses, expériences et sources de votre projet. Les données non vérifiées sont explicitement marquées."
      />

      {projects.length > 0 ? (
        <div className="list-toolbar">
          <div style={{ minWidth: 240 }}>
            <SelectField
              id="research-project"
              ariaLabel="Projet actif"
              value={projectId ?? ''}
              onChange={(value) => setProjectId(value)}
              options={projects.map((project) => ({ value: project.id, label: project.name }))}
            />
          </div>
        </div>
      ) : null}

      <div className="split-2">
        <Card title="Ajouter une entrée" subtitle="Une source doit référencer une URL vérifiable">
          <form className="form-grid" onSubmit={create}>
            <SelectField id="lab-kind" label="Type" value={kind} onChange={(value) => setKind(value as LabKind)} options={KINDS} />
            <TextField id="lab-title" label="Titre" required value={title} onChange={setTitle} placeholder="Ex. Les PME adoptent-elles les OS créatifs ?" />
            <div className="field">
              <label className="field-label" htmlFor="lab-content">Contenu</label>
              <textarea id="lab-content" className="input" rows={4} required value={content} onChange={(event) => setContent(event.target.value)} />
            </div>
            <TextField
              id="lab-source"
              label={`Source URL${kind === 'source' ? ' (obligatoire)' : ' (optionnel)'}`}
              type="url"
              value={sourceUrl}
              onChange={setSourceUrl}
              placeholder="https://…"
              hint="Sans URL, l’entrée sera marquée « non vérifiée »."
            />
            <div className="form-actions">
              <Button type="submit" icon="plus" disabled={title.trim().length < 2 || content.trim().length < 1 || !projectId}>
                Enregistrer
              </Button>
            </div>
            {error ? (
              <p className="saved-note" style={{ color: 'var(--danger)' }} role="alert">{error}</p>
            ) : null}
          </form>
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <FilterChips
            ariaLabel="Filtrer par type d’entrée"
            value={filter}
            onChange={setFilter}
            options={[{ value: 'tous', label: 'Tous', count: entries.length }, ...counts]}
          />

          {!projectId ? (
            <Card><EmptyState icon="search-doc" title="Aucun projet" hint="Créez un projet pour utiliser NEXUS Lab." /></Card>
          ) : filtered.length === 0 ? (
            <Card><EmptyState icon="search-doc" title="Aucune entrée" hint="Ajoutez votre première hypothèse ou source." /></Card>
          ) : (
            <div className="idea-list">
              {filtered.map((entry) => (
                <article key={entry.id} className="idea-card">
                  <div className="idea-top">
                    <h3 className="idea-title">{entry.title}</h3>
                    <Badge tone={KIND_TONE[entry.kind]}>{entry.kind}</Badge>
                  </div>
                  <p className="idea-detail" style={{ whiteSpace: 'pre-wrap' }}>{entry.content}</p>
                  <div className="idea-meta">
                    {entry.sourceUrl ? (
                      <a href={entry.sourceUrl} target="_blank" rel="noreferrer noopener" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
                        <Icon name="arrow-right" size={13} />
                        {entry.sourceLabel ?? 'Source'}
                      </a>
                    ) : null}
                    {entry.verified ? (
                      <Badge tone="green">vérifié</Badge>
                    ) : (
                      <Badge tone="amber">non vérifié</Badge>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
