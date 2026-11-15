import { fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { STATUS_BANNER_TONES, StatusBanner, type StatusBannerTone } from '../StatusBanner';
import { color, size } from '../tokens';
import { styleOf, touchHeight } from '../../test-utils/kit';

const OFFLINE = 'Sem conexão. Assim que a rede voltar, você continua daqui.';

describe('StatusBanner (faixa de estado)', () => {
  it.each(Object.keys(STATUS_BANNER_TONES) as StatusBannerTone[])(
    'tom %s: cores da Decisão 2 e texto sem corte',
    async (tone) => {
      await render(<StatusBanner tone={tone} text="Aviso" />);
      expect(styleOf(screen.getByTestId('status-banner')).backgroundColor).toBe(STATUS_BANNER_TONES[tone].background);
      const text = screen.getByText('Aviso');
      expect(styleOf(text).color).toBe(STATUS_BANNER_TONES[tone].text);
      expect(text.props.numberOfLines).toBeUndefined();
      expect(styleOf(text).height).toBeUndefined();
    },
  );

  it('cores: offline em ink com texto branco; notice gold-text sobre gold-lt', () => {
    expect(STATUS_BANNER_TONES.offline).toEqual({ background: color.ink, text: color.surface });
    expect(STATUS_BANNER_TONES.notice).toEqual({ background: color.goldLt, text: color.goldText });
    expect(STATUS_BANNER_TONES.quiet).toEqual({ background: color.canvas, text: color.mutedStrong });
  });

  it('papel alert só no tom de sem conexão', async () => {
    await render(<StatusBanner tone="offline" text={OFFLINE} />);
    expect(screen.getByRole('alert')).toHaveTextContent(OFFLINE);
    for (const tone of ['notice', 'quiet'] as const) {
      await render(<StatusBanner tone={tone} text="Confirme seu e-mail." />);
      expect(screen.queryByRole('alert')).toBeNull();
    }
  });

  it('sem conexão: anunciada ao aparecer e quando o texto muda; os outros tons, não', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
    announce.mockClear();
    const view = await render(<StatusBanner tone="offline" text={OFFLINE} />);
    expect(announce).toHaveBeenCalledWith(OFFLINE);
    await view.rerender(<StatusBanner tone="offline" text="Sem conexão de novo." />);
    expect(announce).toHaveBeenLastCalledWith('Sem conexão de novo.');
    // O StrictMode dos testes roda o efeito duas vezes; o que importa é o que foi anunciado, em ordem.
    expect([...new Set(announce.mock.calls.map(([t]) => t))]).toEqual([OFFLINE, 'Sem conexão de novo.']);
    announce.mockClear();
    await render(<StatusBanner tone="notice" text="Aviso" />);
    await render(<StatusBanner tone="quiet" text="Lembrete" />);
    expect(announce).not.toHaveBeenCalled();
    announce.mockRestore();
  });

  it('sem ação: só texto', async () => {
    await render(<StatusBanner tone="quiet" text="Confirme seu e-mail para poder recuperar a senha." />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('com ação: botão pequeno com área de toque de 48 dp', async () => {
    const onPress = jest.fn();
    await render(
      <StatusBanner
        tone="notice"
        text="Seu progresso fica só neste aparelho."
        action={{ label: 'Reenviar e-mail', onPress }}
      />,
    );
    const button = screen.getByRole('button', { name: 'Reenviar e-mail' });
    expect(touchHeight(button)).toBeGreaterThanOrEqual(size.touchMin);
    await fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
