import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { BackHandler, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCachedStudent } from '../../src/auth/student';
import { useOnline } from '../../src/network/useOnline';
import { PlayerTop } from '../../src/player/PlayerFrame';
import { SIGN_UP_PATH, StageInvite } from '../../src/player/StageInvite';
import { checkVisitorStageComplete } from '../../src/player/stageComplete';
import { Alex, Button } from '../../src/ui';
import { color, size, spacing } from '../../src/ui/tokens';
import { openPlayer } from '../../src/visitor/events';

/** Ação secundária do convite: o player do Estágio 1 de novo, do início. */
export const REDO_LABEL = 'Redo Stage 1';

/**
 * O "Estágio 2" do Visitante (1.20, UX-DR115): com o Estágio 1 completo no
 * aparelho, o EXPERIMENTAR AGORA abre este convite em vez do player. CRIAR
 * CONTA leva ao cadastro (por ora, "Em breve"); "Refazer o Estágio 1" abre o
 * player do início; o ✕ e o voltar levam à boas-vindas. Aberto pelo link
 * direto sem o Estágio 1 completo (ou sem conseguir conferir), volta à
 * boas-vindas; enquanto confere, a tela mostra só o ✕.
 */
export default function StageTwoInvite() {
  const router = useRouter();
  const online = useOnline();
  const client = useQueryClient();
  const [confirmed, setConfirmed] = useState(false);
  // O convite é do Visitante: o Aluno com conta (2.1) volta à raiz.
  const student = useCachedStudent();

  useEffect(() => {
    if (student) {
      router.replace('/');
      return;
    }
    let alive = true;
    void checkVisitorStageComplete(client).then((done) => {
      if (!alive) return;
      if (done) setConfirmed(true);
      else router.replace('/');
    });
    return () => {
      alive = false;
    };
  }, [client, router, student]);
  const leave = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  }, [router]);

  // O voltar do Android é o ✕.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      leave();
      return true;
    });
    return () => subscription.remove();
  }, [leave]);

  // Enquanto confere, só o ✕ (a conferência tem o prazo de uma requisição).
  if (!confirmed) {
    return (
      <SafeAreaView style={styles.screen} edges={['top', 'bottom', 'left', 'right']} testID="stage-two-checking">
        <PlayerTop onClose={leave} online={online} />
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom', 'left', 'right']} testID="stage-two-invite">
      <PlayerTop onClose={leave} online={online} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.grow} />
        <View style={styles.alex}>
          <Alex pose="cheer" size={size.stageAlex} />
        </View>
        <StageInvite onSignUp={() => router.navigate(SIGN_UP_PATH)} />
        <Button label={REDO_LABEL} variant="ghost" onPress={() => openPlayer(router, 'replace')} fullWidth />
        <View style={styles.grow} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.surface },
  content: { flexGrow: 1, gap: spacing[4], paddingHorizontal: spacing.screenX, paddingBottom: spacing[6] },
  alex: { alignItems: 'center' },
  grow: { flexGrow: 1 },
});
