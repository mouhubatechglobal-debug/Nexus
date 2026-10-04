// @ts-check
import tseslint from 'typescript-eslint';

/**
 * ESLint — preset STRICT typescript-eslint (sans règles nécessitant un
 * projet typé, ajoutées plus tard par package si besoin).
 *
 * Divergences justifiées :
 * - `no-non-null-assertion` désactivé : les assertions `request.user!` sont
 *   garanties par les guards Zod en amont (createAuthGuard), jamais nues.
 * - `_` préfixe = variable intentionnellement inutilisée (tests, callbacks).
 */
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      '.nexus-data/**',
      '**/*.config.js',
    ],
  },
  ...tseslint.configs.strict,
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
    },
  },
);
