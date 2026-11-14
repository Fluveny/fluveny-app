import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import {
  LOGO_GRADIENT,
  LOGO_MARK_BLUE,
  LOGO_MARK_RED,
  LOGO_MARK_STROKE,
  LOGO_VIEWBOX,
  LOGO_WORDMARK,
} from './logoPaths';
import { color } from './tokens';

type Props = {
  /** Largura em dp; a altura segue a proporção do arquivo. */
  width: number;
};

/** Logo do Fluveny em Lexend Zetta, como imagem vetorial (UX-DR8/127). */
export function Logo({ width }: Props) {
  const height = (width * LOGO_VIEWBOX.height) / LOGO_VIEWBOX.width;
  return (
    <Svg
      width={width}
      height={height}
      viewBox={`0 0 ${LOGO_VIEWBOX.width} ${LOGO_VIEWBOX.height}`}
      accessibilityRole="image"
      accessibilityLabel="Fluveny"
      testID="logo"
    >
      <Defs>
        <LinearGradient id="fluveny-wordmark" gradientUnits="userSpaceOnUse" {...LOGO_GRADIENT}>
          <Stop offset="0" stopColor={color.blue} />
          <Stop offset="1" stopColor={color.red} />
        </LinearGradient>
      </Defs>
      <Path d={LOGO_WORDMARK} fill="url(#fluveny-wordmark)" />
      <Path d={LOGO_MARK_BLUE} fill={color.blue} stroke={color.blue} strokeWidth={LOGO_MARK_STROKE} />
      <Path d={LOGO_MARK_RED} fill={color.red} stroke={color.red} strokeWidth={LOGO_MARK_STROKE} />
    </Svg>
  );
}
