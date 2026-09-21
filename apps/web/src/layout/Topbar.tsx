import { Icon } from '../components/Icon';
import { ApiPill } from '../components/ui';
import { useAuth } from '../lib/auth';
import type { RouteDefinition } from '../router';

interface TopbarProps {
  route: RouteDefinition;
  navOpen: boolean;
  onMenu: () => void;
}

export function Topbar({ route, navOpen, onMenu }: TopbarProps) {
  const { user, logout } = useAuth();
  const initials = (user?.displayName ?? user?.email ?? 'U')
    .split(/[\s@.]+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
  return (
    <header className="topbar">
      <div className="topbar-left">
        <button
          type="button"
          className="btn btn-ghost btn-icon menu-btn"
          aria-label={navOpen ? 'Fermer la navigation' : 'Ouvrir la navigation'}
          aria-expanded={navOpen}
          aria-controls="sidebar"
          onClick={onMenu}
        >
          <Icon name={navOpen ? 'close' : 'menu'} size={20} />
        </button>
        <p className="topbar-crumb">
          <span className="topbar-crumb-root">Nexus</span>
          <span className="topbar-crumb-sep" aria-hidden="true">
            /
          </span>
          <span className="topbar-crumb-page">{route.label}</span>
        </p>
      </div>

      <div className="topbar-actions">
        <label className="topbar-search">
          <Icon name="search" size={15} />
          <input type="search" placeholder="Rechercher… (Ctrl+K)" aria-label="Rechercher dans Nexus" />
        </label>
        <ApiPill />
        <button type="button" className="btn btn-ghost btn-icon" aria-label="Notifications (2 non lues)">
          <Icon name="bell" size={18} />
          <span className="notif-dot" aria-hidden="true" />
        </button>
        <span className="avatar avatar-sm" title={user?.email} aria-hidden="true">
          {initials}
        </span>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => void logout()}
        >
          Sortir
        </button>
      </div>
    </header>
  );
}
