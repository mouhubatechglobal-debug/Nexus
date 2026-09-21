/**
 * Audit responsive NEXUS (Playwright / Chromium headless).
 *
 * Pour chaque largeur imposée (320 → 1920) et chaque route :
 *  - attend le titre de page attendu (la navigation fonctionne) ;
 *  - mesure le débordement horizontal (scrollWidth > clientWidth) ;
 *  - identifie les éléments responsables d'un éventuel débordement ;
 *  - collecte les erreurs de console et les exceptions de page.
 *
 * Prérequis : `npm run build -w @nexus/web` puis un serveur de preview
 * (par défaut http://localhost:4173). Captures d'écran dans reports/.
 *
 * Usage : node scripts/audit-responsive.mjs [--base http://localhost:4173]
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import chromiumPkg, { inflate } from '@sparticuz/chromium';

/**
 * Chromium embarqué (@sparticuz/chromium) : fonctionne même sans accès aux
 * CDN de navigateurs. Les bibliothèques système sont extraites de
 * `al2023.tar.br` (saute l'heuristique Lambda du paquet).
 */
const libPath = join(tmpdir(), 'al2023', 'lib');
if (!existsSync(libPath)) {
  await inflate(
    join(process.cwd(), 'node_modules', '@sparticuz', 'chromium', 'bin', 'al2023.tar.br'),
  );
}
process.env['LD_LIBRARY_PATH'] = libPath;
process.env['FONTCONFIG_PATH'] = join(tmpdir(), 'fonts');

const args = process.argv.slice(2);
const baseFlag = args.indexOf('--base');
const BASE = baseFlag !== -1 ? args[baseFlag + 1] : (process.env['AUDIT_BASE'] ?? 'http://localhost:4173');

const ROUTES = [
  { path: '/', label: 'Dashboard' },
  { path: '/projects', label: 'Projects' },
  { path: '/library', label: 'Library' },
  { path: '/idea', label: 'Idea' },
  { path: '/research', label: 'Research' },
  { path: '/conception', label: 'Conception' },
  { path: '/code', label: 'Code' },
  { path: '/test', label: 'Test' },
  { path: '/deploy', label: 'Deploy' },
  { path: '/analyse', label: 'Analyse' },
  { path: '/amelioration', label: 'Amélioration' },
  { path: '/settings', label: 'Settings' },
];

const WIDTHS = [320, 360, 390, 412, 768, 1024, 1280, 1440, 1920];
const SHOT_WIDTHS = new Set([320, 390, 768, 1440]);
const SHOT_ROUTES = new Set(['/', '/projects', '/code']);

const executablePath = await chromiumPkg.executablePath();
// `--single-process` (recommandé pour Lambda) fait planter le renderer sous
// émulation de viewport : on l'écarte pour un audit fiable.
const launchArgs = chromiumPkg.args.filter((flag) => flag !== '--single-process');
const browser = await chromium.launch({ executablePath, args: launchArgs, headless: true });
const results = [];
const consoleErrors = [];

for (const width of WIDTHS) {
  const page = await browser.newPage({
    viewport: { width, height: width < 768 ? 820 : 1000 },
    deviceScaleFactor: 1,
  });
  // Session par contexte : inscription via l'API (cookies du contexte).
  await page.request
    .post(`${BASE}/api/v1/auth/register`, {
      data: { email: `audit-${Date.now()}-${width}@nexus.test`, password: 'MotDePasse2026' },
    })
    .catch(() => undefined);
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push({ width, text: message.text().slice(0, 300) });
  });
  page.on('pageerror', (error) => {
    consoleErrors.push({ width, text: `pageerror: ${String(error).slice(0, 300)}` });
  });

  for (const route of ROUTES) {
    await page.goto(`${BASE}/#${route.path}`, { waitUntil: 'domcontentloaded' });
    let navigationOk = true;
    try {
      await page.waitForFunction(
        (label) => document.querySelector('h1')?.textContent === label,
        route.label,
        { timeout: 4000 },
      );
    } catch {
      navigationOk = false;
    }
    await page.waitForTimeout(220);

    const audit = await page.evaluate(() => {
      const doc = document.documentElement;
      const overflowX = doc.scrollWidth - doc.clientWidth;
      const offenders = [];
      if (overflowX > 1) {
        for (const el of document.querySelectorAll('body *')) {
          const rect = el.getBoundingClientRect();
          if (rect.right > doc.clientWidth + 1 && rect.width > 8) {
            const cls = String(el.className).split(' ').filter(Boolean).slice(0, 2).join('.');
            offenders.push(`${el.tagName.toLowerCase()}${cls ? `.${cls}` : ''}`);
          }
          if (offenders.length >= 5) break;
        }
      }
      return { overflowX, offenders };
    });

    results.push({ width, route: route.path, label: route.label, navigationOk, ...audit });

    if (SHOT_WIDTHS.has(width) && SHOT_ROUTES.has(route.path)) {
      const dir = join('reports', 'responsive', String(width));
      mkdirSync(dir, { recursive: true });
      const name = route.path === '/' ? 'dashboard' : route.path.slice(1);
      await page.screenshot({ path: join(dir, `${name}.png`) });
    }
  }
  await page.close();
}

await browser.close();

const overflows = results.filter((r) => r.overflowX > 1);
const navFailures = results.filter((r) => !r.navigationOk);

const lines = [
  '# Audit responsive NEXUS',
  '',
  `Base : ${BASE} — généré le ${new Date().toISOString()}`,
  '',
  '| Largeur | Route | Navigation | Débordement X | Coupables |',
  '| --- | --- | --- | --- | --- |',
  ...results.map(
    (r) =>
      `| ${r.width}px | ${r.route} | ${r.navigationOk ? '✅' : '❌'} | ${
        r.overflowX > 1 ? `❌ +${r.overflowX}px` : '✅'
      } | ${r.offenders.join(', ') || '—'} |`,
  ),
  '',
  `Routes vérifiées : ${results.length}`,
  `Débordements : ${overflows.length === 0 ? 'aucun ✅' : `${overflows.length} ❌`}`,
  `Échecs de navigation : ${navFailures.length === 0 ? 'aucun ✅' : navFailures.map((r) => `${r.width}px${r.route}`).join(', ')}`,
  `Erreurs de console : ${consoleErrors.length === 0 ? 'aucune ✅' : ''}`,
  ...consoleErrors.slice(0, 20).map((e) => `  - [${e.width}px] ${e.text}`),
  '',
];

writeFileSync(join('reports', 'responsive', 'audit.md'), lines.join('\n'));
console.log(lines.join('\n'));

process.exit(overflows.length + navFailures.length === 0 ? 0 : 1);
