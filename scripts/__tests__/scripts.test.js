const api = require('../lib/api.cjs');
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
    expect(failures).toEqual([expect.stringContaining('não são os do lock')]);
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
