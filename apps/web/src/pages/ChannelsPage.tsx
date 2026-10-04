import { useCallback, useEffect, useState } from 'react';
import { ApiError, api, type ChannelDiagnostic, type ChannelIdentity, type ChannelKind, type ChannelLinkCode } from '../lib/api';
import { Badge, Button, Card, CopyButton, EmptyState, PageHeader, SelectField } from '../components/ui';

/**
 * Copilote — liaison des canaux de messagerie (WhatsApp / Telegram).
 *
 * Honnêteté d'affichage : un canal dont le token d'envoi est absent est
 * marqué BLOQUÉ avec la variable à définir — jamais présenté comme actif.
 * Aucune promesse de fonctionnalité au-delà de l'étape 1 (rangement,
 * rappels et détection arrivent avec les étapes suivantes).
 */

const CHANNEL_LABELS: Record<ChannelKind, string> = {
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  mock: 'Mock (tests)',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });
}

export function ChannelsPage() {
  const [diagnostics, setDiagnostics] = useState<ChannelDiagnostic[]>([]);
  const [identities, setIdentities] = useState<ChannelIdentity[]>([]);
  const [channel, setChannel] = useState<ChannelKind>('telegram');
  const [linkCode, setLinkCode] = useState<ChannelLinkCode | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [diagnosticData, identityData] = await Promise.all([api.channelDiagnostic(), api.channelIdentities()]);
      setDiagnostics(diagnosticData);
      setIdentities(identityData);
      setError('');
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Chargement impossible.');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createCode = async () => {
    setBusy(true);
    setError('');
    try {
      setLinkCode(await api.channelCreateLinkCode(channel));
      await refresh();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Création du code impossible.');
    } finally {
      setBusy(false);
    }
  };

  const unlink = async (identityId: string) => {
    setBusy(true);
    setError('');
    try {
      await api.channelUnlink(identityId);
      await refresh();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Dissociation impossible.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Copilote"
        description="Liez WhatsApp ou Telegram pour dialoguer avec votre assistant. Un code = une liaison, valable 10 minutes."
      />

      {error ? (
        <Card>
          <p style={{ color: 'var(--nexus-danger, #f87171)', margin: 0 }}>{error}</p>
        </Card>
      ) : null}

      <div className="grid two">
        <Card title="Créer un code de liaison">
          <p className="muted">
            1. Choisissez le canal. 2. Envoyez le code à 6 chiffres depuis votre compte de messagerie. 3. La liaison est
            immédiate et révocable à tout moment.
          </p>
          <SelectField
            id="channel-select"
            label="Canal"
            value={channel}
            onChange={(value) => setChannel(value as ChannelKind)}
            options={Object.entries(CHANNEL_LABELS).map(([value, label]) => ({ value, label }))}
          />
          <Button icon="plus" onClick={createCode} disabled={busy}>
            Générer un code
          </Button>

          {linkCode ? (
            <div style={{ marginTop: '1rem', display: 'grid', gap: '0.5rem' }}>
              <p style={{ margin: 0 }}>
                Code <strong style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '1.5rem', letterSpacing: '0.2em' }}>{linkCode.code}</strong>{' '}
                <CopyButton text={linkCode.code} />
              </p>
              <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
                Canal : {CHANNEL_LABELS[linkCode.channel]} — expire le {formatDate(linkCode.expiresAt)}. Usage unique.
              </p>
            </div>
          ) : null}
        </Card>

        <Card title="État des canaux">
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.75rem' }}>
            {diagnostics.map((diagnostic) => (
              <li key={diagnostic.channel} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <strong style={{ minWidth: '6.5rem' }}>{CHANNEL_LABELS[diagnostic.channel]}</strong>
                {diagnostic.send === 'ok' ? (
                  <Badge tone="green">Actif</Badge>
                ) : (
                  <Badge tone="amber">Bloqué — {diagnostic.reason}</Badge>
                )}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title="Vos liaisons">
        {identities.length === 0 ? (
          <EmptyState icon="bell" title="Aucune liaison" hint="Générez un code ci-dessus puis envoyez-le depuis votre messagerie." />
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.75rem' }}>
            {identities.map((identity) => (
              <li key={identity.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                <strong style={{ minWidth: '6.5rem' }}>{CHANNEL_LABELS[identity.channel]}</strong>
                <span className="muted" style={{ fontFamily: 'var(--font-mono, monospace)' }}>
                  •••{identity.externalId.slice(-4)}
                </span>
                {identity.consent === 'granted' ? (
                  <Badge tone="green">Consentement accordé</Badge>
                ) : (
                  <Badge tone="amber">Consentement retiré</Badge>
                )}
                <span className="muted" style={{ fontSize: '0.85rem' }}>
                  liée le {formatDate(identity.linkedAt)}
                </span>
                <Button icon="close" onClick={() => unlink(identity.id)} disabled={busy} aria-label={`Dissocier ${CHANNEL_LABELS[identity.channel]}`}>
                  Dissocier
                </Button>
              </li>
            ))}
          </ul>
        )}
        <p className="muted" style={{ fontSize: '0.85rem', marginBottom: 0 }}>
          Vos commandes dans la messagerie : /aide, /export, /supprimer, /stop. L'assistant ne lit jamais vos autres
          conversations — uniquement ce que vous lui envoyez.
        </p>
      </Card>
    </>
  );
}
