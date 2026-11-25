import { fireEvent, render, screen } from '@testing-library/react-native';

import { Checkbox } from '../Checkbox';
import { TextField } from '../TextField';
import { color, size } from '../tokens';
import { styleOf, touchHeight } from '../../test-utils/kit';

describe('Checkbox (2.1)', () => {
  it('papel checkbox com o rótulo e o estado; o toque alterna; área de toque de 48 dp', async () => {
    const onChange = jest.fn();
    const { rerender } = await render(<Checkbox label="Aceito" checked={false} onChange={onChange} />);
    const box = screen.getByRole('checkbox', { name: 'Aceito' });
    expect(box).not.toBeChecked();
    expect(touchHeight(box)).toBeGreaterThanOrEqual(size.touchMin);
    await fireEvent.press(box);
    expect(onChange).toHaveBeenCalledWith(true);

    await rerender(<Checkbox label="Aceito" checked onChange={onChange} />);
    expect(screen.getByRole('checkbox', { name: 'Aceito' })).toBeChecked();
    expect(styleOf(screen.getByTestId('checkbox-box')).backgroundColor).toBe(color.blue);
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Aceito' }));
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it('desabilitada: não dispara e é anunciada como desabilitada', async () => {
    const onChange = jest.fn();
    await render(<Checkbox label="Aceito" checked={false} disabled onChange={onChange} />);
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Aceito' }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('checkbox', { name: 'Aceito' })).toBeDisabled();
  });
});

describe('TextField com dica e erro (2.1)', () => {
  it('o erro aparece abaixo, em red-dk, com a borda red; o leitor ouve erro e dica', async () => {
    await render(<TextField label="Email" hint="Seu e-mail." error="Confira o e-mail." testID="email" />);
    const input = screen.getByLabelText('Email');
    expect(styleOf(input).borderColor).toBe(color.red);
    expect(input.props.accessibilityHint).toBe('Confira o e-mail. Seu e-mail.');
    expect(styleOf(screen.getByTestId('email-error')).color).toBe(color.redDk);
  });
});
