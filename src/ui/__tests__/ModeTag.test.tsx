import { render, screen } from '@testing-library/react-native';

import { MODE_TAGS, ModeTag } from '../ModeTag';
import { color, edge, size } from '../tokens';
import { styleOf } from '../../test-utils/kit';

describe('ModeTag (UX-DR37)', () => {
  it('os 11 valores do Lançamento 1', () => {
    expect(MODE_TAGS).toHaveLength(11);
    expect(MODE_TAGS).toContain('FILL IN THE GAPS');
    expect(MODE_TAGS).toContain('FINAL CHALLENGE');
  });

  it('etiqueta azul com sombra de chip, texto branco 900 em caixa alta, sem toque', async () => {
    await render(<ModeTag label="VOCAB MODE" />);
    const tag = screen.getByLabelText('VOCAB MODE');
    expect(screen.queryByRole('button')).toBeNull();
    const s = styleOf(tag);
    expect(s.backgroundColor).toBe(color.blue);
    expect(s.borderBottomColor).toBe(color.blueDk);
    expect(s.borderBottomWidth).toBe(edge.chip);
    const text = styleOf(screen.getByText('VOCAB MODE')) as Record<string, unknown>;
    expect(text).toEqual(
      expect.objectContaining({
        color: color.surface,
        fontWeight: '900',
        letterSpacing: size.modeTagLetterSpacing,
        textTransform: 'uppercase',
      }),
    );
  });
});
