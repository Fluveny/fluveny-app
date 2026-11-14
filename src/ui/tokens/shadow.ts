// Sombra sólida "de borracha" (DESIGN.md, Elevation & Depth; UX-DR15/16): um
// deslocamento vertical da cor escura do próprio elemento, sem desfoque. A
// sombra é a borda inferior, que no RN fica dentro da caixa. Ao afundar, a borda
// some, a margem inferior reserva a mesma altura (o layout não se move) e o
// elemento desce essa altura com translateY, sem mexer no layout.
import type { ViewStyle } from 'react-native';

export type SolidStyle = Pick<ViewStyle, 'borderBottomWidth' | 'borderBottomColor' | 'marginBottom' | 'transform'>;

/** Estado normal: sombra sólida de `height` na cor `edgeColor`. */
export function solid(edgeColor: string, height: number): SolidStyle {
  return { borderBottomWidth: height, borderBottomColor: edgeColor, marginBottom: 0, transform: [{ translateY: 0 }] };
}

/** Estado pressionado: sem sombra, o elemento desce exatamente `height` e o espaço ocupado não muda. */
export function sunk(height: number): SolidStyle {
  return { borderBottomWidth: 0, marginBottom: height, transform: [{ translateY: height }] };
}
