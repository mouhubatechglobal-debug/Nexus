import { useMemo, useState } from 'react';
import { PROJECTS, type ProjectStatus } from '../data/mock';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  FilterChips,
  PageHeader,
  ProgressBar,
  SearchInput,
  Tag,
  type BadgeTone,
} from '../components/ui';

const STATUS_TONE: Record<ProjectStatus, BadgeTone> = {
  actif: 'green',
  'en revue': 'amber',
  brouillon: 'neutral',
  archivé: 'violet',
};

export function ProjectsPage() {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<string>('tous');

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const project of PROJECTS) {
      map.set(project.status, (map.get(project.status) ?? 0) + 1);
    }
    return map;
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return PROJECTS.filter((project) => {
      const matchFilter = filter === 'tous' || project.status === filter;
      const matchQuery =
        q === '' ||
        project.name.toLowerCase().includes(q) ||
        project.description.toLowerCase().includes(q) ||
        project.tags.some((tag) => tag.includes(q));
      return matchFilter && matchQuery;
    });
  }, [query, filter]);

  return (
    <>
      <PageHeader
        title="Projects"
        description="Vos projets actifs et leur avancement."
        actions={
          <Button icon="plus">Nouveau projet</Button>
        }
      />

      <div className="list-toolbar">
        <SearchInput value={query} onChange={setQuery} label="Rechercher un projet" placeholder="Nom, description, tag…" />
        <FilterChips
          ariaLabel="Filtrer les projets par statut"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'tous', label: 'Tous', count: PROJECTS.length },
            { value: 'actif', label: 'Actifs', count: counts.get('actif') ?? 0 },
            { value: 'en revue', label: 'En revue', count: counts.get('en revue') ?? 0 },
            { value: 'brouillon', label: 'Brouillons', count: counts.get('brouillon') ?? 0 },
            { value: 'archivé', label: 'Archivés', count: counts.get('archivé') ?? 0 },
          ]}
        />
      </div>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState icon="folder" title="Aucun projet trouvé" hint="Essayez un autre mot-clé ou réinitialisez le filtre de statut." />
        </Card>
      ) : (
        <div className="proj-grid">
          {filtered.map((project) => (
            <Card key={project.id} className="project-card">
              <div className="project-top">
                <div style={{ minWidth: 0 }}>
                  <p className="project-id mono">{project.id}</p>
                  <h2 className="project-name">{project.name}</h2>
                </div>
                <Badge tone={STATUS_TONE[project.status]}>{project.status}</Badge>
              </div>

              <p className="project-desc">{project.description}</p>

              <div className="project-tags">
                {project.tags.map((tag) => (
                  <Tag key={tag}>{tag}</Tag>
                ))}
              </div>

              <ProgressBar
                label={`${project.tasksDone}/${project.tasksTotal} tâches`}
                value={project.progress}
                tone={project.progress >= 70 ? 'green' : project.progress >= 40 ? 'blue' : 'violet'}
              />

              <div className="project-foot">
                <span>Modifié {project.updatedAt}</span>
                <Button variant="ghost" size="sm" icon="arrow-right" aria-label={`Ouvrir le projet ${project.name}`}>
                  Ouvrir
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
