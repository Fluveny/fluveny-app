// Funções do design:sync, em CommonJS para o jest importar sem transformação.
const { resolve } = require('node:path');

const ROOT = resolve(__dirname, '../..');
const DEFAULT_DESIGN = resolve(ROOT, '../_bmad-output/planning-artifacts/ux-designs/ux-Fluveny-2026-11-13/DESIGN.md');
const COPY = resolve(ROOT, 'src/ui/tokens/design.yaml');
const HEADER = '# Cópia do frontmatter do DESIGN.md. Não edite: rode `npm run design:sync`.\n';

/** O frontmatter YAML de um Markdown; aceita o `---` final no fim do arquivo. */
function frontmatter(markdown) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) throw new Error('DESIGN.md sem frontmatter YAML');
  return match[1].replace(/\r\n/g, '\n') + '\n';
}

module.exports = { ROOT, DEFAULT_DESIGN, COPY, HEADER, frontmatter };
