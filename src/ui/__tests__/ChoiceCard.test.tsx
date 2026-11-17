import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { Text } from 'react-native';

import { CARD_TONES } from '../Card';
import { ChoiceCard, choiceLetter, type ChoiceState } from '../ChoiceCard';
import { color, size } from '../tokens';
import { styleOf, touchHeight } from '../../test-utils/kit';

const OPTIONS = ["I'm from Brazil.", 'I from Brazil.'];

function Choices() {
  const [pick, setPick] = useState<number | null>(null);
  return (
    <>
      {OPTIONS.map((o, i) => (
        <ChoiceCard
          key={o}
          index={i}
          label={o}
          state={pick === i ? 'selected' : 'neutral'}
          onPress={() => setPick(i)}
        />
      ))}
    </>
  );
}

describe('ChoiceCard (alternativa A–D)', () => {
  it('text: desenha o nó no lugar do label, e o leitor ouve o label', async () => {
    await render(<ChoiceCard index={1} label="Nice to meet you!" text={<Text>formatado</Text>} onPress={() => {}} />);
    expect(screen.getByText('formatado')).toBeTruthy();
    expect(screen.queryByText('Nice to meet you!')).toBeNull();
    expect(screen.getByRole('button').props.accessibilityLabel).toBe('B, Nice to meet you!');
  });

  it('papel botão, letra no rótulo, área de toque ≥ 48 e texto sem corte', async () => {
    await render(<ChoiceCard index={0} label="I'm from Brazil." onPress={() => {}} />);
    const card = screen.getByRole('button', { name: "A, I'm from Brazil." });
    expect(card).not.toBeSelected();
    expect(touchHeight(card)).toBeGreaterThanOrEqual(size.touchMin);
    expect(styleOf(card).height).toBeUndefined();
    const text = screen.getByText("I'm from Brazil.");
    expect(text.props.numberOfLines).toBeUndefined();
    expect(screen.getByText('A')).toBeTruthy();
  });

  it('toque em B: tom selected, accessibilityState.selected e letra B no rótulo', async () => {
    await render(<Choices />);
    await fireEvent.press(screen.getByRole('button', { name: 'B, I from Brazil.' }));
    const b = screen.getByRole('button', { name: 'B, I from Brazil.' });
    expect(b).toBeSelected();
    expect(styleOf(b).backgroundColor).toBe(CARD_TONES.selected.background);
    expect(screen.getByRole('button', { name: "A, I'm from Brazil." })).not.toBeSelected();
  });

  it.each([
    ['wrong', 'errado', 'icon-x'],
    ['right', 'certo', 'icon-check'],
  ] as [ChoiceState, string, string][])(
    'avaliada %s: ícone visível, "%s" no rótulo e travada',
    async (state, word, icon) => {
      const onPress = jest.fn();
      await render(<ChoiceCard index={2} label="She is from Brazil." state={state} locked onPress={onPress} />);
      const card = screen.getByRole('button', { name: `C, She is from Brazil., ${word}` });
      expect(card).toBeDisabled();
      expect(screen.getByTestId(icon, { includeHiddenElements: true })).toBeTruthy();
      expect(styleOf(card).backgroundColor).toBe(CARD_TONES[state].background);
      await fireEvent.press(card);
      expect(onPress).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['neutral', color.surface, color.line, color.muted],
    ['selected', color.blue, color.blue, color.surface],
    ['wrong', color.red, color.red, color.surface],
    ['right', color.teal, color.teal, color.ink],
  ] as [ChoiceState, string, string, string][])(
    'selo %s: fundo, borda e letra com contraste AA',
    async (state, background, border, letter) => {
      await render(<ChoiceCard index={1} label="I'm from Brazil." state={state} onPress={() => {}} />);
      const text = screen.getByText('B');
      expect(styleOf(text).color).toBe(letter);
      const badge = text.parent as unknown as { props: Record<string, unknown> };
      expect(styleOf(badge)).toEqual(expect.objectContaining({ backgroundColor: background, borderColor: border }));
      expect(styleOf(screen.getByText("I'm from Brazil.")).color).toBe(state === 'wrong' ? color.redDk : color.ink);
    },
  );

  it('letra fora de A–D (índice ≥ 4): erro em desenvolvimento', async () => {
    expect(choiceLetter(3)).toBe('D');
    expect(() => choiceLetter(4)).toThrow(/A–D/);
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(render(<ChoiceCard index={4} label="E" onPress={() => {}} />)).rejects.toThrow(/A–D/);
    spy.mockRestore();
  });
});
