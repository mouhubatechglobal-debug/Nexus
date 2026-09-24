/**
 * Données temporaires de démonstration (Prompt 02).
 * Aucune connexion PostgreSQL : ces tableaux simulent l'état de la
 * plateforme et seront remplacés par l'API dans un prompt ultérieur.
 */

/* ------------------------------- Projets ------------------------------ */

export type ProjectStatus = 'actif' | 'en revue' | 'brouillon' | 'archivé';

export interface Project {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  progress: number;
  tasksDone: number;
  tasksTotal: number;
  tags: string[];
  updatedAt: string;
}

export const PROJECTS: Project[] = [
  {
    id: 'PRJ-2041',
    name: 'Aurora — refonte produit',
    description: "Nouvelle expérience d'onboarding et tableau de bord unifié.",
    status: 'actif',
    progress: 72,
    tasksDone: 43,
    tasksTotal: 60,
    tags: ['web', 'design system', 'IA'],
    updatedAt: 'il y a 2 h',
  },
  {
    id: 'PRJ-2038',
    name: 'Agents NEXUS v2',
    description: "Orchestration multi-agents avec exécution en bac à sable.",
    status: 'actif',
    progress: 48,
    tasksDone: 29,
    tasksTotal: 60,
    tags: ['agents', 'backend', 'sandbox'],
    updatedAt: 'il y a 5 h',
  },
  {
    id: 'PRJ-2032',
    name: 'Studio voix',
    description: 'Génération et montage de voix off dans le navigateur.',
    status: 'en revue',
    progress: 91,
    tasksDone: 58,
    tasksTotal: 64,
    tags: ['audio', 'web'],
    updatedAt: 'hier',
  },
  {
    id: 'PRJ-2027',
    name: 'Analytique prédictive',
    description: 'Prévisions de charge et recommandations automatiques.',
    status: 'actif',
    progress: 35,
    tasksDone: 14,
    tasksTotal: 40,
    tags: ['data', 'ml'],
    updatedAt: 'hier',
  },
  {
    id: 'PRJ-2019',
    name: 'Portail partenaires',
    description: 'Espace partenaires avec facturation et rapports.',
    status: 'brouillon',
    progress: 12,
    tasksDone: 3,
    tasksTotal: 25,
    tags: ['web', 'api'],
    updatedAt: 'il y a 3 j',
  },
  {
    id: 'PRJ-2004',
    name: 'Mobile companion',
    description: 'Application compagnon iOS/Android (première itération).',
    status: 'archivé',
    progress: 100,
    tasksDone: 31,
    tasksTotal: 31,
    tags: ['mobile'],
    updatedAt: 'il y a 12 j',
  },
];

/* ------------------------------- Library ------------------------------ */

export type LibraryType = 'modèle' | 'dataset' | 'document' | 'prompt';

export interface LibraryItem {
  id: string;
  name: string;
  type: LibraryType;
  size: string;
  updated: string;
}

export const LIBRARY: LibraryItem[] = [
  { id: 'LIB-101', name: 'nexus-vision-v3.onnx', type: 'modèle', size: '1,2 Go', updated: 'il y a 1 j' },
  { id: 'LIB-102', name: 'voix-fr-premium.bin', type: 'modèle', size: '640 Mo', updated: 'il y a 2 j' },
  { id: 'LIB-103', name: 'corpus-clients-2026.csv', type: 'dataset', size: '84 Mo', updated: 'il y a 2 j' },
  { id: 'LIB-104', name: 'tickets-support-anonymisés.parquet', type: 'dataset', size: '310 Mo', updated: 'il y a 4 j' },
  { id: 'LIB-105', name: 'Charte produit NEXUS.pdf', type: 'document', size: '3,4 Mo', updated: 'il y a 6 j' },
  { id: 'LIB-106', name: 'Prompt — synthèse hebdo.md', type: 'prompt', size: '12 Ko', updated: 'il y a 6 j' },
  { id: 'LIB-107', name: 'embeddings-produits.h5', type: 'modèle', size: '480 Mo', updated: 'il y a 8 j' },
  { id: 'LIB-108', name: 'jeu-test-conception.json', type: 'dataset', size: '9 Mo', updated: 'il y a 9 j' },
  { id: 'LIB-109', name: 'Prompt — revue de code.md', type: 'prompt', size: '8 Ko', updated: 'il y a 10 j' },
];

/* --------------------------------- Idea ------------------------------- */

export interface Idea {
  id: string;
  title: string;
  detail: string;
  tags: string[];
  impact: 'fort' | 'moyen' | 'faible';
  effort: 'faible' | 'moyen' | 'élevé';
  score: number;
  votes: number;
  status: 'nouveau' | 'évalué' | 'validé';
}

export const IDEAS: Idea[] = [
  {
    id: 'IDEA-581',
    title: 'Assistant de revue de PR',
    detail: 'Résumé automatique des diffs et détection des risques avant revue humaine.',
    tags: ['code', 'ia'],
    impact: 'fort',
    effort: 'moyen',
    score: 87,
    votes: 14,
    status: 'validé',
  },
  {
    id: 'IDEA-579',
    title: 'Bibliothèque de composants vivante',
    detail: 'Chaque composant documenté avec aperçu interactif et tests visuels.',
    tags: ['design system'],
    impact: 'fort',
    effort: 'élevé',
    score: 78,
    votes: 11,
    status: 'évalué',
  },
  {
    id: 'IDEA-576',
    title: 'Mode hors-ligne du Dashboard',
    detail: 'Cache local des métriques avec synchronisation au retour du réseau.',
    tags: ['web', 'ux'],
    impact: 'moyen',
    effort: 'moyen',
    score: 64,
    votes: 7,
    status: 'évalué',
  },
  {
    id: 'IDEA-571',
    title: 'Shortcuts clavier globaux',
    detail: 'Palette de commandes Ctrl+K pour naviguer entre les modules.',
    tags: ['ux', 'productivité'],
    impact: 'moyen',
    effort: 'faible',
    score: 71,
    votes: 9,
    status: 'nouveau',
  },
];

/* ------------------------------- Research ----------------------------- */

export interface ResearchSource {
  id: string;
  title: string;
  source: string;
  relevance: number;
  date: string;
  topic: 'marché' | 'technique' | 'concurrence';
}

export const RESEARCH: ResearchSource[] = [
  { id: 'RES-31', title: 'Adoption des OS de création par les studios', source: 'TechPulse', relevance: 94, date: '18/09', topic: 'marché' },
  { id: 'RES-30', title: 'Bench : orchestration multi-agents 2026', source: 'arXiv', relevance: 88, date: '16/09', topic: 'technique' },
  { id: 'RES-29', title: 'Concurrent X — levée de 40 M$', source: 'VentureWire', relevance: 81, date: '15/09', topic: 'concurrence' },
  { id: 'RES-28', title: 'WebGPU pour l’inférence navigateur', source: 'DevDigest', relevance: 76, date: '12/09', topic: 'technique' },
  { id: 'RES-27', title: 'Attentes UX des créateurs indépendants', source: 'StudioReport', relevance: 72, date: '10/09', topic: 'marché' },
];

export const SYNTHESIS: string[] = [
  'Le segment « studios de 2 à 20 personnes » représente la croissance la plus rapide (+38 % sur 12 mois).',
  'L’orchestration multi-agents avec sandbox reste le principal différenciateur technique perçu.',
  'La priorité exprimée par les utilisateurs reste la vitesse idée – prototype, devant la richesse fonctionnelle.',
  'Aucun concurrent ne couvre aujourd’hui toute la chaîne Idea – Deploy en un seul espace.',
];

/* ------------------------------ Conception ---------------------------- */

export type ConceptionStage = 'wireframes' | 'ui' | 'prêt';

export interface ConceptionItem {
  id: string;
  name: string;
  type: 'écran' | 'composant' | 'flux';
  stage: ConceptionStage;
  version: string;
  updated: string;
}

export const CONCEPTION: ConceptionItem[] = [
  { id: 'CNX-21', name: 'Onboarding — étape 1/3', type: 'écran', stage: 'wireframes', version: 'v0.3', updated: 'il y a 1 j' },
  { id: 'CNX-20', name: 'Éditeur d’agents', type: 'écran', stage: 'wireframes', version: 'v0.1', updated: 'il y a 1 j' },
  { id: 'CNX-19', name: 'Timeline de projet', type: 'composant', stage: 'wireframes', version: 'v0.2', updated: 'il y a 2 j' },
  { id: 'CNX-18', name: 'Flux de validation', type: 'flux', stage: 'wireframes', version: 'v0.1', updated: 'il y a 3 j' },
  { id: 'CNX-15', name: 'Carte métrique', type: 'composant', stage: 'ui', version: 'v1.2', updated: 'hier' },
  { id: 'CNX-14', name: 'Tableau de bord — 1440', type: 'écran', stage: 'ui', version: 'v1.4', updated: 'hier' },
  { id: 'CNX-12', name: 'Palette de commandes', type: 'composant', stage: 'ui', version: 'v1.0', updated: 'il y a 2 j' },
  { id: 'CNX-09', name: 'Sidebar responsive', type: 'composant', stage: 'prêt', version: 'v2.1', updated: 'il y a 4 j' },
  { id: 'CNX-07', name: 'Flux de déploiement', type: 'flux', stage: 'prêt', version: 'v1.3', updated: 'il y a 5 j' },
];

/* --------------------------------- Code ------------------------------- */

export interface CodeFile {
  id: string;
  path: string;
  language: string;
  loc: number;
  status: 'stable' | 'modifié' | 'nouveau';
  code: string;
}

export const CODE_FILES: CodeFile[] = [
  {
    id: 'CODE-1',
    path: 'apps/web/src/App.tsx',
    language: 'TypeScript',
    loc: 24,
    status: 'modifié',
    code: `import { useEffect } from 'react';
import { AppShell } from './layout/AppShell';
import { ROUTES } from './routes';
import { useHashRoute } from './router';

export default function App() {
  const path = useHashRoute();
  const route = ROUTES.find((r) => r.path === path) ?? ROUTES[0];

  useEffect(() => {
    document.title = route.label + ' · Nexus';
  }, [route]);

  return <AppShell route={route}>{route.element}</AppShell>;
}`,
  },
  {
    id: 'CODE-2',
    path: 'apps/api/src/routes/health.ts',
    language: 'TypeScript',
    loc: 51,
    status: 'stable',
    code: `// Sonde GET /health — PostgreSQL et Redis, timeout 800 ms.
app.get('/health', async (_request, reply) => {
  const [database, redis] = await Promise.all([
    withTimeout(options.checkDatabase(), 800, 'down'),
    withTimeout(options.checkRedis(), 800, 'down'),
  ]);

  const payload = healthResponseSchema.parse({
    status: database === 'up' && redis === 'up' ? 'ok' : 'degraded',
    service: 'Nexus',
    checks: { database, redis },
  });

  return reply.code(200).send(payload);
});`,
  },
  {
    id: 'CODE-3',
    path: 'packages/core/src/index.ts',
    language: 'TypeScript',
    loc: 42,
    status: 'stable',
    code: `// Résultat typé à la Rust : pas d'exception pour le flux de contrôle.
export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export const ok = <T>(value: T) => ({ ok: true, value });

export const err = <E>(error: E) => ({ ok: false, error });`,
  },
  {
    id: 'CODE-4',
    path: 'services/workers/src/index.ts',
    language: 'TypeScript',
    loc: 63,
    status: 'nouveau',
    code: `// Fabriques BullMQ — aucune connexion ouverte à l'import.
export function createQueue(name: string, redisUrl: string): Queue {
  return new Queue(name, { connection: connectionOptions(redisUrl) });
}

export const QUEUE_NAMES = {
  tasks: 'nexus.tasks',
} as const;`,
  },
];

/* --------------------------------- Test ------------------------------- */

export interface TestSuite {
  name: string;
  status: 'réussi' | 'échec' | 'partiel';
  passed: number;
  total: number;
  duration: string;
}

export const TEST_SUITES: TestSuite[] = [
  { name: 'packages/core — unitaires', status: 'réussi', passed: 12, total: 12, duration: '0,9 s' },
  { name: 'packages/contracts — unitaires', status: 'réussi', passed: 18, total: 18, duration: '1,1 s' },
  { name: 'apps/api — intégration', status: 'réussi', passed: 26, total: 26, duration: '3,4 s' },
  { name: 'apps/web — interface', status: 'réussi', passed: 13, total: 13, duration: '2,8 s' },
  { name: 'services/workers — unitaires', status: 'échec', passed: 9, total: 12, duration: '2,2 s' },
  { name: 'e2e — parcours critiques', status: 'partiel', passed: 63, total: 67, duration: '41 s' },
];

export const COVERAGE = [
  { module: 'packages/core', value: 94 },
  { module: 'packages/contracts', value: 96 },
  { module: 'apps/api', value: 88 },
  { module: 'apps/web', value: 81 },
  { module: 'services/workers', value: 76 },
];

/* -------------------------------- Deploy ------------------------------ */

export interface Deployment {
  version: string;
  env: 'production' | 'staging' | 'développement';
  status: 'succès' | 'en cours' | 'échec';
  commit: string;
  date: string;
}

export const DEPLOYMENTS: Deployment[] = [
  { version: 'v1.8.2', env: 'production', status: 'succès', commit: '9f1c2ab', date: 'aujourd’hui, 09:12' },
  { version: 'v1.9.0-rc.3', env: 'staging', status: 'en cours', commit: 'c47e8d1', date: 'aujourd’hui, 11:40' },
  { version: 'v1.9.0-rc.2', env: 'staging', status: 'succès', commit: 'b21a7f0', date: 'hier, 18:03' },
  { version: 'v1.8.1', env: 'production', status: 'succès', commit: 'aa03e5c', date: 'hier, 10:27' },
  { version: 'v1.8.0', env: 'production', status: 'échec', commit: '77d9b2e', date: 'il y a 2 j, 16:45' },
];

/* -------------------------------- Analyse ----------------------------- */

export const REQUESTS_14D = [31, 34, 33, 38, 42, 40, 44, 47, 45, 49, 52, 50, 54, 58];
export const REQUEST_LABELS_14D = ['J-13', 'J-12', 'J-11', 'J-10', 'J-9', 'J-8', 'J-7', 'J-6', 'J-5', 'J-4', 'J-3', 'J-2', 'Hier', 'Auj.'];

export const LATENCY_MODULES = [
  { label: 'api', value: 120, hint: '120 ms' },
  { label: 'workers', value: 210, hint: '210 ms' },
  { label: 'postgres', value: 45, hint: '45 ms' },
  { label: 'redis', value: 8, hint: '8 ms' },
  { label: 'ia', value: 340, hint: '340 ms' },
];

export const ERROR_BREAKDOWN = [
  { label: 'Timeouts', value: 40 },
  { label: 'Validation', value: 30 },
  { label: 'Réseau', value: 20 },
  { label: 'Autres', value: 10 },
];

/* ----------------------------- Amélioration --------------------------- */

export interface Suggestion {
  id: string;
  title: string;
  detail: string;
  category: 'performance' | 'ux' | 'sécurité' | 'coût';
  gain: string;
  effort: 'faible' | 'moyen' | 'élevé';
  priority: 'haute' | 'moyenne' | 'basse';
}

export const SUGGESTIONS: Suggestion[] = [
  {
    id: 'SUG-41',
    title: 'Mettre en cache les synthèses Research',
    detail: 'Les synthèses identiques sont régénérées à chaque visite : cache Redis 24 h.',
    category: 'performance',
    gain: '-38 % de latence',
    effort: 'faible',
    priority: 'haute',
  },
  {
    id: 'SUG-40',
    title: 'Virtualiser les longues listes de Library',
    detail: 'Rendu fenêtré au-delà de 100 éléments pour préserver les animations.',
    category: 'performance',
    gain: '+22 fps au défilement',
    effort: 'moyen',
    priority: 'haute',
  },
  {
    id: 'SUG-38',
    title: 'Double authentification sur les déploiements prod',
    detail: 'Exiger une confirmation TOTP avant tout déploiement production.',
    category: 'sécurité',
    gain: 'Risque critique réduit',
    effort: 'moyen',
    priority: 'haute',
  },
  {
    id: 'SUG-35',
    title: 'Palette de commandes Ctrl+K',
    detail: 'Navigation clavier entre les modules depuis n’importe quelle page.',
    category: 'ux',
    gain: '-2 clics par action',
    effort: 'moyen',
    priority: 'moyenne',
  },
  {
    id: 'SUG-33',
    title: 'Arrêter les workers inactifs la nuit',
    detail: 'Mise à l’échelle à zéro entre 01 h et 06 h sur l’environnement de staging.',
    category: 'coût',
    gain: '-14 % de coûts infra',
    effort: 'faible',
    priority: 'moyenne',
  },
  {
    id: 'SUG-31',
    title: 'Nettoyage automatique des artefacts de test',
    detail: 'Purge des captures et traces de plus de 30 jours.',
    category: 'coût',
    gain: '-210 Go de stockage',
    effort: 'faible',
    priority: 'basse',
  },
];

/* ------------------------------ Dashboard ----------------------------- */

export interface ActivityItem {
  icon: 'zap' | 'code' | 'branch' | 'flask' | 'upload-cloud' | 'bulb';
  title: string;
  detail: string;
  time: string;
}

export const ACTIVITY: ActivityItem[] = [
  { icon: 'upload-cloud', title: 'Déploiement v1.8.2 en production', detail: 'Pipeline complet, aucun échec', time: 'il y a 25 min' },
  { icon: 'zap', title: 'Agent « synthèse » terminé', detail: '42 sources analysées pour Research', time: 'il y a 1 h' },
  { icon: 'branch', title: 'PR #214 fusionnée', detail: 'feat: palette de commandes Ctrl+K', time: 'il y a 2 h' },
  { icon: 'flask', title: 'Suite e2e relancée', detail: '63/67 parcours réussis', time: 'il y a 3 h' },
  { icon: 'bulb', title: 'Nouvelle idée évaluée', detail: '« Mode hors-ligne du Dashboard » — score 64', time: 'il y a 5 h' },
  { icon: 'code', title: 'Analyse statique terminée', detail: '0 erreur bloquante, 2 avertissements', time: 'il y a 6 h' },
];

export const PIPELINE_STAGES: { id: string; label: string; path: string; count: number; tone: 'blue' | 'violet' | 'cyan' }[] = [
  { id: 'idea', label: 'Idea', path: '/idea', count: 4, tone: 'blue' },
  { id: 'research', label: 'Research', path: '/research', count: 5, tone: 'cyan' },
  { id: 'conception', label: 'Conception', path: '/conception', count: 9, tone: 'violet' },
  { id: 'code', label: 'Code', path: '/code', count: 4, tone: 'blue' },
  { id: 'test', label: 'Test', path: '/test', count: 6, tone: 'cyan' },
  { id: 'deploy', label: 'Deploy', path: '/deploy', count: 3, tone: 'violet' },
];
