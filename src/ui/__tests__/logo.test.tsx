import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { render, screen } from '@testing-library/react-native';

import { Logo } from '../Logo';
import { LOGO_GRADIENT, LOGO_MARK_BLUE, LOGO_MARK_RED, LOGO_VIEWBOX, LOGO_WORDMARK } from '../logoPaths';
import { color } from '../tokens';

const svg = readFileSync(join(__dirname, '../../../assets/logo.svg'), 'utf8');

describe('logo (UX-DR8/127)', () => {
  it('os caminhos são os de assets/logo.svg', () => {
    const paths = [...svg.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]);
    expect(paths).toEqual([LOGO_WORDMARK, LOGO_MARK_BLUE, LOGO_MARK_RED]);
    expect(svg).toContain(`viewBox="0 0 ${LOGO_VIEWBOX.width} ${LOGO_VIEWBOX.height}"`);
    expect(svg).toContain(
      `x1="${LOGO_GRADIENT.x1}" y1="${LOGO_GRADIENT.y1}" x2="${LOGO_GRADIENT.x2}" y2="${LOGO_GRADIENT.y2}"`,
    );
  });

  it('as cores do arquivo são as dos tokens azul e vermelho', () => {
    const colors = new Set([...svg.matchAll(/(?:fill|stroke|stop-color)="(#[0-9A-Fa-f]{6})"/g)].map((m) => m[1]));
    expect([...colors].sort()).toEqual([color.blue, color.red].sort());
  });

  it('renderiza como imagem acessível, na proporção do arquivo', async () => {
    await render(<Logo width={240} />);
    const logo = screen.getByLabelText('Fluveny');
    expect(logo.props.height).toBeCloseTo((240 * LOGO_VIEWBOX.height) / LOGO_VIEWBOX.width);
  });
});
