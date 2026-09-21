import { useState } from 'react';
import { Button, Card, CopyButton, PageHeader, SelectField, TextField, Toggle } from '../components/ui';

export function SettingsPage() {
  const [name, setName] = useState('Alex Martin');
  const [email, setEmail] = useState('alex@nexus.studio');
  const [workspace, setWorkspace] = useState('Nexus Studio');
  const [region, setRegion] = useState('eu-west');
  const [saved, setSaved] = useState(false);

  const [animations, setAnimations] = useState(true);
  const [glass, setGlass] = useState(true);
  const [notifEmail, setNotifEmail] = useState(true);
  const [notifPush, setNotifPush] = useState(false);
  const [notifWeekly, setNotifWeekly] = useState(true);

  const save = () => {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2600);
  };

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
              <Button type="submit">Mettre à jour</Button>
              {saved ? (
                <span className="saved-note" role="status">
                  Préférences enregistrées ✓
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
              hint="La migration de région sera disponible avec le backend persistant."
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
            <Button variant="danger" icon="alert">
              Réinitialiser l'espace
            </Button>
            <Button variant="danger" icon="alert">
              Supprimer le compte
            </Button>
          </div>
          <p className="muted" style={{ marginTop: 12, fontSize: 12.5 }}>
            Inactives à cette étape : l'authentification et la persistance arrivent dans un prompt ultérieur.
          </p>
        </Card>
      </div>
    </>
  );
}
