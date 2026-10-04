import { useEffect, useState } from 'react';
import type { AnchorHTMLAttributes, ReactNode } from 'react';
import type { IconName } from './components/Icon';

/**
 * Routeur minimaliste basé sur le fragment d'URL (hash) :
 * fonctionne partout (preview, statique, tests) sans configuration serveur.
 */

/** Définition d'une page de l'application. */
export interface RouteDefinition {
  /** Identifiant stable (clé React, aria, tests). */
  id: string;
  /** Chemin interne, ex. `/projects`. */
  path: string;
  /** Libellé affiché (sidebar, titre de page). */
  label: string;
  /** Sous-titre affiché dans l'en-tête de page. */
  description: string;
  /** Groupe de navigation dans la sidebar. */
  section: string;
  icon: IconName;
  /** Visible dans la sidebar. */
  inNav: boolean;
  element: ReactNode;
}

function readPath(): string {
  const raw = window.location.hash.replace(/^#/, '');
  return raw === '' || raw === '/' ? '/' : raw.replace(/\/+$/, '');
}

/** Écoute le hash d'URL et renvoie le chemin courant. */
export function useHashRoute(): string {
  const [path, setPath] = useState(readPath);

  useEffect(() => {
    const onHashChange = () => setPath(readPath());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return path;
}

export function navigate(path: string): void {
  window.location.hash = path;
}

interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  to: string;
  children: ReactNode;
}

/** Lien de navigation interne (navigation accessible au clavier nativement). */
export function Link({ to, children, ...rest }: LinkProps) {
  return (
    <a href={`#${to}`} {...rest}>
      {children}
    </a>
  );
}
