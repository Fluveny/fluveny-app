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

  afterEach(() => {
    delete global.fetch;
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
