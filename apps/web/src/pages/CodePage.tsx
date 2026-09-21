import { useMemo, useState } from 'react';
import { CODE_FILES } from '../data/mock';
import { Badge, Button, Card, CopyButton, PageHeader, StatCard, Tag } from '../components/ui';

/**
 * Échappe le HTML puis applique une coloration minimaliste (commentaires,
 * mots-clés, nombres). Les chaînes ne sont pas colorées : les apostrophes
 * des commentaires français rendraient le pairage fragile.
 */
function highlight(source: string): string {
  const escaped = source
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return escaped
    .replace(/(\/\/[^\n]*|\/\*[\s\S]*?\*\/)/g, '<span class="tok-c">$1</span>')
    .replace(/\b(import|export|from|const|let|function|return|await|async|type|new)\b/g, '<span class="tok-k">$1</span>')
    .replace(/\b(\d+)\b/g, '<span class="tok-n">$1</span>');
}

export function CodePage() {
  const [selectedId, setSelectedId] = useState(CODE_FILES[0]?.id ?? '');
  const selected = useMemo(
    () => CODE_FILES.find((file) => file.id === selectedId) ?? CODE_FILES[0],
    [selectedId],
  );

  const totalLoc = CODE_FILES.reduce((sum, file) => sum + file.loc, 0);

  return (
    <>
      <PageHeader
        title="Code"
        description="Explorez et examinez la base de code."
        actions={
          <Button variant="outline" icon="branch">
            Ouvrir une PR
          </Button>
        }
      />

      <div className="stat-grid">
        <StatCard label="Fichiers suivis" value={String(CODE_FILES.length)} icon="file" tone="blue" hint="extraits de démonstration" />
        <StatCard label="Lignes analysées" value={String(totalLoc)} icon="code" tone="violet" delta="+132" />
        <StatCard label="Langages" value="1" icon="layers" tone="cyan" hint="TypeScript — 100 %" />
      </div>

      <div className="code-layout">
        <Card title="Fichiers" subtitle="Arborescence extraite">
          <div className="file-list" role="list">
            {CODE_FILES.map((file) => (
              <button
                key={file.id}
                type="button"
                role="listitem"
                className={`file-item${file.id === selected?.id ? ' file-item-active' : ''}`}
                aria-pressed={file.id === selected?.id}
                onClick={() => setSelectedId(file.id)}
              >
                <span className={`status-dot ${file.status}`} aria-hidden="true" />
                <span className="file-path">{file.path}</span>
                <span className="file-loc mono">{file.loc} loc</span>
              </button>
            ))}
          </div>
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <Card
            title={selected?.path ?? 'Aucun fichier'}
            subtitle={selected ? `${selected.language} · ${selected.loc} lignes` : undefined}
            actions={
              <>
                {selected ? <CopyButton text={selected.code} /> : null}
                {selected ? (
                  <Badge tone={selected.status === 'stable' ? 'green' : selected.status === 'modifié' ? 'amber' : 'cyan'}>
                    {selected.status}
                  </Badge>
                ) : null}
              </>
            }
          >
            {selected ? (
              <pre className="code-pane">
                <code dangerouslySetInnerHTML={{ __html: highlight(selected.code) }} />
              </pre>
            ) : null}
          </Card>

          <Card title="Signaux de revue">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <Tag>complexité cyclomatique : 8 max</Tag>
              <Tag>0 any implicite</Tag>
              <Tag>strict mode activé</Tag>
              <Tag>couverture 87,4 %</Tag>
              <Tag>dernière analyse : il y a 6 h</Tag>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
