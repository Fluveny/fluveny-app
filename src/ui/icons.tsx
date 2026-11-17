import { View } from 'react-native';
import Svg, { Circle, Path, Polygon } from 'react-native-svg';

export type IconName = 'check' | 'x' | 'star' | 'eye' | 'book' | 'mic';

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
          <Path
            d="M5 12.6l4.6 4.6L19.2 7.4"
            stroke={color}
            strokeWidth={3.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        ) : null}
        {name === 'x' ? (
          <Path
            d="M6.6 6.6l10.8 10.8M17.4 6.6L6.6 17.4"
            stroke={color}
            strokeWidth={3.4}
            strokeLinecap="round"
            fill="none"
          />
        ) : null}
        {name === 'eye' ? (
          <>
            <Path
              d="M2.6 12c2.4-4.2 5.6-6.3 9.4-6.3s7 2.1 9.4 6.3c-2.4 4.2-5.6 6.3-9.4 6.3S5 16.2 2.6 12z"
              stroke={color}
              strokeWidth={2.6}
              strokeLinejoin="round"
              fill="none"
            />
            <Circle cx={12} cy={12} r={3.2} fill={color} />
          </>
        ) : null}
        {name === 'mic' ? (
          // Microfone: a cápsula, o arco do suporte e a haste.
          <>
            <Path d="M12 2.8a3.6 3.6 0 0 0-3.6 3.6v5.4a3.6 3.6 0 0 0 7.2 0V6.4A3.6 3.6 0 0 0 12 2.8z" fill={color} />
            <Path
              d="M5.6 11.2a6.4 6.4 0 0 0 12.8 0M12 17.6v3.6"
              stroke={color}
              strokeWidth={2.4}
              strokeLinecap="round"
              fill="none"
            />
          </>
        ) : null}
        {name === 'book' ? (
          // Livro aberto: duas páginas que se encontram na lombada.
          <Path
            d="M12 6.4C10 5 7.2 4.6 3.6 5v13c3.6-.4 6.4 0 8.4 1.4 2-1.4 4.8-1.8 8.4-1.4V5c-3.6-.4-6.4 0-8.4 1.4zM12 6.4v13"
            stroke={color}
            strokeWidth={2.4}
            strokeLinejoin="round"
            strokeLinecap="round"
            fill="none"
          />
        ) : null}
        {name === 'star' ? (
          <Polygon points={STAR} fill={color} stroke={color} strokeWidth={1.4} strokeLinejoin="round" />
        ) : null}
      </Svg>
    </View>
  );
}
