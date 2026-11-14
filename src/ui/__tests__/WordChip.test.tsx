import { fireEvent, render, screen } from '@testing-library/react-native';

import { WORD_CHIP_STATES, WordChip, type WordChipState } from '../WordChip';
import { color, edge, size } from '../tokens';
import { edgeOf, styleOf, touchHeight } from '../../test-utils/kit';

describe('WordChip (UX-DR34)', () => {
  it('idle: botão com rótulo, face de 44 e área de toque estendida a 48 dp', async () => {
    await render(<WordChip label="coffee" onPress={() => {}} />);
    const chip = screen.getByRole('button', { name: 'coffee' });
    expect(chip).toBeEnabled();
    expect(chip).not.toBeSelected();
    expect(edgeOf(chip).minHeight).toBe(size.wordChipHeight + edge.chip);
    expect(touchHeight(chip)).toBeGreaterThanOrEqual(size.touchMin);
    expect(chip.props.hitSlop.left + chip.props.hitSlop.right + Number(styleOf(chip).minWidth)).toBeGreaterThanOrEqual(size.touchMin);
  });

  it('afunda a altura da sombra no toque, sem mover o layout', async () => {
    await render(<WordChip label="coffee" onPress={() => {}} />);
    const chip = () => screen.getByRole('button', { name: 'coffee' });
    const raised = edgeOf(chip());
    await fireEvent(chip(), 'pressIn');
    const pressed = edgeOf(chip());
    expect(pressed).toEqual(expect.objectContaining({ bottom: size.border, margin: edge.chip, translateY: edge.chip }));
    expect(pressed.occupied).toBe(raised.occupied);
  });

  it('placed: anunciado como selecionado, borda azul', async () => {
    await render(<WordChip label="your" state="placed" onPress={() => {}} />);
    const chip = screen.getByRole('button', { name: 'your' });
    expect(chip).toBeSelected();
    expect(styleOf(chip).borderColor).toBe(color.blue);
  });

  it('used: não dispara, sem sombra e anunciado como "usado"', async () => {
    const onPress = jest.fn();
    await render(<WordChip label="am" state="used" onPress={onPress} />);
    const chip = () => screen.getByRole('button', { name: 'am, usado' });
    expect(chip()).toBeDisabled();
    const before = edgeOf(chip());
    expect(before.bottom).toBe(size.border);
    expect(styleOf(chip()).borderBottomColor).toBe(color.line);
    await fireEvent(chip(), 'pressIn');
    expect(edgeOf(chip())).toEqual(before);
    await fireEvent.press(chip());
    expect(onPress).not.toHaveBeenCalled();
  });

  it.each([
    ['right', 'certo', 'icon-check'],
    ['wrong', 'errado', 'icon-x'],
  ] as const)('%s: ícone visível e "%s" no rótulo', async (state, word, icon) => {
    await render(<WordChip label="is" state={state} onPress={() => {}} />);
    expect(screen.getByRole('button', { name: `is, ${word}` })).toBeTruthy();
    expect(screen.getByTestId(icon, { includeHiddenElements: true })).toBeTruthy();
  });

  it('travado (disabled): não dispara', async () => {
    const onPress = jest.fn();
    await render(<WordChip label="is" state="right" disabled onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'is, certo' }));
    expect(onPress).not.toHaveBeenCalled();
  });

  it.each(Object.keys(WORD_CHIP_STATES) as WordChipState[])('%s: cores do DESIGN.md e texto sem corte', async (state) => {
    await render(<WordChip label="word" state={state} onPress={() => {}} />);
    const chip = screen.getByRole('button');
    expect(styleOf(chip).backgroundColor).toBe(WORD_CHIP_STATES[state].background);
    expect(styleOf(chip).height).toBeUndefined();
    const text = screen.getByText('word');
    expect(styleOf(text).color).toBe(WORD_CHIP_STATES[state].label);
    expect(text.props.numberOfLines).toBeUndefined();
  });

  it('contraste: texto turquesa em teal-dk', () => {
    expect(WORD_CHIP_STATES.right.label).toBe(color.tealDk);
  });
});
