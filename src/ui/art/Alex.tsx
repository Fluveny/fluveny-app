import { SvgXml } from 'react-native-svg';

import { ALEX_VIEWBOX, ALEX_WAVE_XML } from './alexWave';

type Props = {
  /** Largura em dp; a altura segue a proporção do desenho. */
  size: number;
};

/** Alex acenando (pose `wave`). As outras poses chegam com o kit (1.8). */
export function AlexWave({ size }: Props) {
  return (
    <SvgXml
      xml={ALEX_WAVE_XML}
      width={size}
      height={(size * ALEX_VIEWBOX.height) / ALEX_VIEWBOX.width}
      accessibilityRole="image"
      accessibilityLabel="Alex acenando"
      testID="alex-wave"
    />
  );
}
