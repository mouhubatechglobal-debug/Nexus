import { useCallback, useEffect, useState } from 'react';
import { ApiError, api, type PayAdapter, type PayTransaction } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Badge, Button, Card, CopyButton, DataTable, EmptyState, PageHeader, SelectField, TextField, Toggle, type Column } from '../components/ui';

/** Frais NEXUS : 3,5 % = 350 bps — calculés côté serveur, ceci n'est qu'un aperçu. */
const FEE_BPS = 350;

export function SettingsPage() {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [workspace, setWorkspace] = useState('Nexus Studio');
  const [region, setRegion] = useState('eu-west');
  const [saved, setSaved] = useState(false);

  // Pré-remplissage avec les données RÉELLES de la session.
  useEffect(() => {
    if (user) {
      setName(user.displayName ?? '');
      setEmail(user.email);
    }
  }, [user]);

  /** Sauvegarde locale honnête : aucune route de profil n'existe côté API. */
  const save = () => {
    window.localStorage.setItem('nexus.settings', JSON.stringify({ workspace, region, animations, glass, notifEmail, notifPush, notifWeekly }));
    setSaved(true);
    window.setTimeout(() => setSaved(false), 3200);
  };

  const [animations, setAnimations] = useState(true);
  const [glass, setGlass] = useState(true);
  const [notifEmail, setNotifEmail] = useState(true);
  const [notifPush, setNotifPush] = useState(false);
  const [notifWeekly, setNotifWeekly] = useState(true);

  return (
    <>
      <PageHeader
        title="Settings"
        description="Préférences du compte et de l'espace de travail."
        actions={
          <Button icon="check" onClick={save}>
            Enregistrer
          </Button>
        }
      />

      <div className="settings-grid">
        <Card title="Profil" subtitle="Informations de compte">
          <form
            className="form-grid form-grid-2"
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
            <TextField id="profil-nom" label="Nom complet" value={name} onChange={setName} required />
            <TextField id="profil-email" label="E-mail" type="email" value={email} onChange={setEmail} required />
            <div className="form-actions" style={{ gridColumn: '1 / -1' }}>
              <Button type="submit">Enregistrer localement</Button>
              {saved ? (
                <span className="saved-note" role="status">
                  Préférences locales enregistrées — le profil n'est pas encore persisté côté serveur.
                </span>
              ) : null}
            </div>
          </form>
        </Card>

        <Card title="Apparence" subtitle="Thème sombre permanent à ce stade">
          <div>
            <Toggle
              checked={animations}
              onChange={setAnimations}
              label="Animations d'interface"
              description="Transitions et apparitions douces entre les pages."
            />
            <Toggle
              checked={glass}
              onChange={setGlass}
              label="Effets de verre"
              description="Flou d'arrière-plan sur les cartes et la topbar (plus léger pour les machines modestes)."
            />
          </div>
        </Card>

        <Card title="Notifications">
          <div>
            <Toggle checked={notifEmail} onChange={setNotifEmail} label="Alertes e-mail" description="Échecs de déploiement et erreurs critiques." />
            <Toggle checked={notifPush} onChange={setNotifPush} label="Notifications navigateur" description="Mises à jour de pipeline en temps réel." />
            <Toggle checked={notifWeekly} onChange={setNotifWeekly} label="Résumé hebdomadaire" description="Chaque lundi à 8 h, l'essentiel de votre espace." />
          </div>
        </Card>

        <Card title="Espace de travail" subtitle="Configuration de l'environnement">
          <form className="form-grid" onSubmit={(event) => event.preventDefault()}>
            <TextField id="ws-nom" label="Nom de l'espace" value={workspace} onChange={setWorkspace} />
            <SelectField
              id="ws-region"
              label="Région des données"
              value={region}
              onChange={setRegion}
              options={[
                { value: 'eu-west', label: 'Europe — Paris (eu-west)' },
                { value: 'us-east', label: 'US — Virginie (us-east)' },
                { value: 'af-north', label: 'Afrique — Lomé (af-north)' },
              ]}
              hint="Sélecteur informatif : la migration de région n'est pas implémentée côté API."
            />
            <div className="field">
              <span className="field-label">URL de l'API</span>
              <div className="search-box" style={{ padding: '4px 6px 4px 13px' }}>
                <code style={{ flex: 1, fontSize: 12.5, overflowWrap: 'anywhere' }}>http://localhost:3001</code>
                <CopyButton text="http://localhost:3001" />
              </div>
              <p className="field-hint">Définie par la variable d'environnement PORT côté API.</p>
            </div>
          </form>
        </Card>

        <Card title="Zone sensible" subtitle="Actions irréversibles" className="danger-zone">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <Button variant="danger" icon="alert" disabled>
              Réinitialiser l'espace
            </Button>
            <Button variant="danger" icon="alert" disabled>
              Supprimer le compte
            </Button>
          </div>
          <p className="muted" style={{ marginTop: 12, fontSize: 12.5 }}>
            Non implémenté à cette étape (aucune route API de suppression) — boutons désactivés
            pour éviter tout faux succès.
          </p>
        </Card>
      </div>

      <PayPanel />
    </>
  );
}

/* ----------------------------- NEXUS Pay ------------------------------ */

/**
 * NEXUS Pay (Prompt 21) — adaptation minimale côté interface.
 * Les adaptateurs (Mixx by Yas, Moov Money, Wave, MTN Money, Carte) sont des
 * ABSTRACTIONS : aucun n'est configuré, aucune API réelle n'est appelée.
 * Aucune donnée de carte n'est jamais demandée : checkout tokenisé côté serveur.
 */
function PayPanel() {
  const { organization } = useAuth();
  const isAdmin = organization?.role === 'admin' || organization?.role === 'owner';
  const [adapters, setAdapters] = useState<PayAdapter[]>([]);
  const [transactions, setTransactions] = useState<PayTransaction[]>([]);
  const [providerCode, setProviderCode] = useState('wave');
  const [amount, setAmount] = useState('100000');
  const [payoutAmount, setPayoutAmount] = useState('');
  const [payoutToken, setPayoutToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [adapterList, transactionPage] = await Promise.all([api.payAdapters(), api.payTransactions(1, 8)]);
      setAdapters(adapterList);
      setTransactions(transactionPage.data);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Chargement NEXUS Pay impossible');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const numericAmount = Number.parseInt(amount, 10);
  const validAmount = Number.isFinite(numericAmount) && numericAmount >= 100 && numericAmount <= 10_000_000;
  const fee = validAmount ? Math.floor((numericAmount * FEE_BPS) / 10_000) : 0;
  const net = validAmount ? numericAmount - fee : 0;

  const createTransaction = async () => {
    if (!validAmount) {
      setError('Montant invalide : entier entre 100 et 10 000 000 XOF.');
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await api.payCreateTransaction({
        providerCode,
        amount: numericAmount,
        idempotencyKey: `ui-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      });
      setNotice(
        result.idempotentReplay
          ? 'Transaction déjà existante (clé idempotente réutilisée).'
          : `Transaction ${result.transaction.status === 'pending' ? 'enregistrée (pending)' : result.transaction.status} — frais ${(FEE_BPS / 100).toFixed(1)} % calculés côté serveur.`,
      );
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Création impossible');
    } finally {
      setBusy(false);
    }
  };

  const createPayout = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const payout = await api.payCreatePayout({ amount: Number.parseInt(payoutAmount, 10), destinationToken: payoutToken.trim() });
      setNotice(`Payout de ${payout.amount} ${payout.currency} créé (${payout.status}).`);
      setPayoutAmount('');
      setPayoutToken('');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Payout impossible');
    } finally {
      setBusy(false);
    }
  };

  const columns: Column<PayTransaction>[] = [
    { key: 'providerCode', header: 'Provider', render: (row) => <span className="mono">{row.providerCode}</span> },
    { key: 'amount', header: 'Montant', align: 'right', render: (row) => <span className="mono">{row.amount.toLocaleString('fr-FR')} {row.currency}</span> },
    { key: 'fee', header: 'Frais 3,5 %', align: 'right', render: (row) => <span className="mono">{row.feeAmount.toLocaleString('fr-FR')}</span> },
    { key: 'net', header: 'Net', align: 'right', render: (row) => <span className="mono">{row.netAmount.toLocaleString('fr-FR')}</span> },
    {
      key: 'status',
      header: 'Statut',
      render: (row) => (
        <Badge tone={row.status === 'succeeded' ? 'green' : row.status === 'failed' ? 'red' : row.status === 'pending' ? 'amber' : 'cyan'}>
          {row.status}
        </Badge>
      ),
    },
    { key: 'createdAt', header: 'Date', align: 'right', render: (row) => new Date(row.createdAt).toLocaleString('fr-FR') },
  ];

  return (
    <Card
      title="NEXUS Pay"
      subtitle="Adaptateurs de paiement — abstractions, aucun provider réel configuré"
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        {adapters.map((adapter) => (
          <span key={adapter.code} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, border: '1px solid var(--border)', borderRadius: 10, padding: '6px 10px', fontSize: 13 }}>
            <span className="cell-strong">{adapter.displayName}</span>
            <Badge tone={adapter.configured ? 'green' : 'neutral'}>{adapter.configured ? 'configuré' : 'non configuré'}</Badge>
          </span>
        ))}
      </div>
      <p className="muted" style={{ fontSize: 12.5, marginBottom: 18 }}>
        Aucune intégration réelle n'est active : tant que les identifiants providers ne sont pas configurés côté
        serveur, aucune transaction ne peut être encaissée. Les données de carte ne sont JAMAIS demandées —
        le paiement passe par un checkout hébergé tokenisé.
      </p>

      <div className="split-2">
        <div>
          <h3 style={{ fontSize: 14, marginBottom: 10 }}>Nouvelle transaction</h3>
          <form
            className="form-grid"
            onSubmit={(event) => {
              event.preventDefault();
              void createTransaction();
            }}
          >
            <SelectField
              id="pay-provider"
              label="Provider"
              value={providerCode}
              onChange={setProviderCode}
              options={adapters.map((adapter) => ({ value: adapter.code, label: adapter.displayName }))}
            />
            <TextField id="pay-amount" label="Montant (XOF)" value={amount} onChange={setAmount} hint="Entier entre 100 et 10 000 000." />
            <div className="field">
              <span className="field-label">Aperçu des frais (serveur : 3,5 %)</span>
              <p className="mono" style={{ fontSize: 13, margin: 0 }}>
                {validAmount ? `${numericAmount.toLocaleString('fr-FR')} → frais ${fee.toLocaleString('fr-FR')} → net ${net.toLocaleString('fr-FR')} XOF` : 'Montant invalide'}
              </p>
            </div>
            <div className="form-actions">
              <Button type="submit" disabled={busy || !validAmount}>
                Créer la transaction
              </Button>
            </div>
          </form>

          {isAdmin ? (
            <form
              className="form-grid"
              style={{ marginTop: 18 }}
              onSubmit={(event) => {
                event.preventDefault();
                void createPayout();
              }}
            >
              <h3 style={{ fontSize: 14, margin: 0 }}>Retrait (payout) — admin</h3>
              <TextField id="payout-amount" label="Montant (XOF)" value={payoutAmount} onChange={setPayoutAmount} hint="Solde disponible requis." />
              <TextField id="payout-token" label="Jeton de destination" value={payoutToken} onChange={setPayoutToken} hint="Jeton tokenisé tok_… — jamais de coordonnées brutes." />
              <div className="form-actions">
                <Button type="submit" variant="outline" disabled={busy || !payoutAmount || !payoutToken}>
                  Demander le payout
                </Button>
              </div>
            </form>
          ) : null}
        </div>

        <div>
          <h3 style={{ fontSize: 14, marginBottom: 10 }}>Transactions récentes</h3>
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
          {transactions.length === 0 ? (
            <EmptyState icon="database" title="Aucune transaction" hint="Les transactions réellement créées apparaîtront ici." />
          ) : (
            <DataTable columns={columns} rows={transactions} rowKey={(row) => row.id} caption="Transactions NEXUS Pay récentes" />
          )}
        </div>
      </div>
    </Card>
  );
}
