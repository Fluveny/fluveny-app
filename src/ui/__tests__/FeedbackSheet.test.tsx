import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { AccessibilityInfo, Animated, Text } from 'react-native';
import { parse } from 'yaml';

import {
  EXPECTED_LABEL,
  FEEDBACK_TITLES,
  FEEDBACK_TONES,
  FeedbackSheet,
  resultLine,
  WRONG_MESSAGE,
  type FeedbackTone,
} from '../FeedbackSheet';
import { color, rounded, size } from '../tokens';
import { styleOf, touchHeight } from '../../test-utils/kit';

const design: unknown = parse(readFileSync(join(__dirname, '../tokens/design.yaml'), 'utf8'));
const sheetTokens = (design as { components: Record<string, Record<string, string>> }).components['feedback-sheet']!;

let announce: jest.SpyInstance;
let focus: jest.SpyInstance;

beforeEach(() => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  focus = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

const CONTINUE = { label: 'CONTINUAR', variant: 'success' as const, onPress: jest.fn() };

describe('FeedbackSheet', () => {
  it('cores dos tons seguem o feedback-sheet do DESIGN.md', () => {
    expect(sheetTokens['tone-right']).toBe('{colors.teal-dk}');
    expect(FEEDBACK_TONES.correct.title).toBe(color.tealDk);
    expect(sheetTokens['tone-wrong']).toBe('{colors.red}');
    expect(FEEDBACK_TONES.wrong.title).toBe(color.red);
    expect(sheetTokens['tone-revealed']).toBe('{colors.blue}');
    expect(FEEDBACK_TONES.review.title).toBe(color.blue);
  });

  it.each(['correct', 'wrong', 'review'] as FeedbackTone[])(
    'tom %s: título na cor do tom e ícone do tom',
    async (tone) => {
      await render(<FeedbackSheet tone={tone} actions={[CONTINUE]} />);
      const title = screen.getByText(FEEDBACK_TITLES[tone]);
      expect(styleOf(title).color).toBe(FEEDBACK_TONES[tone].title);
      expect(screen.getByTestId(`icon-${FEEDBACK_TONES[tone].icon}`, { includeHiddenElements: true })).toBeTruthy();
      const sheet = styleOf(screen.getByTestId('feedback-sheet'));
      expect(sheet.borderTopLeftRadius).toBe(rounded.sheet);
      expect(sheet.backgroundColor).toBe(color.surface);
    },
  );

  it('Acerto: Alex cheer e selo "+10 XP"; sem XP, sem selo', async () => {
    await render(<FeedbackSheet tone="correct" xpGain={10} actions={[CONTINUE]} />);
    expect(screen.getByTestId('alex-cheer')).toBeTruthy();
    expect(screen.getByLabelText('+10 XP')).toBeTruthy();
    await render(<FeedbackSheet tone="correct" xpGain={0} actions={[CONTINUE]} />);
    expect(screen.queryByTestId('xp-chip-light')).toBeNull();
    await render(<FeedbackSheet tone="correct" actions={[CONTINUE]} />);
    expect(screen.queryByTestId('xp-chip-light')).toBeNull();
  });

  it('Erro: sem Alex nem selo, texto padrão, linha de Resultado e botões empilhados de 48 dp', async () => {
    const retry = jest.fn();
    await render(
      <FeedbackSheet
        tone="wrong"
        xpGain={10}
        result={resultLine(2, 3, 67)}
        actions={[
          { label: 'TENTAR DE NOVO', variant: 'primary', onPress: retry },
          { label: 'VER RESPOSTA', variant: 'ghost', onPress: jest.fn() },
        ]}
      />,
    );
    expect(screen.queryByTestId('alex-cheer')).toBeNull();
    expect(screen.queryByTestId('xp-chip-light')).toBeNull();
    expect(screen.getByText(WRONG_MESSAGE)).toBeTruthy();
    expect(screen.getByText('Resultado: 2 de 3 itens · 67%')).toBeTruthy();
    for (const name of ['TENTAR DE NOVO', 'VER RESPOSTA']) {
      expect(touchHeight(screen.getByRole('button', { name }))).toBeGreaterThanOrEqual(size.touchMin);
    }
    await fireEvent.press(screen.getByRole('button', { name: 'TENTAR DE NOVO' }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(WRONG_MESSAGE).not.toMatch(/^Errado|incorret/i);
  });

  it('Vamos revisar: caixa "RESPOSTA ESPERADA" em blue-lt, justificativa e erro anunciado', async () => {
    await render(
      <FeedbackSheet
        tone="review"
        expected={<Text>Good morning</Text>}
        error="Sem conexão."
        actions={[{ label: 'CONTINUAR', variant: 'primary', onPress: jest.fn() }]}
      >
        <Text>Justificativa</Text>
      </FeedbackSheet>,
    );
    const box = screen.getByTestId('feedback-expected');
    expect(styleOf(box).backgroundColor).toBe(color.blueLt);
    expect(within(box).getByText(EXPECTED_LABEL)).toBeTruthy();
    expect(within(box).getByText('Good morning')).toBeTruthy();
    expect(screen.getByText('Justificativa')).toBeTruthy();
    expect(screen.getByRole('alert')).toHaveTextContent('Sem conexão.');
  });

  it('a caixa da resposta esperada só aparece em "Vamos revisar"', async () => {
    await render(<FeedbackSheet tone="wrong" expected={<Text>Good morning</Text>} actions={[CONTINUE]} />);
    expect(screen.queryByText(EXPECTED_LABEL)).toBeNull();
  });

  it('recebe o foco e anuncia título e Resultado; de novo quando o tom muda', async () => {
    const { rerender } = await render(
      <FeedbackSheet tone="wrong" result={resultLine(1, 3, 33)} actions={[CONTINUE]} />,
    );
    const header = screen.getByRole('header');
    expect(header.props.accessibilityLabel).toBe('Quase lá! Resultado: 1 de 3 itens · 33%');
    expect(announce).toHaveBeenCalledWith('Quase lá! Resultado: 1 de 3 itens · 33%');
    expect(focus).toHaveBeenCalledWith(expect.anything(), 'focus');
    await rerender(<FeedbackSheet tone="review" actions={[CONTINUE]} />);
    expect(announce).toHaveBeenLastCalledWith('Vamos revisar');
  });

  it('sobe com mola', async () => {
    const spring = jest.spyOn(Animated, 'spring');
    await render(<FeedbackSheet tone="correct" actions={[CONTINUE]} />);
    await act(async () => {});
    expect(spring).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ toValue: 0 }));
  });

  it('com "remover animações": aparece direto, sem mola', async () => {
    (AccessibilityInfo.isReduceMotionEnabled as jest.Mock).mockResolvedValue(true);
    const spring = jest.spyOn(Animated, 'spring');
    await render(<FeedbackSheet tone="correct" actions={[CONTINUE]} />);
    await act(async () => {});
    expect(spring).not.toHaveBeenCalled();
    const transform = styleOf(screen.getByTestId('feedback-sheet')).transform as { translateY: number }[];
    expect(transform[0]?.translateY).toBe(0);
  });
});
