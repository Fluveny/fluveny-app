import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { SpeechBubble } from '../SpeechBubble';
import { color, size, typography } from '../tokens';
import { styleOf } from '../../test-utils/kit';

describe('SpeechBubble (speech-bubble)', () => {
  it('eyebrow vermelho do falante em caixa alta e fala em bubble, sem corte', async () => {
    await render(<SpeechBubble>Hi, I&apos;m Alex. I&apos;m new here!</SpeechBubble>);
    const speaker = screen.getByText('Alex');
    expect(styleOf(speaker)).toEqual(expect.objectContaining({ color: color.red, textTransform: 'uppercase' }));
    const text = screen.getByText("Hi, I'm Alex. I'm new here!");
    expect(styleOf(text)).toEqual(expect.objectContaining({ fontSize: typography.bubble.fontSize, color: color.ink }));
    expect(text.props.numberOfLines).toBeUndefined();
    expect(styleOf(text).height).toBeUndefined();
  });

  it('sem botão nem ícone de áudio (fora do Lançamento 1)', async () => {
    await render(<SpeechBubble>What&apos;s your name?</SpeechBubble>);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('na cena: rabicho embaixo (top), quadrado girado 45°, oculto do leitor', async () => {
    await render(<SpeechBubble>Hello!</SpeechBubble>);
    const tail = screen.getByTestId('speech-bubble-tail-top', { includeHiddenElements: true });
    const s = styleOf(tail);
    expect(s.width).toBe(size.bubbleTail);
    expect(s.transform).toEqual([{ rotate: '45deg' }]);
    expect(Number(s.bottom)).toBeLessThan(0);
    expect(screen.queryByTestId('speech-bubble-tail-top')).toBeNull();
    expect(screen.queryByTestId('alex-avatar')).toBeNull();
  });

  it('fora da cena, com avatar: avatar de 60 à esquerda e rabicho apontando para ele', async () => {
    await render(<SpeechBubble avatar="listen">Go ahead, I&apos;m listening!</SpeechBubble>);
    expect(styleOf(screen.getByTestId('alex-avatar')).width).toBe(size.avatar);
    expect(screen.getByTestId('alex-listen')).toBeTruthy();
    const tail = styleOf(screen.getByTestId('speech-bubble-tail-left', { includeHiddenElements: true }));
    expect(Number(tail.left)).toBeLessThan(0);
    expect(tail.borderLeftWidth).toBe(size.border);
  });

  it('texto misturado (`Hi, {name}!`) e número: dentro do Text `bubble`', async () => {
    const name = 'Júlia';
    await render(<SpeechBubble>Hi, {name}!</SpeechBubble>);
    const text = screen.getByText('Hi, Júlia!', { includeHiddenElements: true });
    expect(styleOf(text).fontSize).toBe(typography.bubble.fontSize);
    await render(<SpeechBubble>{42}</SpeechBubble>);
    expect(screen.getByText('42', { includeHiddenElements: true })).toBeTruthy();
  });

  it('fala de texto: falante e fala num só elemento, "Alex: <fala>"', async () => {
    const name = 'Júlia';
    await render(<SpeechBubble>Nice to meet you, {name}!</SpeechBubble>);
    const line = screen.getByTestId('speech-bubble-line');
    expect(line.props.accessible).toBe(true);
    expect(screen.getByLabelText('Alex: Nice to meet you, Júlia!')).toBe(line);
  });

  it('fala em nó (Expressões Úteis): sem agrupar, falante e nó como vieram', async () => {
    await render(
      <SpeechBubble>
        <Text>I&apos;m new here</Text>
      </SpeechBubble>,
    );
    expect(screen.queryByTestId('speech-bubble-line')).toBeNull();
    expect(screen.getByText('Alex')).toBeTruthy();
    expect(screen.getByText("I'm new here")).toBeTruthy();
  });

  it('falante configurável', async () => {
    await render(<SpeechBubble speaker="Ms. Rivera">Welcome!</SpeechBubble>);
    expect(screen.getByText('Ms. Rivera')).toBeTruthy();
  });
});
