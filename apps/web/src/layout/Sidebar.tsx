import { Icon } from '../components/Icon';
import { ROUTES, NAV_SECTIONS } from '../routes';
import { Link } from '../router';

interface SidebarProps {
  activeId: string;
  onNavigate: () => void;
}

export function Sidebar({ activeId, onNavigate }: SidebarProps) {
  return (
    <aside id="sidebar" className="sidebar">
      <div className="sidebar-brand">
        <span className="brand-mark" aria-hidden="true">
          N
        </span>
        <span className="brand-text">
          <strong>NEXUS</strong>
          <small>Digital Creation OS</small>
        </span>
      </div>

      <nav className="sidebar-nav" aria-label="Navigation principale">
        {NAV_SECTIONS.map((section) => (
          <div className="nav-section" key={section}>
            <p className="nav-section-title">{section}</p>
            <ul className="nav-list">
              {ROUTES.filter((r) => r.inNav && r.section === section).map((route) => {
                const active = route.id === activeId;
                return (
                  <li key={route.id}>
                    <Link
                      to={route.path}
                      className={active ? 'nav-item nav-item-active' : 'nav-item'}
                      aria-current={active ? 'page' : undefined}
                      onClick={onNavigate}
                    >
                      <Icon name={route.icon} size={17} />
                      <span className="nav-item-label">{route.label}</span>
                      {active ? <span className="nav-item-glow" aria-hidden="true" /> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="sidebar-foot">
        <div className="user-chip">
          <span className="avatar" aria-hidden="true">
            AM
          </span>
          <span className="user-meta">
            <strong>Alex Martin</strong>
            <small>Plan Studio</small>
          </span>
        </div>
        <p className="sidebar-version mono">v0.2.0</p>
      </div>
    </aside>
  );
}
