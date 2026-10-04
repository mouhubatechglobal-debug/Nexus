# Frontend NEXUS — design system & responsive

Interface React 19 + Vite 6, dark mode « glassmorphism » futuriste et sobre.

## Identité visuelle

| Élément      | Valeur                                                      |
| ------------ | ----------------------------------------------------------- |
| Fond         | `#04060f` (profond) + `#0a1020` (surfaces)                   |
| Accents      | `#4f8dff` (bleu) · `#8b5cf6` (violet) · `#22d3ee` (cyan)     |
| Titres       | **Space Grotesk**                                            |
| Texte        | **Inter**                                                    |
| Code/métrique| **JetBrains Mono**                                           |
| Effets       | verre dépoli (`backdrop-filter`), lueurs douces, grille 30 px |

Tous les jetons vivent dans `apps/web/src/styles/tokens.css` — aucune
couleur codée en dur dans les composants.

## Structure

```
src/
├── router.tsx / routes.tsx   # Routeur hash minimal + table des 12 pages
├── layout/                   # AppShell, Sidebar, Topbar
├── components/
│   ├── Icon.tsx              # 30 icônes SVG maison (trait 1.8)
│   ├── Charts.tsx            # AreaChart, BarChart, ProgressRing (SVG)
│   └── ui.tsx                # Button, Badge, Card, DataTable, Toggle,
│                             # TextField, SelectField, SearchInput,
│                             # FilterChips, ProgressBar, StatCard,
│                             # EmptyState, ApiPill, CopyButton…
├── pages/                    # 12 pages (Dashboard → Settings)
├── data/mock.ts              # Données temporaires (Prompt 02)
└── styles/                   # tokens.css + app.css
```

## Pages (navigation réelle, routeur par hash)

Dashboard · Projects · Library · Idea · Research · Conception · Code ·
Test · Deploy · Analyse · Amélioration · Settings

## Responsive

Mobile-first, testé à **320, 360, 390, 412, 768, 1024, 1280, 1440, 1920 px**.

| Largeur      | Comportement                                              |
| ------------ | --------------------------------------------------------- |
| < 1024 px    | Sidebar en tiroir (overlay, Échap, fermeture au clic)      |
| < 768 px     | Recherche topbar masquée ; pill API réduite au point <480  |
| < 1024 px    | Kanban Conception en défilement horizontal (scroll-snap)   |
| ≥ 1024 px    | Sidebar fixe 252 px ; grilles 2 colonnes                   |
| ≥ 1280/1600 px | Grilles élargies, padding accru, contenu centré (1400 px)|

Anti-débordements : `minmax(min(100%, Xpx), 1fr)` sur toutes les grilles
auto, `min-width: 0` sur les enfants flex/grid, tableaux dans
`.table-scroll` (défilement horizontal local), textes tronqués
(`text-overflow: ellipsis`).

## Accessibilité

- Lien d'évitement « Aller au contenu », landmarks (`nav`, `main`, `header`);
- `aria-current="page"` sur la navigation active, `aria-expanded` sur le
  bouton menu, `role="switch"` sur les interrupteurs ;
- focus visible global (`:focus-visible`), navigation clavier complète ;
- `prefers-reduced-motion` respecté (animations désactivées) ;
- contrastes texte ≥ 4.5:1 (`--text-2`/`--text-3` calibrés sur `#04060f`).

## Vérifications

```bash
npm run typecheck          # tsc strict sur tous les workspaces
npm test                   # inclut tests/ui/app.test.tsx (rendu des 12 pages)
npm run build              # build de production
npm run audit:responsive   # audit Playwright 320→1920 (voir reports/)
```
