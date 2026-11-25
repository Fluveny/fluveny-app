import { fireEvent, render, screen } from '@testing-library/react-native';

import { Button, BUTTON_VARIANTS, type ButtonVariant } from '../Button';
import { color, edge, size } from '../tokens';
import { edgeOf, styleOf, touchHeight } from '../../test-utils/kit';

describe('Button (UX-DR18 a UX-DR24)', () => {
  it('papel, rótulo e estado; face de 54 dp com área de toque ≥ 48', async () => {
    await render(<Button label="CONTINUE" onPress={() => {}} />);
    const button = screen.getByRole('button', { name: 'CONTINUE' });
    expect(button).toBeEnabled();
    expect(button.props.accessibilityState).toEqual(expect.objectContaining({ disabled: false }));
    expect(touchHeight(button)).toBeGreaterThanOrEqual(size.touchMin);
  });

  it('toque: afunda com sunk(edge) no pressIn e volta no pressOut, sem mover o layout', async () => {
    const onPress = jest.fn();
    await render(<Button label="CHECK" onPress={onPress} />);
    const button = () => screen.getByRole('button', { name: 'CHECK' });
    const raised = edgeOf(button());
    expect(raised).toEqual(expect.objectContaining({ bottom: edge.button, margin: 0, translateY: 0 }));
    expect(styleOf(button()).borderBottomColor).toBe(color.blueDk);

    await fireEvent(button(), 'pressIn');
    const pressed = edgeOf(button());
    expect(pressed).toEqual(expect.objectContaining({ bottom: 0, margin: edge.button, translateY: edge.button }));
    expect(pressed.occupied).toBe(raised.occupied);
    // Não muda de cor no toque.
    expect(styleOf(button()).backgroundColor).toBe(color.blue);

    await fireEvent(button(), 'pressOut');
    expect(edgeOf(button())).toEqual(raised);
    await fireEvent.press(button());
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['variant="disabled"', { variant: 'disabled' as const }],
    ['disabled', { disabled: true }],
  ])('desabilitado (%s): não dispara, não afunda e anuncia disabled', async (_, props) => {
    const onPress = jest.fn();
    await render(<Button label="CHECK" onPress={onPress} {...props} />);
    const button = () => screen.getByRole('button', { name: 'CHECK' });
    expect(button()).toBeDisabled();
    const before = edgeOf(button());
    expect(before.bottom).toBe(edge.button);
    expect(styleOf(button()).backgroundColor).toBe(color.line);
    await fireEvent(button(), 'pressIn');
    expect(edgeOf(button())).toEqual(before);
    await fireEvent.press(button());
    expect(onPress).not.toHaveBeenCalled();
  });

  it('ocupado: desabilitado e anunciado como busy', async () => {
    await render(<Button label="SAVING…" busy onPress={() => {}} />);
    const button = screen.getByRole('button', { name: 'SAVING…' });
    expect(button).toBeDisabled();
    expect(button).toBeBusy();
  });

  it('pequeno: 46 dp, sombra de 4 e área de toque ≥ 48', async () => {
    await render(<Button label="NEXT" small onPress={() => {}} />);
    const button = screen.getByRole('button', { name: 'NEXT' });
    expect(edgeOf(button)).toEqual(
      expect.objectContaining({ bottom: edge.buttonSmall, minHeight: size.buttonSmallHeight + edge.buttonSmall }),
    );
    expect(touchHeight(button)).toBeGreaterThanOrEqual(size.touchMin);
  });

  it('ghost: borda de 2, e ao afundar a borda inferior continua', async () => {
    await render(<Button label="SEE ANSWER" variant="ghost" onPress={() => {}} />);
    const button = () => screen.getByRole('button', { name: 'SEE ANSWER' });
    expect(styleOf(button()).borderWidth).toBe(size.border);
    const raised = edgeOf(button());
    expect(raised.bottom).toBe(size.border + edge.button);
    await fireEvent(button(), 'pressIn');
    const pressed = edgeOf(button());
    expect(pressed).toEqual(
      expect.objectContaining({ bottom: size.border, margin: edge.button, translateY: edge.button }),
    );
    expect(pressed.occupied).toBe(raised.occupied);
  });

  it.each([
    ['disabled', { disabled: true }],
    ['busy', { busy: true }],
  ])('ghost que fica %s: mantém a borda de 2 e o espaço ocupado', async (_, props) => {
    const { rerender } = await render(<Button label="SEE ANSWER" variant="ghost" onPress={() => {}} />);
    const button = () => screen.getByRole('button', { name: 'SEE ANSWER' });
    const before = edgeOf(button());
    await rerender(<Button label="SEE ANSWER" variant="ghost" onPress={() => {}} {...props} />);
    expect(button()).toBeDisabled();
    expect(styleOf(button()).borderWidth).toBe(size.border);
    expect(styleOf(button()).borderColor).toBe(color.line);
    expect(edgeOf(button())).toEqual(before);
  });

  it('sem onPress: anunciado como desabilitado e não afunda', async () => {
    await render(<Button label="CONTINUE" />);
    const button = () => screen.getByRole('button', { name: 'CONTINUE' });
    expect(button()).toBeDisabled();
    const before = edgeOf(button());
    await fireEvent(button(), 'pressIn');
    expect(edgeOf(button())).toEqual(before);
  });

  it('fica inerte com o dedo em cima: ao reabilitar, volta em pé', async () => {
    const onPress = jest.fn();
    const { rerender } = await render(<Button label="CHECK" onPress={onPress} />);
    const button = () => screen.getByRole('button', { name: 'CHECK' });
    const raised = edgeOf(button());
    await fireEvent(button(), 'pressIn');
    await rerender(<Button label="CHECK" onPress={onPress} disabled />);
    await rerender(<Button label="CHECK" onPress={onPress} />);
    expect(edgeOf(button())).toEqual(raised);
  });

  it('contraste: rótulo ink no turquesa e no ouro; branco no azul e no vermelho', () => {
    expect(BUTTON_VARIANTS.success.label).toBe(color.ink);
    expect(BUTTON_VARIANTS.reward.label).toBe(color.ink);
    expect(BUTTON_VARIANTS.primary.label).toBe(color.surface);
    expect(BUTTON_VARIANTS.danger.label).toBe(color.surface);
  });

  it.each(Object.keys(BUTTON_VARIANTS) as ButtonVariant[])(
    'variante %s: fundo, sombra e rótulo do DESIGN.md; rótulo em caixa alta 900 sem corte',
    async (variant) => {
      await render(<Button label="ok" variant={variant} onPress={() => {}} />);
      const button = screen.getByRole('button', { name: 'ok' });
      const s = styleOf(button);
      expect(s.backgroundColor).toBe(BUTTON_VARIANTS[variant].background);
      expect(s.borderBottomColor).toBe(BUTTON_VARIANTS[variant].edge);
      expect(s.height).toBeUndefined();
      const label = screen.getByText('ok');
      const ls = styleOf(label);
      expect(ls.color).toBe(BUTTON_VARIANTS[variant].label);
      expect((ls as { textTransform?: string }).textTransform).toBe('uppercase');
      expect((ls as { fontWeight?: string }).fontWeight).toBe('900');
      expect(label.props.numberOfLines).toBeUndefined();
    },
  );

  it('ícone opcional de 20 dp à esquerda, oculto do leitor de tela', async () => {
    await render(<Button label="CONTINUE" variant="success" icon="check" onPress={() => {}} />);
    const icon = screen.getByTestId('icon-check', { includeHiddenElements: true });
    expect(styleOf(icon).width).toBe(size.buttonIcon);
    expect(screen.queryByTestId('icon-check')).toBeNull();
  });
});
