import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { color, layout } from './tokens';

/**
 * Coluna única do App (UX-DR12): retrato, centralizada com largura máxima de
 * 440 dp em telas largas (tablet e web). "A partir de 360 dp" é a menor largura
 * suportada, não um piso: abaixo disso a coluna ocupa a tela inteira, sem corte.
 */
export function Column({ children }: { children: ReactNode }) {
  return (
    <View style={styles.page} testID="column-page">
      <View style={styles.column} testID="column">
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: color.canvas,
  },
  column: {
    flex: 1,
    width: '100%',
    maxWidth: layout.columnMax,
  },
});
