import { useCallback, useEffect, useState } from 'react';
import { ApiError, api, type BrainEntry, type BrainKind, type FileContent, type FileNode, type Project } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Badge, Button, Card, CopyButton, EmptyState, PageHeader, TextField, SelectField } from '../components/ui';

const BRAIN_KINDS: { value: BrainKind; label: string }[] = [
  { value: 'context', label: 'Contexte' },
  { value: 'objective', label: 'Objectif' },
  { value: 'constraint', label: 'Contrainte' },
  { value: 'decision', label: 'Décision' },
  { value: 'architecture', label: 'Architecture' },
  { value: 'preference', label: 'Préférence' },
  { value: 'knowledge', label: 'Connaissance' },
  { value: 'info', label: 'Info' },
];

const KIND_TONE: Record<string, 'blue' | 'violet' | 'cyan' | 'green' | 'amber' | 'neutral'> = {
  context: 'blue',
  objective: 'green',
  constraint: 'amber',
  decision: 'violet',
  architecture: 'cyan',
  preference: 'neutral',
  knowledge: 'blue',
  info: 'neutral',
};

function activeProjectId(): string | null {
  return window.localStorage.getItem('nexus.activeProject');
}

/**
 * Code — connecté au filesystem RÉEL (NEXUS Forge) et au Brain.
 * Flux : interface → API → service → PostgreSQL. Édition persistante.
 */
export function CodePage() {
  const { organization } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<string | null>(activeProjectId());
  const [tab, setTab] = useState<'files' | 'brain'>('files');

  const loadProjects = useCallback(async () => {
    if (!organization) return;
    try {
      const page = await api.projects(organization.id, { limit: 100 });
      setProjects(page.data);
      setProjectId((current) => (current && page.data.some((p) => p.id === current) ? current : (page.data[0]?.id ?? null)));
    } catch {
      setProjects([]);
    }
  }, [organization]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  return (
    <>
      <PageHeader
        title="Code"
        description="Explorateur de fichiers réel (NEXUS Forge) et mémoire Brain du projet."
      />

      {projects.length === 0 ? (
        <Card>
          <EmptyState icon="folder" title="Aucun projet" hint="Créez un projet depuis la page Projects pour utiliser l’éditeur." />
        </Card>
      ) : (
        <>
          <div className="list-toolbar">
            <div style={{ minWidth: 240 }}>
              <SelectField
                id="code-project"
                ariaLabel="Projet actif"
                value={projectId ?? ''}
                onChange={(value) => {
                  setProjectId(value);
                  window.localStorage.setItem('nexus.activeProject', value);
                }}
                options={projects.map((project) => ({ value: project.id, label: project.name }))}
              />
            </div>
            <div className="chips" role="group" aria-label="Mode de l’éditeur">
              <button type="button" className={`chip${tab === 'files' ? ' chip-active' : ''}`} aria-pressed={tab === 'files'} onClick={() => setTab('files')}>
                Fichiers
              </button>
              <button type="button" className={`chip${tab === 'brain' ? ' chip-active' : ''}`} aria-pressed={tab === 'brain'} onClick={() => setTab('brain')}>
                Brain
              </button>
            </div>
          </div>

          {projectId ? (
            tab === 'files' ? (
              <FilesPanel projectId={projectId} />
            ) : (
              <BrainPanel projectId={projectId} />
            )
          ) : null}
        </>
      )}
    </>
  );
}

/* ------------------------------ Forge -------------------------------- */

function FilesPanel({ projectId }: { projectId: string }) {
  const [nodes, setNodes] = useState<FileNode[]>([]);
  const [selected, setSelected] = useState<FileContent | null>(null);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const [newPath, setNewPath] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setNodes(await api.filesList(projectId));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Chargement impossible');
    }
  }, [projectId]);

  useEffect(() => {
    setSelected(null);
    setEditing(false);
    void load();
  }, [load]);

  const open = async (node: FileNode) => {
    setError(null);
    setNotice(null);
    if (node.isDirectory) return;
    try {
      const content = await api.fileRead(projectId, node.path);
      setSelected(content);
      setDraft(content.content);
      setEditing(false);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Lecture impossible');
    }
  };

  const save = async () => {
    if (!selected) return;
    try {
      const updated = await api.fileWrite(projectId, selected.path, draft);
      setSelected({ ...selected, content: draft, version: updated.version });
      setEditing(false);
      setNotice(`Enregistré (v${updated.version})`);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Sauvegarde impossible');
    }
  };

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (newPath.trim().length === 0) return;
    try {
      const isFolder = newPath.trim().endsWith('/');
      const cleanPath = isFolder ? newPath.trim().replace(/\/+$/, '') : newPath.trim();
      await api.fileCreate(projectId, {
        path: cleanPath,
        type: isFolder ? 'directory' : 'file',
        content: isFolder ? undefined : '',
      });
      setNewPath('');
      setNotice(isFolder ? 'Dossier créé' : 'Fichier créé');
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Création impossible');
    }
  };

  const rename = async (node: FileNode) => {
    const newPath = window.prompt('Nouveau chemin :', node.path);
    if (!newPath || newPath === node.path) return;
    try {
      await api.fileRename(projectId, node.path, newPath);
      setNotice(`Renommé en ${newPath}`);
      if (selected?.path === node.path) setSelected(null);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Renommage impossible');
    }
  };

  const remove = async (node: FileNode) => {
    if (!window.confirm(`Supprimer « ${node.path} » ?`)) return;
    try {
      await api.fileDelete(projectId, node.path);
      if (selected?.path === node.path) setSelected(null);
      setNotice('Supprimé');
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Suppression impossible');
    }
  };

  return (
    <div className="code-layout">
      <Card title="Explorateur" subtitle={`${nodes.length} élément(s) — persistés en base`}>
        <form className="form-grid" onSubmit={create} style={{ marginBottom: 12 }}>
          <div className="search-box" style={{ padding: '4px 4px 4px 12px' }}>
            <input
              className="search-input mono"
              style={{ fontSize: 12 }}
              placeholder="nouveau/chemin/fichier.tsx (ou dossier/)"
              value={newPath}
              onChange={(event) => setNewPath(event.target.value)}
              aria-label="Chemin du nouvel élément"
            />
            <Button type="submit" size="sm" icon="plus">Créer</Button>
          </div>
        </form>

        <div className="file-list" role="list">
          {nodes.map((node) => (
            <div key={node.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button
                type="button"
                role="listitem"
                className={`file-item${selected?.path === node.path ? ' file-item-active' : ''}`}
                style={{ flex: 1, paddingLeft: 10 + (node.path.split('/').length - 1) * 12 }}
                onClick={() => open(node)}
              >
                <span className={`status-dot ${node.isDirectory ? 'nouveau' : 'stable'}`} aria-hidden="true" />
                <span className="file-path">
                  {node.isDirectory ? '📁' : '📄'} {node.name}
                </span>
                <span className="file-loc mono">{node.isDirectory ? 'dossier' : `v${node.version}`}</span>
              </button>
              <Button variant="ghost" size="sm" icon="pen" onClick={() => rename(node)} aria-label={`Renommer ${node.path}`} />
              <Button variant="ghost" size="sm" icon="close" onClick={() => remove(node)} aria-label={`Supprimer ${node.path}`} />
            </div>
          ))}
          {nodes.length === 0 ? <p className="muted" style={{ fontSize: 12.5 }}>Espace vide — créez un fichier.</p> : null}
        </div>
      </Card>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
        {error ? (
          <p className="saved-note" style={{ color: 'var(--danger)' }} role="alert">{error}</p>
        ) : null}
        {notice ? (
          <p className="saved-note" role="status">{notice}</p>
        ) : null}

        {selected ? (
          <Card
            title={selected.path}
            subtitle={`${selected.mime} · version ${selected.version} · ${selected.size} o`}
            actions={
              <>
                <CopyButton text={selected.content} />
                {editing ? (
                  <Button size="sm" icon="check" onClick={save}>Enregistrer</Button>
                ) : (
                  <Button variant="outline" size="sm" icon="pen" onClick={() => setEditing(true)}>Éditer</Button>
                )}
              </>
            }
          >
            {editing ? (
              <textarea
                className="input mono"
                style={{ minHeight: 340, fontFamily: 'var(--font-mono)', lineHeight: 1.6, resize: 'vertical' }}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                aria-label={`Édition de ${selected.path}`}
                spellCheck={false}
              />
            ) : (
              <pre className="code-pane"><code>{selected.content}</code></pre>
            )}
          </Card>
        ) : (
          <Card>
            <EmptyState icon="file" title="Aucun fichier sélectionné" hint="Choisissez un fichier dans l’explorateur pour le lire ou l’éditer." />
          </Card>
        )}
      </div>
    </div>
  );
}

/* ------------------------------- Brain ------------------------------- */

function BrainPanel({ projectId }: { projectId: string }) {
  const [entries, setEntries] = useState<BrainEntry[]>([]);
  const [kind, setKind] = useState<BrainKind>('context');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setEntries(await api.brainList(projectId));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Chargement impossible');
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await api.brainCreate(projectId, { kind, title: title.trim(), content: content.trim() });
      setTitle('');
      setContent('');
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Ajout impossible');
    }
  };

  const remove = async (entry: BrainEntry) => {
    if (!window.confirm(`Supprimer « ${entry.title} » ?`)) return;
    try {
      await api.brainDelete(projectId, entry.id);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Suppression impossible');
    }
  };

  return (
    <div className="code-layout">
      <Card title="Ajouter à la mémoire" subtitle="Contexte, objectifs, contraintes, décisions…">
        <form className="form-grid" onSubmit={create}>
          <SelectField id="brain-kind" label="Type" value={kind} onChange={(value) => setKind(value as BrainKind)} options={BRAIN_KINDS} />
          <TextField id="brain-title" label="Titre" required value={title} onChange={setTitle} placeholder="Ex. Cible : PME européennes" />
          <div className="field">
            <label className="field-label" htmlFor="brain-content">Contenu</label>
            <textarea
              id="brain-content"
              className="input"
              rows={5}
              required
              value={content}
              onChange={(event) => setContent(event.target.value)}
            />
          </div>
          <div className="form-actions">
            <Button type="submit" icon="plus" disabled={title.trim().length < 2 || content.trim().length < 1}>
              Mémoriser
            </Button>
          </div>
          {error ? (
            <p className="saved-note" style={{ color: 'var(--danger)' }} role="alert">{error}</p>
          ) : null}
        </form>
      </Card>

      <Card title={`Mémoire du projet — ${entries.length} entrée(s)`}>
        {entries.length === 0 ? (
          <EmptyState icon="cpu" title="Brain vide" hint="Ajoutez le contexte et les objectifs du projet." />
        ) : (
          <div className="idea-list">
            {entries.map((entry) => (
              <article key={entry.id} className="idea-card">
                <div className="idea-top">
                  <div style={{ minWidth: 0 }}>
                    <Badge tone={KIND_TONE[entry.kind] ?? 'neutral'}>{entry.kind}</Badge>
                    <h3 className="idea-title" style={{ marginTop: 6 }}>{entry.title}</h3>
                  </div>
                  <Button variant="ghost" size="sm" icon="close" onClick={() => remove(entry)} aria-label={`Supprimer ${entry.title}`} />
                </div>
                <p className="idea-detail" style={{ whiteSpace: 'pre-wrap' }}>{entry.content}</p>
              </article>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
