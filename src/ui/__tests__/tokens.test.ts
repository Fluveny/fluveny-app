import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parse } from 'yaml';

import { color, edge, fontFamily, rounded, size, solid, spacing, sunk, typography } from '../tokens';

const ROOT = join(__dirname, '../../..');
const design = parse(readFileSync(join(ROOT, 'src/ui/tokens/design.yaml'), 'utf8'));

const camel = (key: string) => key.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
const px = (value: string) => {
  const match = /^(-?\d+(?:\.\d+)?)px$/.exec(String(value));
  if (!match) throw new Error(`valor sem px: ${value}`);
  return Number(match[1]);
};

describe('tokens vs. DESIGN.md (design.yaml)', () => {
  it('cores: as mesmas chaves e os mesmos valores', () => {
    const expected = Object.fromEntries(Object.entries(design.colors).map(([k, v]) => [camel(k), v]));
    expect(color).toEqual(expected);
  });

  it('tipografia: tamanho, peso (família), altura de linha e espaçamento', () => {
    const expected = Object.fromEntries(
      Object.entries(design.typography as Record<string, Record<string, string | number>>).map(([k, t]) => {
        expect(t.fontFamily).toBe('Montserrat');
        const weight = Number(t.fontWeight) as keyof typeof fontFamily;
        return [
          camel(k),
          {
            fontFamily: fontFamily[weight],
            fontWeight: String(weight),
            fontSize: px(String(t.fontSize)),
            ...(t.lineHeight === undefined ? {} : { lineHeight: px(String(t.lineHeight)) }),
            ...(t.letterSpacing === undefined ? {} : { letterSpacing: px(String(t.letterSpacing)) }),
          },
        ];
      }),
    );
    expect(typography).toEqual(expected);
  });

  it('só Montserrat de 500 a 900', () => {
    expect(Object.keys(fontFamily)).toEqual(['500', '600', '700', '800', '900']);
    for (const family of Object.values(fontFamily)) expect(family).toMatch(/^Montserrat_/);
  });

  it('raios e espaços', () => {
    expect(rounded).toEqual(Object.fromEntries(Object.entries(design.rounded).map(([k, v]) => [camel(k), px(String(v))])));
    expect(spacing).toEqual(Object.fromEntries(Object.entries(design.spacing).map(([k, v]) => [camel(k), px(String(v))])));
  });

  it('alturas da sombra sólida e medidas de componente (UX-DR15)', () => {
    const c = design.components;
    expect(edge).toEqual({
      button: px(design.spacing['edge-button']),
      buttonSmall: px(c['button-small'].edgeHeight),
      mic: px(c['mic-button'].edgeHeight),
      card: px(design.spacing['edge-card']),
      chip: px(design.spacing['edge-chip']),
    });
    expect(size).toEqual({
      buttonHeight: px(c['button-primary'].height),
      buttonSmallHeight: px(c['button-small'].height),
    });
  });

  const planning = join(ROOT, '../_bmad-output/planning-artifacts/ux-designs/ux-Fluveny-2026-11-13/DESIGN.md');
  (existsSync(planning) ? it : it.skip)('design.yaml é a cópia do frontmatter do DESIGN.md do planejamento', () => {
    const markdown = readFileSync(planning, 'utf8');
    const front = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/)?.[1];
    expect(parse(front ?? '')).toEqual(design);
  });
});

describe('sombra sólida e afundar (UX-DR15/16)', () => {
  // No RN a borda fica dentro da caixa: o espaço ocupado é borda inferior + margem inferior.
  const occupied = (s: { borderBottomWidth?: number; marginBottom?: unknown }) =>
    (s.borderBottomWidth ?? 0) + Number(s.marginBottom ?? 0);
  const translateY = (s: { transform?: unknown }) =>
    ((s.transform as { translateY?: number }[] | undefined)?.[0]?.translateY ?? 0);

  it('normal: borda inferior na cor escura, sem desfoque nem deslocamento', () => {
    const raised = solid(color.blueDk, edge.button);
    expect(raised.borderBottomWidth).toBe(edge.button);
    expect(raised.borderBottomColor).toBe(color.blueDk);
    expect(translateY(raised)).toBe(0);
  });

  it('afundado: a sombra some, o elemento desce a altura dela e o espaço ocupado não muda', () => {
    const raised = solid(color.blueDk, edge.button);
    const pressed = sunk(edge.button);
    expect(pressed.borderBottomWidth).toBe(0);
    expect(translateY(pressed)).toBe(edge.button);
    expect(occupied(pressed)).toBe(occupied(raised));
    expect(pressed).not.toHaveProperty('marginTop');
  });
});
