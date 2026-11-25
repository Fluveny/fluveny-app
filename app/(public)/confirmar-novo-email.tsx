import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { messageFor } from '../../src/api/errors';
import {
  confirmChangeOnce,
  forgetChangeResult,
  forgetEmailChange,
  holdChangeToken,
  MAX_EMAIL_CHANGE_TOKEN_LENGTH,
  rememberChangeToken,
  rememberedChangeToken,
  type EmailChangeOutcome,
} from '../../src/auth/emailChange';
import { Alex, AlexWave, Button } from '../../src/ui';
import { color, size, spacing, typography } from '../../src/ui/tokens';

// Copy da troca de e-mail (2.9). [ASSUMPTION: copy] Textos propostos na 2.9, a revisar com UX.
export const CONFIRMING_TEXT = 'Changing your email…';
export const CHANGED_TITLE = 'Email changed.';
/** O mesmo texto do `EMAIL_CHANGE_LINK_INVALID` do catálogo de erros. */
export const INVALID_TITLE = messageFor('EMAIL_CHANGE_LINK_INVALID');
export const TAKEN_TITLE = 'This email already belongs to another account. Ask for the change again.';
export const GO_HOME_LABEL = 'GO TO HOME';
export const RETRY_LABEL = 'TRY AGAIN';

const ALEX_SIZE = 180;

/** O `token` da query: o primeiro, se vier repetido; vazio vale como ausente. */
function tokenOf(param: string | string[] | undefined): string | null {
  const value = (Array.isArray(param) ? param[0] : param)?.trim();
  return value ? value : null;
}

/**
 * A página do link da troca de e-mail (2.9, AD-13), pública, com ou sem sessão,
 * no molde da confirmação (2.2): lê o `token` uma vez, tira-o da URL e o guarda
 * só em memória; um remonte não manda outro POST e o TENTAR DE NOVO reenvia o
 * mesmo token. Sem token ou com mais de 128 caracteres, o link inválido.
 */
export default function ConfirmEmailChange() {
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const router = useRouter();
  const navigation = useNavigation();
  const client = useQueryClient();
  const fromUrl = tokenOf(params.token);
  // A URL vence a memória; sem token na URL (já tirado, e o remonte no meio do envio), vale o guardado.
  // Token maior que o da API é link mexido: a tela do link inválido, sem POST.
  const [token] = useState(() => {
    if (fromUrl) {
      if (fromUrl.length > MAX_EMAIL_CHANGE_TOKEN_LENGTH) return null;
      rememberChangeToken(fromUrl);
      return fromUrl;
    }
    return rememberedChangeToken();
  });
  const [outcome, setOutcome] = useState<EmailChangeOutcome | null>(token ? null : { kind: 'invalid' });
  const [attempt, setAttempt] = useState(0);

  // Sair da página por qualquer caminho esquece o token.
  useEffect(() => holdChangeToken(), []);

  useEffect(() => {
    // `setParams` da própria tela troca a entrada do histórico (no web, `replaceState`): o token não fica para trás.
    if (params.token !== undefined) navigation.setParams({ token: undefined } as never);
  }, [params.token, navigation]);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    confirmChangeOnce(client, token).then((result) => {
      if (alive) setOutcome(result);
    });
    return () => {
      alive = false;
    };
  }, [client, token, attempt]);

  const title = outcome ? titleOf(outcome) : null;
  useEffect(() => {
    if (title) AccessibilityInfo.announceForAccessibility(title);
  }, [title]);

  const goHome = () => {
    forgetEmailChange();
    router.replace('/');
  };
  const retry = () => {
    forgetChangeResult();
    setOutcome(null);
    setAttempt((n) => n + 1);
  };

  if (!outcome) {
    return (
      <SafeAreaView style={styles.screen} testID="confirm-email-change">
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
    <SafeAreaView style={styles.screen} testID="confirm-email-change">
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.grow} />
        <View style={styles.alex}>
          {outcome.kind === 'changed' ? <Alex pose="cheer" size={size.stageAlex} /> : <AlexWave size={ALEX_SIZE} />}
        </View>
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        <View style={styles.grow} />
      </ScrollView>
      <View style={styles.footer}>
        {outcome.kind !== 'error' ? (
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

function titleOf(outcome: EmailChangeOutcome): string {
  if (outcome.kind === 'changed') return CHANGED_TITLE;
  if (outcome.kind === 'invalid') return INVALID_TITLE;
  if (outcome.kind === 'taken') return TAKEN_TITLE;
  return messageFor(outcome.code);
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
