import { render, screen } from '@testing-library/react-native';
import { Text, useWindowDimensions } from 'react-native';

import { ALEX_VIEWBOX } from '../art/alexSvg';
import { ALEX_RESERVE, SceneFrame, sceneHeight } from '../SceneFrame';
import { rounded, scene, size, spacing } from '../tokens';
import { styleOf } from '../../test-utils/kit';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(() => ({ width: 360, height: 800, scale: 1, fontScale: 1 })),
}));
const dims = useWindowDimensions as jest.Mock;

describe('SceneFrame', () => {
  it.each([
    [600, scene.min],
    [800, 368],
    [1000, scene.max],
  ])('tela de %i dp: cena de %i dp (46%%, entre 300 e 420)', (screenHeight, expected) => {
    expect(sceneHeight(screenHeight)).toBe(expected);
  });

  it.each([
    [600, 300],
    [1000, 420],
  ])('renderizada em tela de %i: altura mínima %i, cantos xl, recuo de 14', async (screenHeight, expected) => {
    dims.mockReturnValue({ width: 360, height: screenHeight, scale: 1, fontScale: 1 });
    await render(
      <SceneFrame>
        <Text>fala</Text>
      </SceneFrame>,
    );
    const s = styleOf(screen.getByTestId('scene-frame'));
    expect(s.minHeight).toBe(expected);
    expect(s.height).toBeUndefined();
    expect(s.borderRadius).toBe(rounded.xl);
    expect(s.marginHorizontal).toBe(spacing.sceneInset);
    expect(screen.getByText('fala')).toBeTruthy();
  });

  it('quarto ao fundo e Alex wave em cena, decorativos', async () => {
    await render(<SceneFrame />);
    expect(screen.getByTestId('room')).toBeTruthy();
    expect(screen.getByTestId('alex-wave')).toBeTruthy();
    expect(screen.queryByRole('image')).toBeNull();
  });

  it('com Alex: o conteúdo reserva embaixo até as sobrancelhas dele (y≈70 de 222)', async () => {
    const alexHeight = (size.alexInScene * ALEX_VIEWBOX.height) / ALEX_VIEWBOX.width;
    expect(ALEX_RESERVE).toBe(Math.round(alexHeight * (1 - 70 / ALEX_VIEWBOX.height) - spacing.half));
    await render(<SceneFrame />);
    expect(styleOf(screen.getByTestId('scene-frame-content')).paddingBottom).toBe(ALEX_RESERVE);
    // Na menor cena ainda sobra espaço para o balão acima de Alex.
    expect(scene.min - ALEX_RESERVE).toBeGreaterThan(100);
  });

  it('pose null: sem Alex e sem reserva', async () => {
    await render(<SceneFrame pose={null} />);
    expect(screen.queryByTestId('alex-wave')).toBeNull();
    expect(styleOf(screen.getByTestId('scene-frame-content')).paddingBottom).toBeUndefined();
  });
});
