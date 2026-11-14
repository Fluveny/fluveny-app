const { RuleTester } = require('eslint');
const { execFileSync } = require('node:child_process');
const { join } = require('node:path');

const rule = require('../no-hex-color');

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: 'module', parserOptions: { ecmaFeatures: { jsx: true } } },
});

ruleTester.run('fluveny/no-hex-color', rule, {
  valid: [
    "const c = color.blue;",
    "const href = '#alex-wave';",
    "const s = 'Estágio #1';",
    "const s = 'Item #100';",
    "const s = 'Turma #2024';",
    "const s = { label: 'Unidade #100' };",
    "const s = 'Fundo white na foto';",
    "const s = { name: 'white' };",
    "const el = <Text>Unidade #100</Text>;",
    "const t = `Unit ${n}`;",
  ],
  invalid: [
    { code: "const c = '#155DFC';", errors: [{ messageId: 'literal' }] },
    { code: "const c = '#fff';", errors: [{ messageId: 'literal' }] },
    { code: "const c = 'Item #100, cor #1a2b3c';", errors: [{ messageId: 'literal' }] },
    { code: "const s = { backgroundColor: '#000' };", errors: [{ messageId: 'literal' }] },
    { code: "const s = { borderBottomColor: '#333333' };", errors: [{ messageId: 'literal' }] },
    { code: "const s = { color: 'white' };", errors: [{ messageId: 'literal' }] },
    { code: "const s = { color: on ? 'transparent' : x };", errors: [{ messageId: 'literal' }] },
    { code: 'const el = <Path fill="black" />;', errors: [{ messageId: 'literal' }] },
    { code: 'const el = <Svg stroke="#000" />;', errors: [{ messageId: 'literal' }] },
    { code: "const s = { tintColor: '#123' };", errors: [{ messageId: 'literal' }] },
    { code: "const c = 'rgba(20,33,61,0.45)';", errors: [{ messageId: 'literal' }] },
    { code: 'const c = `0 0 0 4px #155dfc22`;', errors: [{ messageId: 'literal' }] },
  ],
});

describe('fluveny/no-hex-color na configuração do projeto', () => {
  // O eslint roda num processo à parte: o carregador de configuração usa import
  // dinâmico, que o jest não aceita.
  const root = join(__dirname, '../..');
  const errorsFor = async (filePath) => {
    let output;
    try {
      output = execFileSync(
        'node',
        [join(root, 'node_modules/eslint/bin/eslint.js'), '--stdin', '--stdin-filename', filePath, '--format', 'json'],
        { cwd: root, input: "export const c = '#155DFC';\n", encoding: 'utf8' },
      );
    } catch (error) {
      if (!error.stdout) throw error;
      output = error.stdout;
    }
    const [result] = JSON.parse(output);
    return result.messages.filter((m) => m.ruleId === 'fluveny/no-hex-color');
  };

  it('acusa hex numa tela ou componente', async () => {
    expect(await errorsFor('app/(public)/index.tsx')).toHaveLength(1);
    expect(await errorsFor('src/ui/Logo.tsx')).toHaveLength(1);
  });

  it('aceita hex nos tokens e nas ilustrações', async () => {
    expect(await errorsFor('src/ui/tokens/index.ts')).toHaveLength(0);
    expect(await errorsFor('src/ui/art/alexWave.ts')).toHaveLength(0);
  });
});
