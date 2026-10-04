import { DashboardPage } from './pages/DashboardPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { LibraryPage } from './pages/LibraryPage';
import { IdeaPage } from './pages/IdeaPage';
import { ResearchPage } from './pages/ResearchPage';
import { ConceptionPage } from './pages/ConceptionPage';
import { CodePage } from './pages/CodePage';
import { TestPage } from './pages/TestPage';
import { DeployPage } from './pages/DeployPage';
import { AnalysePage } from './pages/AnalysePage';
import { AmeliorationPage } from './pages/AmeliorationPage';
import { SettingsPage } from './pages/SettingsPage';
import type { RouteDefinition } from './router';

/**
 * Table de routes de NEXUS — l'ordre des sections détermine
 * l'ordre de la sidebar.
 */
export const ROUTES: RouteDefinition[] = [
  {
    id: 'dashboard',
    path: '/',
    label: 'Dashboard',
    description: "Vue d'ensemble de votre espace de création",
    section: 'Pilotage',
    icon: 'grid',
    inNav: true,
    element: <DashboardPage />,
  },
  {
    id: 'projects',
    path: '/projects',
    label: 'Projects',
    description: 'Vos projets actifs et leur avancement',
    section: 'Création',
    icon: 'folder',
    inNav: true,
    element: <ProjectsPage />,
  },
  {
    id: 'library',
    path: '/library',
    label: 'Library',
    description: 'Ressources, modèles et jeux de données',
    section: 'Création',
    icon: 'book',
    inNav: true,
    element: <LibraryPage />,
  },
  {
    id: 'idea',
    path: '/idea',
    label: 'Idea',
    description: 'Capturez et évaluez de nouvelles idées',
    section: 'Création',
    icon: 'bulb',
    inNav: true,
    element: <IdeaPage />,
  },
  {
    id: 'research',
    path: '/research',
    label: 'Research',
    description: 'Veille et synthèses assistées par IA',
    section: 'Intelligence',
    icon: 'search-doc',
    inNav: true,
    element: <ResearchPage />,
  },
  {
    id: 'conception',
    path: '/conception',
    label: 'Conception',
    description: 'De l’écran au système prêt à coder',
    section: 'Intelligence',
    icon: 'pen',
    inNav: true,
    element: <ConceptionPage />,
  },
  {
    id: 'code',
    path: '/code',
    label: 'Code',
    description: 'Explorez et examinez la base de code',
    section: 'Ingénierie',
    icon: 'code',
    inNav: true,
    element: <CodePage />,
  },
  {
    id: 'test',
    path: '/test',
    label: 'Test',
    description: 'Qualité, couverture et suites automatisées',
    section: 'Ingénierie',
    icon: 'flask',
    inNav: true,
    element: <TestPage />,
  },
  {
    id: 'deploy',
    path: '/deploy',
    label: 'Deploy',
    description: 'Livraison continue entre environnements',
    section: 'Ingénierie',
    icon: 'upload-cloud',
    inNav: true,
    element: <DeployPage />,
  },
  {
    id: 'analyse',
    path: '/analyse',
    label: 'Analyse',
    description: "Signaux d'usage et performance",
    section: 'Optimisation',
    icon: 'chart',
    inNav: true,
    element: <AnalysePage />,
  },
  {
    id: 'amelioration',
    path: '/amelioration',
    label: 'Amélioration',
    description: 'Recommandations générées par Nexus',
    section: 'Optimisation',
    icon: 'sparkles',
    inNav: true,
    element: <AmeliorationPage />,
  },
  {
    id: 'settings',
    path: '/settings',
    label: 'Settings',
    description: 'Préférences du compte et de l’espace',
    section: 'Système',
    icon: 'sliders',
    inNav: true,
    element: <SettingsPage />,
  },
];

/** Sections de la sidebar, dans l'ordre. */
export const NAV_SECTIONS: string[] = [...new Set(ROUTES.filter((r) => r.inNav).map((r) => r.section))];
