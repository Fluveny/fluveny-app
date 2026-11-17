const api = require('../lib/api.cjs');
const budget = require('../lib/budget.cjs');
const { frontmatter } = require('../lib/design.cjs');

describe('design-sync: frontmatter()', () => {
  it('extrai o YAML entre os ---', () => {
    expect(frontmatter('---\na: 1\nb: x\n---\n# Título\n')).toBe('a: 1\nb: x\n');
  });

  it('aceita CRLF e o --- final no fim do arquivo', () => {
    expect(frontmatter('---\r\na: 1\r\n---\r\n')).toBe('a: 1\n');
    expect(frontmatter('---\na: 1\n---')).toBe('a: 1\n');
  });

  it('sem frontmatter, falha', () => {
    expect(() => frontmatter('# Só título\n')).toThrow('frontmatter');
  });
});

describe('api: shaOnMain()', () => {
  const full = 'a'.repeat(40);
  const compare = (status) =>
    jest.fn().mockResolvedValue({ ok: true, json: async () => ({ status, base_commit: { sha: full } }) });

  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it.each(['identical', 'ahead'])('aceita %s e devolve o sha completo', async (status) => {
    global.fetch = compare(status);
    await expect(api.shaOnMain('aaaaaaa')).resolves.toBe(full);
    expect(global.fetch.mock.calls[0][0]).toBe(
      'https://api.github.com/repos/Fluveny/fluveny-api/compare/aaaaaaa...main',
    );
  });

  it.each(['behind', 'diverged'])('recusa %s (sha fora da main)', async (status) => {
    global.fetch = compare(status);
    await expect(api.shaOnMain('aaaaaaa')).rejects.toThrow('não está na main');
  });

  it('recusa ref que não é sha, sem chamar o GitHub', async () => {
    global.fetch = jest.fn();
    await expect(api.shaOnMain('main')).rejects.toThrow('não é um sha');
    await expect(api.shaOnMain('abc; rm -rf /')).rejects.toThrow('não é um sha');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('sha desconhecido no GitHub (404): falha', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' });
    await expect(api.shaOnMain('1234567')).rejects.toThrow('404');
  });
});

describe('api: validateLock()', () => {
  const lock = {
    repo: 'Fluveny/fluveny-api',
    path: 'openapi/openapi.json',
    sha: 'b'.repeat(40),
    sha256: 'c'.repeat(64),
  };

  it('aceita o formato gravado pelo api:sync', () => {
    expect(api.validateLock(lock)).toBe(lock);
  });

  it.each([
    ['repo', { ...lock, repo: 'outro/repo' }],
    ['sha curto', { ...lock, sha: 'bbbbbbb' }],
    ['sha256 ausente', { ...lock, sha256: undefined }],
    ['não objeto', []],
  ])('recusa %s', (_, bad) => {
    expect(() => api.validateLock(bad)).toThrow();
  });
});

describe('api: checkVectors()', () => {
  const sha = 'b'.repeat(40);
  const copy = '{"vectors":[]}\n';
  const lock = {
    repo: 'Fluveny/fluveny-api',
    path: 'content/schema/render-vectors.json',
    sha,
    sha256: api.sha256(copy),
  };
  const upstream = (body) => jest.fn().mockResolvedValue({ ok: true, text: async () => body });

  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('cópia, lock e arquivo da API no sha do contrato: confere', async () => {
    global.fetch = upstream(copy);
    await expect(api.checkVectors({ sha }, { lock, copy })).resolves.toEqual([]);
    expect(global.fetch.mock.calls[0][0]).toBe(
      `https://raw.githubusercontent.com/Fluveny/fluveny-api/${sha}/content/schema/render-vectors.json`,
    );
  });

  it('cópia editada à mão: falha e manda rodar api:sync', async () => {
    global.fetch = upstream(copy);
    const failures = await api.checkVectors({ sha }, { lock, copy: copy + ' ' });
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('npm run api:sync');
  });

  it('lock dos vetores noutro sha que o do contrato: falha', async () => {
    global.fetch = upstream(copy);
    const failures = await api.checkVectors({ sha: 'd'.repeat(40) }, { lock, copy });
    expect(failures).toEqual([expect.stringContaining('sha do contrato')]);
  });

  it('arquivo da API no sha diferente do lock: falha', async () => {
    global.fetch = upstream('{"vectors":[1]}');
    const failures = await api.checkVectors({ sha }, { lock, copy });
    expect(failures).toEqual([expect.stringContaining('não é o do lock')]);
  });

  it('download dos vetores falha: falha citando o arquivo', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' });
    const failures = await api.checkVectors({ sha }, { lock, copy });
    expect(failures).toEqual([expect.stringContaining('content/schema/render-vectors.json')]);
    expect(failures[0]).toContain('404');
  });

  it('cópia ausente: falha dizendo que não existe', async () => {
    global.fetch = upstream(copy);
    const failures = await api.checkVectors({ sha }, { lock, copy: null });
    expect(failures).toEqual([expect.stringContaining('não existe')]);
  });

  it('lock com path do contrato: recusa', async () => {
    global.fetch = upstream(copy);
    const failures = await api.checkVectors({ sha }, { lock: { ...lock, path: 'openapi/openapi.json' }, copy });
    expect(failures).toEqual([expect.stringContaining('render-vectors.lock inválido')]);
  });

  it('os arquivos gravados pelo api:sync conferem com o lock do contrato', async () => {
    const { readFileSync } = require('node:fs');
    const committed = readFileSync(api.VECTORS_COPY, 'utf8');
    global.fetch = upstream(committed);
    await expect(api.checkVectors(api.readLock())).resolves.toEqual([]);
  });
});

describe('api: checkCountries()', () => {
  const sha = 'b'.repeat(40);
  const copy = '[{"code":"BR","name":"Brazil"}]\n';
  const lock = {
    repo: 'Fluveny/fluveny-api',
    path: 'content/schema/countries.json',
    sha,
    sha256: api.sha256(copy),
  };
  const upstream = (body) => jest.fn().mockResolvedValue({ ok: true, text: async () => body });

  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('cópia, lock e arquivo da API no sha do contrato: confere', async () => {
    global.fetch = upstream(copy);
    await expect(api.checkCountries({ sha }, { lock, copy })).resolves.toEqual([]);
    expect(global.fetch.mock.calls[0][0]).toBe(
      `https://raw.githubusercontent.com/Fluveny/fluveny-api/${sha}/content/schema/countries.json`,
    );
  });

  it('cópia editada à mão: falha citando a cópia', async () => {
    global.fetch = upstream(copy);
    const failures = await api.checkCountries({ sha }, { lock, copy: copy + ' ' });
    expect(failures).toEqual([expect.stringContaining('src/player/countries.json não bate')]);
  });

  it('lock noutro sha que o do contrato: falha', async () => {
    global.fetch = upstream(copy);
    const failures = await api.checkCountries({ sha: 'd'.repeat(40) }, { lock, copy });
    expect(failures).toEqual([expect.stringContaining('sha do contrato')]);
  });

  it('lock com o path dos vetores: recusa', async () => {
    global.fetch = upstream(copy);
    const failures = await api.checkCountries(
      { sha },
      { lock: { ...lock, path: 'content/schema/render-vectors.json' }, copy },
    );
    expect(failures).toEqual([expect.stringContaining('countries.lock inválido')]);
  });

  it('os arquivos gravados pelo api:sync conferem com o lock do contrato', async () => {
    const { readFileSync } = require('node:fs');
    const committed = readFileSync(api.COUNTRIES_COPY, 'utf8');
    global.fetch = upstream(committed);
    await expect(api.checkCountries(api.readLock())).resolves.toEqual([]);
  });
});

describe('api: apiImage()', () => {
  it('é a tag sha-<sha completo> que a CI da API publica no GHCR', () => {
    const sha = 'b'.repeat(40);
    expect(api.apiImage(sha)).toBe(`ghcr.io/fluveny/fluveny-api:sha-${sha}`);
  });

  it('recusa sha curto', () => {
    expect(() => api.apiImage('bbbbbbb')).toThrow('40 hex');
  });

  it('a mensagem de imagem ausente manda rodar api:sync e não pede docker login', () => {
    const message = api.missingImageMessage('ghcr.io/fluveny/fluveny-api:sha-x');
    expect(message).toContain('npm run api:sync');
    expect(message).not.toContain('docker login');
  });
});

describe('bundle-budget (1.22)', () => {
  const html =
    '<html><head><link rel="manifest" href="/manifest.json"/></head><body>' +
    '<script src="/_expo/static/js/web/__expo-metro-runtime-aa.js" defer></script>' +
    '<script defer src="/_expo/static/js/web/entry-bb.js"></script></body></html>';

  it('scriptsOf: os src dos <script>, sem a barra inicial', () => {
    expect(budget.scriptsOf(html)).toEqual([
      '_expo/static/js/web/__expo-metro-runtime-aa.js',
      '_expo/static/js/web/entry-bb.js',
    ]);
  });

  it('asyncChunksOf: os chunks do mapa de import() do bundle, sem repetir', () => {
    const entry =
      'x={paths:{"760":"/_expo/static/js/web/em-breve-c1.js","761":"/_expo/static/js/web/index-cb.js"}};' +
      'y={paths:{"761":"/_expo/static/js/web/index-cb.js"}}';
    expect(budget.asyncChunksOf(entry)).toEqual(['em-breve-c1.js', 'index-cb.js']);
  });

  it('routeChunks: o chunk do layout raiz e o das boas-vindas', () => {
    const files = ['_layout-e6.js', 'index-cb.js', 'player-76.js', 'kit-25.js', 'entry-bb.js'];
    expect(budget.routeChunks(files)).toEqual(['_expo/static/js/web/_layout-e6.js', '_expo/static/js/web/index-cb.js']);
  });

  it('routeChunks: rota sem chunk ou com mais de um falha, em vez de medir errado', () => {
    expect(() => budget.routeChunks(['index-cb.js'])).toThrow('Rota "_layout": 0 chunks');
    expect(() => budget.routeChunks(['_layout-e6.js', '_layout-f7.js', 'index-cb.js'])).toThrow(
      'Rota "_layout": 2 chunks',
    );
  });

  it('dentro do limite: passa e imprime cada arquivo e o total', () => {
    const contents = { 'a.js': 'x'.repeat(10), 'b.js': 'y'.repeat(10) };
    const result = budget.measure(['a.js', 'b.js', 'a.js'], (path) => contents[path]);
    expect(result.files.map((file) => file.path)).toEqual(['a.js', 'b.js']);
    expect(result.total).toBe(budget.gzipSize(contents['a.js']) + budget.gzipSize(contents['b.js']));
    expect(result.ok).toBe(true);
    const text = budget.report(result);
    expect(text).toMatch(/dentro do limite/);
    expect(text).toMatch(/a\.js/);
    expect(text).toMatch(/total da primeira tela \(limite 500\.0 KB, gzip\)/);
  });

  it('acima do limite: não passa e lista os arquivos', () => {
    const { randomBytes } = require('node:crypto');
    const big = randomBytes(2000);
    const result = budget.measure(['grande.js'], () => big, 1000);
    expect(result.ok).toBe(false);
    expect(budget.report(result)).toMatch(/ESTOUROU[\s\S]*grande\.js/);
  });

  it('pwaProblems: o index.html liga o manifesto e o manifest.json está no dist', () => {
    expect(budget.pwaProblems(html, true)).toEqual([]);
    expect(budget.pwaProblems('<html><head></head></html>', true)).toEqual([
      expect.stringContaining('<link rel="manifest"'),
    ]);
    expect(budget.pwaProblems(html, false)).toEqual([expect.stringContaining('manifest.json fora do dist')]);
  });

  it('o limite é 500 KB', () => {
    expect(budget.LIMIT).toBe(500000);
  });
});
