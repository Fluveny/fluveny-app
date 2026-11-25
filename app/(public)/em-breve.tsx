import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AlexWave, Button } from '../../src/ui';
import { color, spacing, typography } from '../../src/ui/tokens';

// [ASSUMPTION] Copy da tela "Em breve" (spec da 1.10): Criar conta e Entrar chegam no Épico 2.
export const SOON_TITLE = 'Coming soon';
export const SOON_BODY = 'Creating an account and signing in come in the next version. Meanwhile, try Stage 1.';
export const SOON_BACK = 'BACK';

const ALEX_SIZE = 180;

/** Destino de CRIAR CONTA e ENTRAR enquanto o cadastro (Épico 2) não chega. */
export default function ComingSoon() {
  const router = useRouter();
  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <AlexWave size={ALEX_SIZE} />
        <Text style={styles.title} accessibilityRole="header">
          {SOON_TITLE}
        </Text>
        <Text style={styles.body}>{SOON_BODY}</Text>
      </View>
      <View style={styles.footer}>
        <Button label={SOON_BACK} onPress={back} fullWidth />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.canvas, paddingHorizontal: spacing.screenX },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing[4] },
  title: { ...typography.h1, color: color.ink, textAlign: 'center' },
  body: { ...typography.body, color: color.mutedStrong, textAlign: 'center' },
  footer: { paddingBottom: spacing[6] },
});
