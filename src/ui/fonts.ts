// Montserrat 500 a 900 empacotada em assets/fonts (UX-DR8), com o nome de cada
// família igual ao de `fontFamily` nos tokens. Carregada no layout raiz antes
// de esconder a splash.
import type { FontSource } from 'expo-font';

import { fontFamily } from './tokens';

export const FONTS: Record<(typeof fontFamily)[keyof typeof fontFamily], FontSource> = {
  [fontFamily[500]]: require('../../assets/fonts/Montserrat_500Medium.ttf'),
  [fontFamily[600]]: require('../../assets/fonts/Montserrat_600SemiBold.ttf'),
  [fontFamily[700]]: require('../../assets/fonts/Montserrat_700Bold.ttf'),
  [fontFamily[800]]: require('../../assets/fonts/Montserrat_800ExtraBold.ttf'),
  [fontFamily[900]]: require('../../assets/fonts/Montserrat_900Black.ttf'),
};
