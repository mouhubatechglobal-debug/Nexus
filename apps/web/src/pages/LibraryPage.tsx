import { useMemo, useState } from 'react';
import { LIBRARY, type LibraryType } from '../data/mock';
import { Icon, type IconName } from '../components/Icon';
import { Badge, Button, Card, DataTable, PageHeader, SearchInput, SelectField, type BadgeTone, type Column } from '../components/ui';
import type { LibraryItem } from '../data/mock';

const TYPE_ICON: Record<LibraryType, IconName> = {
  modèle: 'cpu',
  dataset: 'database',
  document: 'file',
  prompt: 'sparkles',
};

const TYPE_TONE: Record<LibraryType, BadgeTone> = {
  modèle: 'violet',
  dataset: 'cyan',
  document: 'blue',
  prompt: 'green',
};

const TYPE_OPTIONS = [
  { value: 'tous', label: 'Tous les types' },
  { value: 'modèle', label: 'Modèles' },
  { value: 'dataset', label: 'Jeux de données' },
  { value: 'document', label: 'Documents' },
  { value: 'prompt', label: 'Prompts' },
];

export function LibraryPage() {
  const [query, setQuery] = useState('');
  const [type, setType] = useState('tous');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return LIBRARY.filter((item) => {
      const matchType = type === 'tous' || item.type === type;
      const matchQuery = q === '' || item.name.toLowerCase().includes(q);
      return matchType && matchQuery;
    });
  }, [query, type]);

  const columns: Column<LibraryItem>[] = [
    {
      key: 'name',
      header: 'Ressource',
      render: (item) => (
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <span className="stat-icon tone-violet" style={{ width: 26, height: 26 }}>
            <Icon name={TYPE_ICON[item.type]} size={14} />
          </span>
          <span className="cell-strong" style={{ overflowWrap: 'anywhere' }}>
            {item.name}
          </span>
        </span>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (item) => <Badge tone={TYPE_TONE[item.type]}>{item.type}</Badge>,
    },
    { key: 'size', header: 'Taille' },
    { key: 'updated', header: 'Modifié' },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (item) => (
        <Button variant="ghost" size="sm" icon="download" aria-label={`Télécharger ${item.name}`}>
          Exporter
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Library"
        description="Ressources, modèles et jeux de données de votre espace."
        actions={
          <Button icon="plus" variant="outline">
            Ajouter une ressource
          </Button>
        }
      />

      <div className="list-toolbar">
        <SearchInput value={query} onChange={setQuery} label="Rechercher une ressource" placeholder="Nom de fichier…" />
        <div style={{ minWidth: 190 }}>
          <SelectField id="library-type" value={type} onChange={setType} options={TYPE_OPTIONS} ariaLabel="Filtrer par type de ressource" />
        </div>
      </div>

      <Card
        title={`${filtered.length} ressource${filtered.length > 1 ? 's' : ''}`}
        subtitle="Stockage local de démonstration"
      >
        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={(item) => item.id}
          caption="Ressources de la bibliothèque"
          emptyLabel="Aucune ressource trouvée"
        />
      </Card>
    </>
  );
}
