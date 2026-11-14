import { View } from 'react-native';
import Svg, { Path, Polygon } from 'react-native-svg';

export type IconName = 'check' | 'x' | 'star';

type Props = {
  name: IconName;
  /** Lado em dp. */
  size: number;
  /** Cor de um token de `color` (src/ui/tokens). */
  color: string;
  testID?: string;
};

/** Estrela de cinco pontas, calculada aqui (desenho próprio, sem biblioteca de ícones). */
function starPoints(cx: number, cy: number, outer: number, inner: number): string {
  const points: string[] = [];
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    points.push(`${(cx + radius * Math.cos(angle)).toFixed(2)},${(cy + radius * Math.sin(angle)).toFixed(2)}`);
  }
  return points.join(' ');
}

const STAR = starPoints(12, 12.6, 10.2, 4.6);

/**
 * Ícones do kit (viewBox 24). Decorativos para o leitor de tela: o estado que
 * eles mostram ("certo", "errado", "N XP") vai no rótulo do componente. O View
 * em volta é quem se esconde do leitor (no web, o Svg repassaria as props ao DOM).
 */
export function Icon({ name, size, color, testID }: Props) {
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      aria-hidden
      testID={testID ?? `icon-${name}`}
      style={{ width: size, height: size }}
    >
      <Svg width={size} height={size} viewBox="0 0 24 24">
        {name === 'check' ? (
          <Path d="M5 12.6l4.6 4.6L19.2 7.4" stroke={color} strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        ) : null}
        {name === 'x' ? (
          <Path d="M6.6 6.6l10.8 10.8M17.4 6.6L6.6 17.4" stroke={color} strokeWidth={3.4} strokeLinecap="round" fill="none" />
        ) : null}
        {name === 'star' ? (
          <Polygon points={STAR} fill={color} stroke={color} strokeWidth={1.4} strokeLinejoin="round" />
        ) : null}
      </Svg>
    </View>
  );
}
