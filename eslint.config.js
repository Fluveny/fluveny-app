// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const globals = require('globals');
const noHexColor = require('./eslint/no-hex-color');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: [
      'dist/*',
      '.wrangler/*',
      'coverage/*',
      '.expo/*',
      'android/*',
      'ios/*',
      'tools/*',
      'src/api/schema.d.ts',
      'public/mockServiceWorker.js',
    ],
  },
  {
    plugins: { fluveny: { rules: { 'no-hex-color': noHexColor } } },
    rules: { 'fluveny/no-hex-color': 'error' },
  },
  {
    files: ['**/__tests__/**', '**/*.test.*', 'scripts/**', 'eslint/**', '*.config.js', 'jest.setup.js'],
    languageOptions: { globals: { ...globals.jest, ...globals.node } },
  },
  {
    // Worker da Cloudflare (homologação, 1.6): globais do runtime de Workers.
    files: ['worker/**'],
    languageOptions: { globals: { ...globals.serviceworker } },
  },
  {
    // Os tokens são a fonte das cores; as ilustrações (Alex) são arte chapada
    // com as cores próprias do desenho.
    files: ['src/ui/tokens/**', 'src/ui/art/**', 'eslint/**'],
    rules: { 'fluveny/no-hex-color': 'off' },
  },
]);
