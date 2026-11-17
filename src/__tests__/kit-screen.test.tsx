import { renderRouter, screen } from 'expo-router/testing-library';
import { StyleSheet, Text, type TextStyle } from 'react-native';

import KitScreen from '../../app/kit';
import { MODE_TAGS } from '../ui/ModeTag';
import { size } from '../ui/tokens';
import { touchHeight } from '../test-utils/kit';

const Home = () => <Text>início</Text>;
const openKit = () => renderRouter({ index: Home, kit: KitScreen }, { initialUrl: '/kit' });

describe('rota /kit (catálogo do kit, Decisão 1)', () => {
  const dev = __DEV__;
  afterEach(() => {
    (globalThis as unknown as { __DEV__: boolean }).__DEV__ = dev;
  });

  it('em desenvolvimento: mostra todas as peças', async () => {
    await openKit();
    expect(screen).toHavePathname('/kit');
    for (const name of ['primary', 'ghost', 'success', 'danger', 'reward', 'disabled', 'Pequeno']) {
      expect(screen.getByRole('button', { name })).toBeTruthy();
    }
    expect(screen.getByRole('progressbar')).toBeTruthy();
    expect(screen.getByLabelText('20 XP')).toBeTruthy();
    expect(screen.getByLabelText('+10 XP')).toBeTruthy();
    for (const name of ['idle', 'placed', 'used, usado', 'right, certo', 'wrong, errado']) {
      expect(screen.getByRole('button', { name })).toBeTruthy();
    }
    for (const label of MODE_TAGS) expect(screen.getByLabelText(label)).toBeTruthy();
    // Peças da 1.9.
    expect(screen.getByTestId('scene-frame')).toBeTruthy();
    expect(screen.getAllByTestId('speech-bubble').length).toBeGreaterThanOrEqual(3);
    for (const pose of ['wave', 'listen', 'cheer']) expect(screen.getByTestId(`alex-avatar-${pose}`)).toBeTruthy();
    expect(screen.getByLabelText('Responda com o seu nome')).toBeTruthy();
    expect(screen.getByLabelText('Sua resposta')).toBeTruthy();
    for (const state of ['neutral', 'selected', 'wrong', 'right'])
      expect(screen.getByTestId(`choice-state-${state}`)).toBeTruthy();
    for (const tone of ['offline', 'notice', 'quiet']) expect(screen.getByTestId(`status-banner-${tone}`)).toBeTruthy();
    // Peças da 1.14.
    expect(screen.getByTestId('kit-expression-card')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Abrir a folha' })).toBeTruthy();
  });

  it('no release (!__DEV__): redireciona para /', async () => {
    (globalThis as unknown as { __DEV__: boolean }).__DEV__ = false;
    await openKit();
    expect(screen).toHavePathname('/');
    expect(screen.getByText('início')).toBeTruthy();
  });

  it('texto nunca corta: nenhum Text com numberOfLines ou altura fixa; tocáveis com área ≥ 48 dp', async () => {
    await openKit();
    const texts = screen.container.queryAll((node) => node.type === 'Text');
    expect(texts.length).toBeGreaterThan(20);
    for (const text of texts) {
      expect(text.props.numberOfLines).toBeUndefined();
      expect(text.props.allowFontScaling).not.toBe(false);
      const style = (StyleSheet.flatten(text.props.style as TextStyle) ?? {}) as TextStyle;
      expect(style.height).toBeUndefined();
      expect(style.maxHeight).toBeUndefined();
    }
    for (const button of screen.getAllByRole('button')) {
      const style = StyleSheet.flatten(button.props.style) ?? {};
      expect(style.height).toBeUndefined();
      expect(touchHeight(button)).toBeGreaterThanOrEqual(size.touchMin);
    }
  });
});
