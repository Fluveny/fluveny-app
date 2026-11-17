// App web instalável (1.22): o manifesto, os ícones e as meta tags do index.html.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { color } from '../ui/tokens';

const root = join(__dirname, '..', '..');
const manifest = JSON.parse(readFileSync(join(root, 'public', 'manifest.json'), 'utf8'));
const html = readFileSync(join(root, 'public', 'index.html'), 'utf8');

describe('manifesto do App web', () => {
  it('nome, modo e início', () => {
    expect(manifest).toMatchObject({
      id: '/',
      lang: 'pt-BR',
      name: 'Fluveny',
      short_name: 'Fluveny',
      display: 'standalone',
      orientation: 'portrait',
      start_url: '/',
    });
  });

  it('cores dos tokens (DESIGN.md): fundo canvas, tema blue', () => {
    expect(manifest.background_color).toBe(color.canvas);
    expect(manifest.theme_color).toBe(color.blue);
  });

  it('ícones de 192 e 512 px e um maskable, todos no public/', () => {
    const icons: { src: string; sizes: string; purpose: string }[] = manifest.icons;
    expect(icons.map((icon) => `${icon.sizes} ${icon.purpose}`)).toEqual(
      expect.arrayContaining(['192x192 any', '512x512 any', '512x512 maskable']),
    );
    for (const icon of icons) expect(existsSync(join(root, 'public', icon.src))).toBe(true);
  });

  it('index.html liga o manifesto, o theme-color e o apple-touch-icon', () => {
    expect(html).toContain('<link rel="manifest" href="/manifest.json" />');
    expect(html).toContain(`<meta name="theme-color" content="${color.blue}" />`);
    const touch = html.match(/<link rel="apple-touch-icon" href="([^"]+)"/);
    expect(touch).not.toBeNull();
    expect(existsSync(join(root, 'public', touch![1] ?? ''))).toBe(true);
  });

  it('index.html em pt-BR, com as meta tags do iOS e sem sintaxe de JSX', () => {
    expect(html).toMatch(/<html lang="pt-BR">/);
    expect(html).toContain('<meta name="apple-mobile-web-app-capable" content="yes" />');
    expect(html).toContain('<meta name="apple-mobile-web-app-title" content="Fluveny" />');
    expect(html).not.toMatch(/httpEquiv/);
    expect(html).toMatch(/<noscript>Ative o JavaScript para usar o Fluveny\.<\/noscript>/);
  });

  it('o ícone maskable não é o mesmo arquivo do ícone comum (tem margem de segurança)', () => {
    const icon = (purpose: string) =>
      manifest.icons.find((i: { sizes: string; purpose: string }) => i.sizes === '512x512' && i.purpose === purpose)
        .src;
    const any = readFileSync(join(root, 'public', icon('any')));
    const maskable = readFileSync(join(root, 'public', icon('maskable')));
    expect(maskable.equals(any)).toBe(false);
  });

  it('sem service worker (FR-10): o index.html não registra nenhum', () => {
    expect(html).not.toMatch(/serviceWorker/);
  });
});
