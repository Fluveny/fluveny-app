// Tokens da direção A · Chunky Campus, escritos a partir do frontmatter do
// DESIGN.md (cópia em ./design.yaml). O teste tokens.test.ts compara cada valor
// com o YAML. Este é o único lugar do App com cor em hex ou número de design:
// telas e componentes importam daqui (regra `fluveny/no-hex-color` no eslint).
import type { TextStyle } from 'react-native';

export const color = {
  blue: '#155DFC',
  blueDk: '#0B3FB8',
  blueMd: '#D5E2FF',
  blueLt: '#E8EFFF',
  red: '#E7000B',
  redDk: '#A30008',
  redLt: '#FFE8E9',
  gold: '#FFC83D',
  goldDk: '#D99A00',
  goldLt: '#FFF1CC',
  goldText: '#7A5A00',
  teal: '#00B39A',
  tealDk: '#00806E',
  tealLt: '#E0F7F3',
  ink: '#14213D',
  muted: '#6A7591',
  mutedStrong: '#5B6680',
  faint: '#A2ABBF',
  line: '#E1E7F2',
  lineDk: '#CDD5E3',
  surface: '#FFFFFF',
  canvas: '#F3F6FC',
  wall: '#D9E6FF',
  paper: '#FFFBEF',
  paperLine: '#F3E3B5',
  scrim: 'rgba(20,33,61,0.45)',
} as const;

export type ColorToken = keyof typeof color;

/**
 * Famílias carregadas no layout raiz, uma por peso (no Android, o peso vem do
 * arquivo da fonte, não de `fontWeight`). Só Montserrat, de 500 a 900.
 */
export const fontFamily = {
  500: 'Montserrat_500Medium',
  600: 'Montserrat_600SemiBold',
  700: 'Montserrat_700Bold',
  800: 'Montserrat_800ExtraBold',
  900: 'Montserrat_900Black',
} as const;

export type FontWeight = keyof typeof fontFamily;

type Type = {
  fontFamily: (typeof fontFamily)[FontWeight];
  fontWeight: `${FontWeight}`;
  fontSize: number;
  lineHeight?: number;
  letterSpacing?: number;
};

function type(weight: FontWeight, fontSize: number, lineHeight?: number, letterSpacing?: number): Type {
  return {
    fontFamily: fontFamily[weight],
    fontWeight: `${weight}`,
    fontSize,
    ...(lineHeight === undefined ? {} : { lineHeight }),
    ...(letterSpacing === undefined ? {} : { letterSpacing }),
  };
}

export const typography = {
  display: type(900, 30, 34, -0.5),
  h1: type(900, 28, 32, -0.6),
  wordHero: type(900, 32, 36, -0.5),
  title: type(900, 22, 28, -0.3),
  target: type(800, 21, 28, -0.2),
  bubble: type(700, 17, 25),
  item: type(800, 16, 22),
  body: type(500, 15, 22),
  bodyStrong: type(600, 15, 22),
  reading: type(600, 16.5, 27),
  button: type(900, 15, undefined, 1.3),
  buttonSmall: type(900, 13, undefined, 1.3),
  meta: type(700, 13, 19),
  eyebrow: type(800, 11, undefined, 1.1),
  caption: type(600, 12, 18),
  wordmark: type(900, 34, undefined, 2),
} as const satisfies Record<string, TextStyle>;

export type TypographyToken = keyof typeof typography;

export const rounded = {
  sm: 9,
  chip: 14,
  md: 16,
  lg: 20,
  xl: 26,
  sheet: 28,
  full: 9999,
} as const;

export const spacing = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  half: 10,
  screenX: 20,
  sceneInset: 14,
  edgeButton: 5,
  edgeCard: 4,
  edgeChip: 3,
} as const;

/** Altura da sombra sólida por nível (DESIGN.md, Elevation & Depth; UX-DR15). */
export const edge = {
  button: spacing.edgeButton,
  buttonSmall: 4,
  mic: 8,
  card: spacing.edgeCard,
  chip: spacing.edgeChip,
} as const;

/** Medidas de componente do DESIGN.md (`components`). As alturas são da face, sem a sombra sólida. */
export const size = {
  buttonHeight: 54,
  buttonSmallHeight: 46,
  buttonPaddingX: 18,
  /** Ícone opcional à esquerda do rótulo (DESIGN.md, Components). */
  buttonIcon: 20,
  /** Borda de cartões, chips e do botão ghost (`2px solid`). */
  border: 2,
  cardPadding: 14,
  xpChipRadius: 12,
  xpChipPaddingTop: 6,
  xpChipPaddingRight: 10,
  xpChipPaddingBottom: 6,
  xpChipPaddingLeft: 8,
  /** Estrela do chip de XP [ASSUMPTION: 16 px, como no protótipo; o DESIGN.md não fixa]. */
  xpChipIcon: 16,
  /** Ícone ✓/✕ de estado no cartão [ASSUMPTION: 20, como o ícone do botão]. */
  stateIcon: 20,
  /** Ícone ✓/✕ de estado no chip de palavra [ASSUMPTION: 16, cabe na face de 44]. */
  stateIconSmall: 16,
  progressHeight: 16,
  progressMinFill: 26,
  wordChipHeight: 44,
  wordChipPaddingX: 14,
  modeTagPaddingY: 6,
  modeTagPaddingX: 10,
  modeTagLetterSpacing: 1.3,
  /** Área de toque mínima (EXPERIENCE.md, Accessibility Floor; UX-DR137). */
  touchMin: 48,
  /** Campo de texto (`text-field.height`); a altura é mínima e cresce com a fonte. */
  textFieldHeight: 54,
  /** [ASSUMPTION: 16; o `text-field` do DESIGN.md não tem `padding`]. */
  textFieldPaddingX: 16,
  /** Anel de foco do campo (`text-field.focusRing`: `0 0 0 4px`). */
  focusRing: 4,
  /** Avatar circular de Alex ao lado do balão (DESIGN.md, Components: 58–64 px). */
  avatar: 60,
  /** Anel branco do avatar [ASSUMPTION: 3, como no protótipo]. */
  avatarRing: 3,
  /** Lado do quadrado girado 45° do rabicho do balão [ASSUMPTION: o DESIGN.md não fixa]. */
  bubbleTail: 14,
  /** Alex em cena, no Diálogo (EXPERIENCE.md, Narrativa e cenas: 205 dp). */
  alexInScene: 205,
  /** Selo da letra A–D da alternativa [ASSUMPTION: 30, como no protótipo]. */
  choiceLetter: 30,
  /** Cantos do topo da folha branca da boas-vindas (DESIGN.md, Shapes: 30–32 px; 32 como no protótipo). */
  welcomeSheetRadius: 32,
  /** Bloco do ícone da folha de feedback (`feedback-sheet.iconTile`). */
  sheetIconTile: 44,
  /** Recuo da folha de feedback (`feedback-sheet.padding`: 20 20 18). */
  sheetPaddingTop: 20,
  sheetPaddingX: 20,
  sheetPaddingBottom: 18,
  /** Alex `cheer` espiando por cima da folha de Acerto [ASSUMPTION: 96; o DESIGN.md não fixa]. */
  sheetAlex: 96,
  /** Microfone (`mic-button.size`) e os halos de fora e de dentro (DESIGN.md, Components: 226 e 176). */
  mic: 132,
  micHaloOuter: 226,
  micHaloInner: 176,
  /** Ícone dentro do microfone [ASSUMPTION: 52; o DESIGN.md não fixa]. */
  micIcon: 52,
  /** Alex `cheer` no Resumo do Estágio (1.20) [ASSUMPTION: 190, como no protótipo; o DESIGN.md não fixa]. */
  stageAlex: 190,
  /** Papel do confete (1.20) [ASSUMPTION: 10 × 16 com cantos de 3, como no protótipo]. */
  confettiWidth: 10,
  confettiHeight: 16,
  confettiRadius: 3,
  /** Quanto o confete cai, do topo da caixa [ASSUMPTION: 420, como no protótipo]. */
  confettiFall: 420,
  /** Caixa de seleção do aceite (2.1) [ASSUMPTION: 28; o DESIGN.md não tem `checkbox`]. */
  checkbox: 28,
  /** ✓ dentro da caixa de seleção [ASSUMPTION: 18]. */
  checkboxIcon: 18,
} as const;

/** Altura da cena do Diálogo (DESIGN.md, Layout & Spacing): cerca de 46% da tela, entre 300 e 420 dp. */
export const scene = {
  min: 300,
  max: 420,
  ratio: 0.46,
} as const;

/** Cores translúcidas de componente que não são da paleta (`components`). */
export const overlay = {
  progressHighlight: 'rgba(255,255,255,0.4)',
  /** Anel de foco do campo de texto: azul a 14% (`text-field.focusRing`). */
  focusRing: 'rgba(21,93,252,0.14)',
} as const;

/** Coluna do App: retrato, centralizada até 440 dp (UX-DR12). 360 dp é a menor largura suportada, não um piso. */
export const layout = {
  columnMax: 440,
} as const;

export { solid, sunk, type SolidStyle } from './shadow';
