import { fireEvent, render, screen } from '@testing-library/react-native';

import { FOCUS_RING, TextField } from '../TextField';
import { color, overlay, size } from '../tokens';
import { styleOf } from '../../test-utils/kit';

describe('TextField (text-field)', () => {
  it('rótulo visível e para o leitor; placeholder muted; altura mínima de 54, sem height fixo', async () => {
    await render(<TextField label="Your name" placeholder="Type your name" value="" onChangeText={() => {}} />);
    expect(screen.getByText('Your name', { includeHiddenElements: true })).toBeTruthy();
    const input = screen.getByLabelText('Your name');
    expect(input.props.placeholderTextColor).toBe(color.muted);
    const s = styleOf(input);
    expect(s.minHeight).toBe(size.textFieldHeight);
    expect(s.height).toBeUndefined();
    expect(input.props.numberOfLines).toBeUndefined();
    expect(input.props.allowFontScaling).not.toBe(false);
  });

  it('sem foco: borda line e sem anel; com foco: borda blue e anel de 4 dp; perdeu o foco: volta', async () => {
    const onFocus = jest.fn();
    const onBlur = jest.fn();
    await render(<TextField label="Your name" onFocus={onFocus} onBlur={onBlur} />);
    const input = () => screen.getByLabelText('Your name');
    expect(styleOf(input()).borderColor).toBe(color.line);
    expect(styleOf(input()).boxShadow).toBeUndefined();
    await fireEvent(input(), 'focus');
    expect(styleOf(input()).borderColor).toBe(color.blue);
    expect(styleOf(input()).boxShadow).toBe(FOCUS_RING);
    expect(FOCUS_RING).toBe(`0px 0px 0px ${size.focusRing}px ${overlay.focusRing}`);
    expect(onFocus).toHaveBeenCalled();
    await fireEvent(input(), 'blur');
    expect(styleOf(input()).borderColor).toBe(color.line);
    expect(onBlur).toHaveBeenCalled();
  });

  it('digitação chega a quem usa', async () => {
    const onChangeText = jest.fn();
    await render(<TextField label="Your name" onChangeText={onChangeText} />);
    await fireEvent.changeText(screen.getByLabelText('Your name'), 'Júlia');
    expect(onChangeText).toHaveBeenCalledWith('Júlia');
  });
});
