import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { Card, CARD_TONES, type CardTone } from '../Card';
import { color, edge, size } from '../tokens';
import { edgeOf, styleOf, touchHeight } from '../../test-utils/kit';

describe('Card (UX-DR26 a UX-DR30)', () => {
  it.each(Object.keys(CARD_TONES) as CardTone[])('tom %s: fundo, borda e sombra do DESIGN.md', async (tone) => {
    await render(
      <Card tone={tone} testID="card">
        <Text>conteúdo</Text>
      </Card>,
    );
    const s = styleOf(screen.getByTestId('card'));
    expect(s.backgroundColor).toBe(CARD_TONES[tone].background);
    expect(s.borderColor).toBe(CARD_TONES[tone].border);
    expect(s.borderBottomColor).toBe(CARD_TONES[tone].edge);
    expect(s.borderBottomWidth).toBe(size.border + edge.card);
    expect(s.height).toBeUndefined();
  });

  it('sem toque: não é botão; certo/errado têm ícone e o estado no leitor de tela', async () => {
    await render(
      <>
        <Card tone="right">
          <Text>Uma resposta possível</Text>
        </Card>
        <Card tone="wrong">
          <Text>I is Júlia</Text>
        </Card>
      </>,
    );
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByLabelText('right')).toBeTruthy();
    expect(screen.getByLabelText('wrong')).toBeTruthy();
    expect(screen.getByTestId('icon-check', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByTestId('icon-x', { includeHiddenElements: true })).toBeTruthy();
  });

  it('tocável: papel, rótulo com o estado e área de toque ≥ 48', async () => {
    await render(
      <Card tone="wrong" accessibilityLabel="She are from Brazil" onPress={() => {}}>
        <Text>She are from Brazil</Text>
      </Card>,
    );
    const card = screen.getByRole('button', { name: 'She are from Brazil, wrong' });
    expect(touchHeight(card)).toBeGreaterThanOrEqual(size.touchMin);
    expect(screen.getByTestId('icon-x', { includeHiddenElements: true })).toBeTruthy();
  });

  it('tocável e selecionado: anuncia selected e afunda a altura da sombra', async () => {
    const onPress = jest.fn();
    await render(
      <Card tone="selected" accessibilityLabel="Brazil" onPress={onPress}>
        <Text>Brazil</Text>
      </Card>,
    );
    const card = () => screen.getByRole('button', { name: 'Brazil' });
    expect(card()).toBeSelected();
    const raised = edgeOf(card());
    await fireEvent(card(), 'pressIn');
    const pressed = edgeOf(card());
    expect(pressed).toEqual(expect.objectContaining({ bottom: size.border, margin: edge.card, translateY: edge.card }));
    expect(pressed.occupied).toBe(raised.occupied);
    expect(styleOf(card()).backgroundColor).toBe(color.blueLt);
    await fireEvent(card(), 'pressOut');
    await fireEvent.press(card());
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('tocável desabilitado: não dispara nem afunda', async () => {
    const onPress = jest.fn();
    await render(
      <Card accessibilityLabel="Estágio 2" onPress={onPress} disabled>
        <Text>Estágio 2</Text>
      </Card>,
    );
    const card = () => screen.getByRole('button', { name: 'Estágio 2' });
    expect(card()).toBeDisabled();
    const before = edgeOf(card());
    await fireEvent(card(), 'pressIn');
    expect(edgeOf(card())).toEqual(before);
    await fireEvent.press(card());
    expect(onPress).not.toHaveBeenCalled();
  });
});
