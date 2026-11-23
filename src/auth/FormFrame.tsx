import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { color, spacing } from '../ui/tokens';

/** Volta à tela anterior; aberta direto, à raiz. */
export function useLeave() {
  const router = useRouter();
  return () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };
}

/** No nativo, o teclado não encolhe a janela: o conteúdo e o rodapé sobem com ele (UX-DR131). */
const KEYBOARD_AVOIDING = Platform.OS !== 'web';

/**
 * A moldura dos formulários da conta (cadastro, 2.1; Entrar, 2.3): conteúdo
 * rolável e o rodapé fixo, acima do teclado.
 */
export function FormFrame({ children, footer, testID }: { children: ReactNode; footer: ReactNode; testID: string }) {
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom', 'left', 'right']} testID={testID}>
      <KeyboardAvoidingView style={styles.grow} behavior="padding" enabled={KEYBOARD_AVOIDING}>
        <ScrollView style={styles.grow} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
        <View style={styles.footer}>{footer}</View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  grow: { flex: 1 },
  content: {
    flexGrow: 1,
    gap: spacing[4],
    paddingHorizontal: spacing.screenX,
    paddingTop: spacing[4],
    paddingBottom: spacing[6],
  },
  footer: { paddingHorizontal: spacing.screenX, paddingTop: spacing[3], paddingBottom: spacing[3], gap: spacing[2] },
});
