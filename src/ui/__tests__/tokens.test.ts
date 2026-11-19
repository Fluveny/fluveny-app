import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parse } from 'yaml';

import { color, edge, fontFamily, overlay, rounded, scene, size, solid, spacing, sunk, typography } from '../tokens';

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
    expect(rounded).toEqual(
      Object.fromEntries(Object.entries(design.rounded).map(([k, v]) => [camel(k), px(String(v))])),
    );
    expect(spacing).toEqual(
      Object.fromEntries(Object.entries(design.spacing).map(([k, v]) => [camel(k), px(String(v))])),
    );
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
    const border = (value: string) => px(String(value).split(' ')[0] ?? '');
    const box = (value: string) => String(value).split(' ').map(px);
    const [xpTop, xpRight, xpBottom, xpLeft] = box(c['xp-chip'].padding);
    const [tagY, tagX] = box(c['mode-tag'].padding);
    const [sheetTop, sheetX, sheetBottom] = box(c['feedback-sheet'].padding);
    // `0 0 0 4px rgba(...)`: os três primeiros são zero, o quarto é a espessura do anel.
    const ring = /^0 0 0 (\d+px) (rgba\([^)]+\))$/.exec(String(c['text-field'].focusRing));
    expect(ring).not.toBeNull();
    expect(size).toEqual({
      buttonHeight: px(c['button-primary'].height),
      buttonSmallHeight: px(c['button-small'].height),
      buttonPaddingX: px(c['button-primary'].paddingX),
      buttonIcon: 20, // DESIGN.md, Components: "ícone opcional de 20 px à esquerda"
      border: border(c.card.border),
      cardPadding: px(c.card.padding),
      xpChipRadius: px(c['xp-chip'].rounded),
      xpChipPaddingTop: xpTop,
      xpChipPaddingRight: xpRight,
      xpChipPaddingBottom: xpBottom,
      xpChipPaddingLeft: xpLeft,
      xpChipIcon: 16, // [ASSUMPTION] protótipo
      stateIcon: 20, // [ASSUMPTION] ✓/✕ do cartão
      stateIconSmall: 16, // [ASSUMPTION] ✓/✕ do chip de palavra
      progressHeight: px(c['progress-bar'].height),
      progressMinFill: px(c['progress-bar'].minFill),
      wordChipHeight: px(c['word-chip'].height),
      wordChipPaddingX: px(c['word-chip'].paddingX),
      modeTagPaddingY: tagY,
      modeTagPaddingX: tagX,
      modeTagLetterSpacing: px(c['mode-tag'].letterSpacing),
      touchMin: 48, // EXPERIENCE.md, Accessibility Floor
      textFieldHeight: px(c['text-field'].height),
      textFieldPaddingX: px(design.spacing['4']),
      focusRing: px(ring?.[1] ?? ''),
      avatar: 60, // DESIGN.md, Components: "avatar circular de Alex (58–64 px)"
      avatarRing: 3, // [ASSUMPTION] protótipo
      bubbleTail: 14, // [ASSUMPTION] rabicho
      alexInScene: 205, // EXPERIENCE.md, Narrativa e cenas
      choiceLetter: 30, // [ASSUMPTION] protótipo
      welcomeSheetRadius: 32, // DESIGN.md, Shapes: "o topo da tela de boas-vindas ... 30–32 px"
      sheetIconTile: px(c['feedback-sheet'].iconTile),
      sheetPaddingTop: sheetTop,
      sheetPaddingX: sheetX,
      sheetPaddingBottom: sheetBottom,
      sheetAlex: 96, // [ASSUMPTION] Alex espiando a folha de Acerto
      mic: px(c['mic-button'].size),
      micHaloOuter: 226, // DESIGN.md, Components: halos de 226 e 176 px
      micHaloInner: 176,
      micIcon: 52, // [ASSUMPTION] ícone do microfone
      stageAlex: 190, // [ASSUMPTION] Alex cheer do Resumo do Estágio, protótipo
      confettiWidth: 10, // [ASSUMPTION] papel do confete, protótipo
      confettiHeight: 16,
      confettiRadius: 3,
      confettiFall: 420,
      checkbox: 28, // [ASSUMPTION] caixa do aceite (2.1)
      checkboxIcon: 18,
    });
    expect(size.avatar).toBeGreaterThanOrEqual(58);
    expect(size.avatar).toBeLessThanOrEqual(64);
    // Campo e balão seguem o DESIGN.md: borda, raio e tipo.
    expect(border(c['text-field'].border)).toBe(size.border);
    expect(border(c['text-field']['border-focus'])).toBe(size.border);
    expect(c['text-field'].rounded).toBe('{rounded.md}');
    expect(c['text-field'].type).toBe('{typography.item}');
    expect(border(c['speech-bubble'].border)).toBe(size.border);
    expect(px(c['speech-bubble'].padding)).toBe(size.cardPadding);
    expect(c['speech-bubble'].rounded).toBe('{rounded.lg}');
    expect(c['speech-bubble'].type).toBe('{typography.bubble}');
    expect(c['speech-bubble'].speaker).toBe('{colors.red}');
    // Todas as bordas de componente têm a mesma espessura.
    for (const key of ['button-ghost', 'card', 'word-chip', 'word-chip-placed', 'word-chip-right', 'word-chip-wrong']) {
      expect(border(c[key].border)).toBe(size.border);
    }
    expect(overlay).toEqual({ progressHighlight: c['progress-bar'].highlight, focusRing: ring?.[2] });
  });

  it('cena do Diálogo: recuo de 14, cerca de 46% da tela, entre 300 e 420 (DESIGN.md, Layout & Spacing)', () => {
    expect(px(design.spacing['scene-inset'])).toBe(spacing.sceneInset);
    expect(scene).toEqual({ min: 300, max: 420, ratio: 0.46 });
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
    (s.transform as { translateY?: number }[] | undefined)?.[0]?.translateY ?? 0;

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
