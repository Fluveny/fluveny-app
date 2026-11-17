import { fireEvent, render, screen } from '@testing-library/react-native';

import { GAP_FIELD_WIDTH, GAP_MIN_WIDTH, GapSlot, gapLabel } from '../GapSlot';
import { WORD_CHIP_STATES } from '../WordChip';
import { color, edge, size } from '../tokens';
import { styleOf } from '../../test-utils/kit';

describe('GapSlot (lacuna do Completar lacunas)', () => {
  it('rótulo do leitor: "Lacuna n: valor" ou "Lacuna n, vazia"', () => {
    expect(gapLabel(2, 'your')).toBe('Lacuna 2: your');
    expect(gapLabel(2, '  ')).toBe('Lacuna 2, vazia');
    expect(gapLabel(1, null)).toBe('Lacuna 1, vazia');
  });

  it('banco, vazia: espaço do tamanho do chip, borda tracejada line-dk, sem toque', async () => {
    await render(<GapSlot kind="bank" index={1} testID="gap" />);
    const gap = screen.getByTestId('gap');
    expect(gap.props.accessibilityLabel).toBe('Lacuna 1, vazia');
    expect(gap.props.accessibilityRole).toBeUndefined();
    expect(styleOf(gap)).toEqual(
      expect.objectContaining({
        borderStyle: 'dashed',
        borderColor: color.lineDk,
        borderWidth: size.border,
        minWidth: GAP_MIN_WIDTH,
        height: size.wordChipHeight + edge.chip,
      }),
    );
  });

  it('banco, preenchida: o chip placed com a palavra; o toque esvazia', async () => {
    const onPress = jest.fn();
    await render(<GapSlot kind="bank" index={1} state="filled" value="am" onPress={onPress} testID="gap" />);
    const gap = screen.getByRole('button', { name: 'Lacuna 1: am' });
    expect(gap).toBeSelected();
    expect(screen.getByText('am').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ color: WORD_CHIP_STATES.placed.label })]),
    );
    await fireEvent.press(gap);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['right', 'certo'],
    ['wrong', 'errado'],
  ] as const)('banco, %s: o estado no rótulo e, travada, sem toque', async (state, word) => {
    const onPress = jest.fn();
    await render(<GapSlot kind="bank" index={2} state={state} value="meet" locked onPress={onPress} testID="gap" />);
    const gap = screen.getByTestId('gap');
    expect(gap.props.accessibilityLabel).toBe(`Lacuna 2: meet, ${word}`);
    expect(gap).toBeDisabled();
    await fireEvent.press(gap);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('digitada: campo curto, sem correção nem maiúscula automática, até 100 caracteres', async () => {
    const onChangeText = jest.fn();
    await render(<GapSlot kind="typed" index={1} value="" onChangeText={onChangeText} testID="gap" />);
    const field = screen.getByTestId('gap');
    expect(field.props).toMatchObject({
      autoCorrect: false,
      autoCapitalize: 'none',
      spellCheck: false,
      maxLength: 100,
      editable: true,
      accessibilityLabel: 'Lacuna 1, vazia',
    });
    expect(styleOf(field).width).toBe(GAP_FIELD_WIDTH);
    await fireEvent.changeText(field, 'am');
    expect(onChangeText).toHaveBeenCalledWith('am');
  });

  it('digitada, errada e travada: borda vermelha, "errado" no rótulo e sem edição', async () => {
    await render(
      <GapSlot kind="typed" index={3} state="wrong" locked value="is" onChangeText={() => {}} testID="gap" />,
    );
    const field = screen.getByTestId('gap');
    expect(field.props.editable).toBe(false);
    expect(field.props.accessibilityLabel).toBe('Lacuna 3: is, errado');
    expect(styleOf(field)).toEqual(expect.objectContaining({ borderColor: color.red, backgroundColor: color.redLt }));
  });

  it('digitada, com foco: borda azul', async () => {
    await render(<GapSlot kind="typed" index={1} value="" onChangeText={() => {}} testID="gap" />);
    await fireEvent(screen.getByTestId('gap'), 'focus', {});
    expect(styleOf(screen.getByTestId('gap')).borderColor).toBe(color.blue);
  });
});
