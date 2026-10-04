import { useCallback, useEffect, useState } from 'react';
import { ApiError, api, type Paginated, type Project } from '../lib/api';
import { useAuth } from '../lib/auth';
import { navigate } from '../router';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  ProgressBar,
  SearchInput,
  TextField,
} from '../components/ui';

/** Projects — données RÉELLES via l'API (Persistance PostgreSQL). */
export function ProjectsPage() {
  const { organization } = useAuth();
  const [page, setPage] = useState<Paginated<Project> | null>(null);
  const [query, setQuery] = useState('');
  const [pageNumber, setPageNumber] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!organization) return;
    setLoading(true);
    setError(null);
    try {
      setPage(await api.projects(organization.id, { page: pageNumber, limit: 9, q: query || undefined }));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Chargement impossible');
    } finally {
      setLoading(false);
    }
  }, [organization, pageNumber, query]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!organization || newName.trim().length < 2) return;
    setBusy(true);
    setError(null);
    try {
      await api.createProject({ organizationId: organization.id, name: newName.trim(), description: newDescription.trim() || undefined });
      setNewName('');
      setNewDescription('');
      setCreating(false);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Création impossible');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (project: Project) => {
    if (!window.confirm(`Supprimer définitivement « ${project.name} » ?`)) return;
    try {
      await api.deleteProject(project.id);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Suppression impossible');
    }
  };

  const open = (project: Project) => {
    window.localStorage.setItem('nexus.activeProject', project.id);
    navigate('/code');
  };

  if (!organization) {
    return (
      <>
        <PageHeader title="Projects" description="Vos projets actifs et leur avancement." />
        <Card>
          <EmptyState icon="folder" title="Aucune organisation" hint="Créez un compte pour obtenir votre espace." />
        </Card>
      </>
    );
  }

  const projects = page?.data ?? [];

  return (
    <>
      <PageHeader
        title="Projects"
        description={`Projets réels de « ${organization.name} » — persistés en base.`}
        actions={<Button icon="plus" onClick={() => setCreating((value) => !value)}>Nouveau projet</Button>}
      />

      {creating ? (
        <Card title="Nouveau projet" subtitle="Créé immédiatement dans la base de données">
          <form className="form-grid" onSubmit={create}>
            <TextField
              id="project-name"
              label="Nom du projet"
              required
              value={newName}
              onChange={setNewName}
              placeholder="Ex. Refonte du portail"
            />
            <TextField
              id="project-description"
              label="Description (optionnel)"
              value={newDescription}
              onChange={setNewDescription}
              placeholder="Objectif du projet en une phrase"
            />
            <div className="form-actions">
              <Button type="submit" icon="check" disabled={busy || newName.trim().length < 2}>
                {busy ? 'Création…' : 'Créer le projet'}
              </Button>
              <Button variant="ghost" onClick={() => setCreating(false)}>Annuler</Button>
            </div>
          </form>
        </Card>
      ) : null}

      <div className="list-toolbar">
        <SearchInput
          value={query}
          onChange={(value) => {
            setQuery(value);
            setPageNumber(1);
          }}
          label="Rechercher un projet"
          placeholder="Nom du projet…"
        />
        {page ? (
          <span className="muted" style={{ fontSize: 12.5 }}>
            {page.total} projet{page.total > 1 ? 's' : ''} · page {page.page}/{page.totalPages}
          </span>
        ) : null}
      </div>

      {error ? (
        <Card>
          <p className="saved-note" style={{ color: 'var(--danger)' }} role="alert">{error}</p>
        </Card>
      ) : null}

      {loading && projects.length === 0 ? (
        <Card><p className="muted">Chargement…</p></Card>
      ) : projects.length === 0 && !loading ? (
        <Card>
          <EmptyState icon="folder" title="Aucun projet" hint="Créez votre premier projet — il sera persisté en base." />
        </Card>
      ) : (
        <div className="proj-grid">
          {projects.map((project) => (
            <Card key={project.id} className="project-card">
              <div className="project-top">
                <div style={{ minWidth: 0 }}>
                  <p className="project-id mono">{project.slug}</p>
                  <h2 className="project-name">{project.name}</h2>
                </div>
                <Badge tone={project.status === 'active' ? 'green' : project.status === 'archived' ? 'violet' : 'neutral'}>
                  {project.status}
                </Badge>
              </div>

              <p className="project-desc">{project.description ?? 'Pas de description.'}</p>

              <ProgressBar
                label={`créé le ${new Date(project.createdAt).toLocaleDateString('fr-FR')}`}
                value={project.status === 'archived' ? 100 : project.status === 'active' ? 50 : 10}
                showValue={false}
                size="sm"
                tone={project.status === 'active' ? 'blue' : 'neutral' as never}
              />

              <div className="project-foot">
                <span>MAJ {new Date(project.updatedAt).toLocaleDateString('fr-FR')}</span>
                <span style={{ display: 'flex', gap: 4 }}>
                  <Button variant="ghost" size="sm" icon="arrow-right" onClick={() => open(project)} aria-label={`Ouvrir ${project.name}`}>
                    Ouvrir
                  </Button>
                  <Button variant="ghost" size="sm" icon="alert" onClick={() => remove(project)} aria-label={`Supprimer ${project.name}`}>
                    Supprimer
                  </Button>
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}

      {page && page.totalPages > 1 ? (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <Button variant="outline" size="sm" disabled={page.page <= 1} onClick={() => setPageNumber((value) => value - 1)}>
            ← Précédent
          </Button>
          <Button variant="outline" size="sm" disabled={page.page >= page.totalPages} onClick={() => setPageNumber((value) => value + 1)}>
            Suivant →
          </Button>
        </div>
      ) : null}
    </>
  );
}
