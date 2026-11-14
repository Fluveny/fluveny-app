import { color } from '../ui/tokens';

const appJson = require('../../app.json');
const pkg = require('../../package.json');

describe('app.json', () => {
  it('a versão é a do package.json', () => {
    expect(appJson.expo.version).toBe(pkg.version);
  });

  it('as cores nativas são as dos tokens (splash em canvas, ícone adaptativo em surface)', () => {
    const splash = appJson.expo.plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'expo-splash-screen');
    expect(splash[1].backgroundColor).toBe(color.canvas);
    expect(appJson.expo.android.adaptiveIcon.backgroundColor).toBe(color.surface);
  });
});
