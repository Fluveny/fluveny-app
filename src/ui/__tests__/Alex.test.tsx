import { render, screen } from '@testing-library/react-native';

import { AlexAvatar } from '../AlexAvatar';
import { Alex, AlexWave } from '../art/Alex';
import { ALEX_POSES } from '../art/alexSvg';
import { Room } from '../art/Room';
import { color, rounded, size } from '../tokens';
import { styleOf } from '../../test-utils/kit';

describe('Alex, avatar e quarto', () => {
  it.each(ALEX_POSES)('pose %s: testID alex-<pose>, decorativo (fora do leitor de tela)', async (pose) => {
    await render(<Alex pose={pose} size={120} />);
    expect(screen.getByTestId(`alex-${pose}`)).toBeTruthy();
    expect(screen.queryByRole('image')).toBeNull();
  });

  it('com rótulo: imagem com nome para o leitor', async () => {
    await render(<Alex pose="cheer" size={120} accessibilityLabel="Alex comemorando" />);
    expect(screen.getByRole('image', { name: 'Alex comemorando' })).toBeTruthy();
  });

  it('AlexWave continua sendo a pose wave (tela "Atualize o app")', async () => {
    await render(<AlexWave size={180} />);
    const alex = screen.getByTestId('alex-wave');
    expect(styleOf(alex).width).toBe(180);
  });

  it('avatar: círculo de 60 em wall, anel branco, Alex recortado e oculto', async () => {
    await render(<AlexAvatar pose="listen" />);
    const s = styleOf(screen.getByTestId('alex-avatar'));
    expect(s).toEqual(
      expect.objectContaining({
        width: size.avatar,
        height: size.avatar,
        borderRadius: rounded.full,
        backgroundColor: color.wall,
        borderWidth: size.avatarRing,
        borderColor: color.surface,
        overflow: 'hidden',
      }),
    );
    expect(screen.getByTestId('alex-listen')).toBeTruthy();
    expect(screen.queryByRole('image')).toBeNull();
  });

  it('quarto: decorativo e sem toque', async () => {
    await render(<Room />);
    expect(styleOf(screen.getByTestId('room')).pointerEvents).toBe('none');
    expect(screen.queryByRole('image')).toBeNull();
  });
});
