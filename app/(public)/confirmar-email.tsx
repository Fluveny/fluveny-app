import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { messageFor } from '../../src/api/errors';
import {
  confirmOnce,
  forgetConfirmation,
  forgetResult,
  MAX_TOKEN_LENGTH,
  rememberedToken,
  rememberToken,
  type ConfirmOutcome,
} from '../../src/auth/emailConfirmation';
import { Alex, AlexWave, Button } from '../../src/ui';
import { color, size, spacing, typography } from '../../src/ui/tokens';

// Copy da confirmação de e-mail (2.2). [ASSUMPTION] Textos propostos na 2.2, a revisar com UX.
export const CONFIRMING_TEXT = 'Confirmando seu e-mail…';
export const CONFIRMED_TITLE = 'E-mail confirmado!';
export const CONFIRMED_BODY = 'Agora você pode recuperar a senha se esquecer.';
export const CONTINUE_LABEL = 'CONTINUAR';
export const INVALID_TITLE = 'Este link não vale mais.';
export const INVALID_BODY = 'Peça um novo e-mail de confirmação na tela inicial do Fluveny.';
export const GO_HOME_LABEL = 'IR PARA O INÍCIO';
export const RETRY_LABEL = 'TENTAR DE NOVO';

const ALEX_SIZE = 180;

/** O `token` da query: o primeiro, se vier repetido; vazio vale como ausente. */
function tokenOf(param: string | string[] | undefined): string | null {
  const value = (Array.isArray(param) ? param[0] : param)?.trim();
  return value ? value : null;
}

/**
 * A página do link de confirmação (2.2), pública, com ou sem sessão. Lê o
 * `token` uma vez, tira-o da URL (sem deixá-lo no histórico) e o guarda só em
 * memória, fora do componente: um remonte não manda outro POST e o TENTAR DE
 * NOVO reenvia o mesmo token. Sem token, a mesma tela do link vencido (410).
 */
export default function ConfirmEmail() {
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const router = useRouter();
  const navigation = useNavigation();
  const client = useQueryClient();
  const fromUrl = tokenOf(params.token);
  // A URL vence a memória; sem token na URL (já tirado, e o remonte no meio do envio), vale o guardado.
  // Token maior que o da API é link mexido: a tela do link inválido, sem POST.
  const [token] = useState(() => {
    if (fromUrl) {
      if (fromUrl.length > MAX_TOKEN_LENGTH) return null;
      rememberToken(fromUrl);
      return fromUrl;
    }
    return rememberedToken();
  });
  const [outcome, setOutcome] = useState<ConfirmOutcome | null>(token ? null : { kind: 'invalid' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    // `setParams` da própria tela troca a entrada do histórico (no web, `replaceState`): o token não fica para trás.
    if (params.token !== undefined) navigation.setParams({ token: undefined } as never);
  }, [params.token, navigation]);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    confirmOnce(client, token).then((result) => {
      if (alive) setOutcome(result);
    });
    return () => {
      alive = false;
    };
  }, [client, token, attempt]);

  const title = outcome ? titleOf(outcome) : null;
  const body = outcome ? bodyOf(outcome) : null;
  useEffect(() => {
    if (title) AccessibilityInfo.announceForAccessibility(title);
  }, [title]);

  const goHome = () => {
    forgetConfirmation();
    router.replace('/');
  };
  const retry = () => {
    forgetResult();
    setOutcome(null);
    setAttempt((n) => n + 1);
  };

  if (!outcome) {
    return (
      <SafeAreaView style={styles.screen} testID="confirm-email">
        <View style={styles.center}>
          <ActivityIndicator size="large" color={color.blue} />
          <Text style={styles.body} accessibilityLiveRegion="polite">
            {CONFIRMING_TEXT}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} testID="confirm-email">
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.grow} />
        <View style={styles.alex}>
          {outcome.kind === 'confirmed' ? <Alex pose="cheer" size={size.stageAlex} /> : <AlexWave size={ALEX_SIZE} />}
        </View>
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        {body ? <Text style={styles.body}>{body}</Text> : null}
        <View style={styles.grow} />
      </ScrollView>
      <View style={styles.footer}>
        {outcome.kind === 'confirmed' ? (
          <Button label={CONTINUE_LABEL} onPress={goHome} fullWidth />
        ) : outcome.kind === 'invalid' ? (
          <Button label={GO_HOME_LABEL} onPress={goHome} fullWidth />
        ) : (
          <>
            <Button label={RETRY_LABEL} onPress={retry} fullWidth />
            <Button label={GO_HOME_LABEL} variant="ghost" onPress={goHome} fullWidth />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

function titleOf(outcome: ConfirmOutcome): string {
  if (outcome.kind === 'confirmed') return CONFIRMED_TITLE;
  if (outcome.kind === 'invalid') return INVALID_TITLE;
  return messageFor(outcome.code);
}

function bodyOf(outcome: ConfirmOutcome): string | null {
  if (outcome.kind === 'confirmed') return CONFIRMED_BODY;
  if (outcome.kind === 'invalid') return INVALID_BODY;
  return null;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.canvas },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing[4], padding: spacing.screenX },
  content: { flexGrow: 1, gap: spacing[4], paddingHorizontal: spacing.screenX },
  grow: { flexGrow: 1 },
  alex: { alignItems: 'center' },
  title: { ...typography.h1, color: color.ink, textAlign: 'center' },
  body: { ...typography.body, color: color.mutedStrong, textAlign: 'center' },
  footer: { paddingHorizontal: spacing.screenX, paddingVertical: spacing[3], gap: spacing.half },
});
