import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Logo } from '../../src/ui/Logo';
import { color, spacing } from '../../src/ui/tokens';

const LOGO_WIDTH = 240;

/** Tela inicial provisória (1.3): só o logo. A boas-vindas chega na 1.9. */
export default function Home() {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.center}>
        <Logo width={LOGO_WIDTH} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.canvas },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.screenX },
});
