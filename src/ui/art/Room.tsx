import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { ROOM_XML } from './roomSvg';

/**
 * O quarto (cena `room`) cobrindo a caixa inteira, como `cover`: o desenho
 * corta as sobras (`preserveAspectRatio="xMidYMid slice"`). Decorativo: fica
 * oculto do leitor de tela. Por padrão preenche o pai (`absoluteFill`).
 */
export function Room({ style, testID = 'room' }: { style?: StyleProp<ViewStyle>; testID?: string }) {
  return (
    <View testID={testID} style={[StyleSheet.absoluteFill, styles.inert, style]}>
      <View accessible={false} importantForAccessibility="no-hide-descendants" aria-hidden style={StyleSheet.absoluteFill}>
        <SvgXml xml={ROOM_XML} width="100%" height="100%" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  inert: { pointerEvents: 'none' },
});
