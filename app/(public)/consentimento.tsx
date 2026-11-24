import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GUARDIAN_CONSENT_TOKEN_INVALID, messageFor } from '../../src/api/errors';
import {
  confirmGuardianOnce,
  forgetGuardianResult,
  holdGuardianToken,
  MAX_GUARDIAN_TOKEN_LENGTH,
  rememberedGuardianToken,
  rememberGuardianToken,
  type GuardianConfirmOutcome,
} from '../../src/auth/guardianConsent';
import { PRIVACY_LINK, PRIVACY_PATH, TERMS_LINK, TERMS_PATH } from '../../src/legal/paths';
import { Alex, AlexWave, Button, TextLink } from '../../src/ui';
import { color, size, spacing, typography } from '../../src/ui/tokens';

// Copy da página do responsável (2.11). [ASSUMPTION: copy]
// REVISÃO JURÍDICA (NFR24)
export const CONSENT_CONFIRMING = 'Confirmando a autorização…';
export const CONSENT_DONE_TITLE = 'Pronto! A conta foi autorizada.';
export const CONSENT_DONE_BODY = 'O estudante já pode continuar no Fluveny.';
/** O link inválido: o texto do catálogo de erros, uma fonte só. */
export const CONSENT_INVALID_TITLE = messageFor(GUARDIAN_CONSENT_TOKEN_INVALID);
export const CONSENT_RETRY = 'TENTAR DE NOVO';

const ALEX_SIZE = 180;

function tokenOf(param: string | string[] | undefined): string | null {
  const value = (Array.isArray(param) ? param[0] : param)?.trim();
  return value ? value : null;
}

/**
 * A página do link do responsável (2.11), pública, no molde da confirmação de
 * e-mail (2.2): lê o `token` uma vez, tira-o da URL e manda um POST só. Não
 * exige sessão e não mexe na sessão de quem estiver logado no aparelho.
 */
export default function GuardianConsent() {
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const navigation = useNavigation();
  const router = useRouter();
  const fromUrl = tokenOf(params.token);
  const [token] = useState(() => {
    if (fromUrl) {
      if (fromUrl.length > MAX_GUARDIAN_TOKEN_LENGTH) return null;
      rememberGuardianToken(fromUrl);
      return fromUrl;
    }
    return rememberedGuardianToken();
  });
  const [outcome, setOutcome] = useState<GuardianConfirmOutcome | null>(token ? null : { kind: 'invalid' });
  const [attempt, setAttempt] = useState(0);

  // O token fica em memória enquanto a página está na pilha; ao sair, é esquecido.
  useEffect(() => holdGuardianToken(), []);

  useEffect(() => {
    if (params.token !== undefined) navigation.setParams({ token: undefined } as never);
  }, [params.token, navigation]);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    confirmGuardianOnce(token).then((result) => {
      if (alive) setOutcome(result);
    });
    return () => {
      alive = false;
    };
  }, [token, attempt]);

  const title =
    outcome?.kind === 'confirmed'
      ? CONSENT_DONE_TITLE
      : outcome?.kind === 'invalid'
        ? CONSENT_INVALID_TITLE
        : outcome
          ? messageFor(outcome.code)
          : null;
  const body = outcome?.kind === 'confirmed' ? CONSENT_DONE_BODY : null;
  useEffect(() => {
    if (title) AccessibilityInfo.announceForAccessibility(title);
  }, [title]);

  if (!outcome) {
    return (
      <SafeAreaView style={styles.screen} testID="guardian-consent">
        <View style={styles.center}>
          <ActivityIndicator size="large" color={color.blue} />
          <Text style={styles.body} accessibilityLiveRegion="polite">
            {CONSENT_CONFIRMING}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} testID="guardian-consent">
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.grow} />
        <View style={styles.alex}>
          {outcome.kind === 'confirmed' ? <Alex pose="cheer" size={size.stageAlex} /> : <AlexWave size={ALEX_SIZE} />}
        </View>
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
        {body ? <Text style={styles.body}>{body}</Text> : null}
        {outcome.kind === 'confirmed' ? (
          <View style={styles.links}>
            <TextLink label={TERMS_LINK} small onPress={() => router.navigate(TERMS_PATH)} />
            <TextLink label={PRIVACY_LINK} small onPress={() => router.navigate(PRIVACY_PATH)} />
          </View>
        ) : null}
        <View style={styles.grow} />
      </ScrollView>
      {outcome.kind === 'error' ? (
        <View style={styles.footer}>
          <Button
            label={CONSENT_RETRY}
            onPress={() => {
              forgetGuardianResult();
              setOutcome(null);
              setAttempt((n) => n + 1);
            }}
            fullWidth
            testID="guardian-consent-retry"
          />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.canvas },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing[4], padding: spacing.screenX },
  content: { flexGrow: 1, gap: spacing[4], paddingHorizontal: spacing.screenX },
  grow: { flexGrow: 1 },
  alex: { alignItems: 'center' },
  title: { ...typography.h1, color: color.ink, textAlign: 'center' },
  body: { ...typography.body, color: color.mutedStrong, textAlign: 'center' },
  links: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  footer: { paddingHorizontal: spacing.screenX, paddingVertical: spacing[3] },
});
