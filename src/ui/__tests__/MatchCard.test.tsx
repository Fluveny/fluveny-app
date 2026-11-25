import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { CARD_TONES } from '../Card';
import { MatchCard, type MatchState } from '../MatchCard';
import { color, size } from '../tokens';
import { styleOf, touchHeight } from '../../test-utils/kit';

describe('MatchCard (cartão ligável do Associar)', () => {
  it('papel botão, área de toque ≥ 48, texto sem corte e selo vazio sem par', async () => {
    const onPress = jest.fn();
    await render(<MatchCard label="Where are you from?" onPress={onPress} testID="card" />);
    const card = screen.getByRole('button', { name: 'Where are you from?' });
    expect(card).not.toBeSelected();
    expect(touchHeight(card)).toBeGreaterThanOrEqual(size.touchMin);
    expect(styleOf(card).height).toBeUndefined();
    expect(screen.getByText('Where are you from?').props.numberOfLines).toBeUndefined();
    const badge = screen.getByTestId('card-badge');
    expect(styleOf(badge)).toEqual(
      expect.objectContaining({ backgroundColor: color.surface, borderColor: color.line }),
    );
    await fireEvent.press(card);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('text: desenha o nó no lugar do label, e o leitor ouve o label', async () => {
    await render(<MatchCard label="Nice to meet you too!" text={<Text>formatado</Text>} onPress={() => {}} />);
    expect(screen.getByText('formatado')).toBeTruthy();
    expect(screen.getByRole('button').props.accessibilityLabel).toBe('Nice to meet you too!');
  });

  it('selected: tom azul e anunciada como selecionada', async () => {
    await render(<MatchCard label="Hi!" state="selected" onPress={() => {}} />);
    const card = screen.getByRole('button', { name: 'Hi!' });
    expect(card).toBeSelected();
    expect(styleOf(card).backgroundColor).toBe(CARD_TONES.selected.background);
  });

  it('paired: branca, número no selo azul claro e "matched with …" no rótulo', async () => {
    await render(
      <MatchCard label="Hi!" state="paired" pair={2} pairedWith="Hi Alex!" onPress={() => {}} testID="card" />,
    );
    const card = screen.getByRole('button', { name: 'Hi!, matched with Hi Alex!' });
    expect(card).not.toBeSelected();
    expect(styleOf(card).backgroundColor).toBe(CARD_TONES.neutral.background);
    const number = screen.getByText('2');
    expect(styleOf(number).color).toBe(color.blueDk);
    expect(styleOf(screen.getByTestId('card-badge'))).toEqual(
      expect.objectContaining({ backgroundColor: color.blueLt, borderColor: color.blueMd }),
    );
  });

  it.each([
    ['wrong', 'wrong', 'icon-x'],
    ['right', 'right', 'icon-check'],
  ] as [Extract<MatchState, 'right' | 'wrong'>, string, string][])(
    'avaliada %s: ícone, número mantido, "%s" no rótulo e travada',
    async (state, word, icon) => {
      const onPress = jest.fn();
      await render(<MatchCard label="Hi!" state={state} pair={1} pairedWith="Goodbye!" locked onPress={onPress} />);
      const card = screen.getByRole('button', { name: `Hi!, matched with Goodbye!, ${word}` });
      expect(card).toBeDisabled();
      expect(screen.getByText('1')).toBeTruthy();
      expect(screen.getByTestId(icon, { includeHiddenElements: true })).toBeTruthy();
      expect(styleOf(card).backgroundColor).toBe(CARD_TONES[state].background);
      expect(styleOf(screen.getByText('Hi!')).color).toBe(state === 'wrong' ? color.redDk : color.ink);
      await fireEvent.press(card);
      expect(onPress).not.toHaveBeenCalled();
    },
  );
});
