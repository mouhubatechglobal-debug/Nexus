import { useState } from 'react';
import { useAuth } from '../lib/auth';

/** Écran de connexion / inscription — branché sur l'API réelle. */
export function AuthScreen() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register({
          email,
          password,
          displayName: displayName || undefined,
          organizationName: organizationName || undefined,
        });
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Échec de la connexion');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-screen">
      <div className="card auth-card">
        <div className="sidebar-brand" style={{ borderTop: 'none', paddingTop: 0 }}>
          <span className="brand-mark" aria-hidden="true">N</span>
          <span className="brand-text">
            <strong>NEXUS</strong>
            <small>Digital Creation OS</small>
          </span>
        </div>

        <form className="form-grid" onSubmit={submit}>
          <div className="field">
            <label className="field-label" htmlFor="auth-email">E-mail</label>
            <input
              id="auth-email"
              className="input"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="vous@exemple.com"
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="auth-password">Mot de passe</label>
            <input
              id="auth-password"
              className="input"
              type="password"
              required
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={mode === 'register' ? '10 caractères min., lettres + chiffres' : '••••••••••'}
            />
          </div>

          {mode === 'register' ? (
            <>
              <div className="field">
                <label className="field-label" htmlFor="auth-name">Nom (optionnel)</label>
                <input
                  id="auth-name"
                  className="input"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Alex Martin"
                />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="auth-org">Nom de votre espace (optionnel)</label>
                <input
                  id="auth-org"
                  className="input"
                  value={organizationName}
                  onChange={(event) => setOrganizationName(event.target.value)}
                  placeholder="Mon Studio"
                />
              </div>
            </>
          ) : null}

          {error ? (
            <p className="saved-note" style={{ color: 'var(--danger)' }} role="alert">
              {error}
            </p>
          ) : null}

          <div className="form-actions">
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? '…' : mode === 'login' ? 'Se connecter' : 'Créer le compte'}
            </button>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => {
                setMode(mode === 'login' ? 'register' : 'login');
                setError(null);
              }}
            >
              {mode === 'login' ? 'Créer un compte' : 'J’ai déjà un compte'}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
