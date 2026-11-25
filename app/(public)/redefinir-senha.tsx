import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useNavigation, useRouter, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';

import { messageFor } from '../../src/api/errors';
import { FormFrame, useLeave } from '../../src/auth/FormFrame';
import {
  forgetResetToken,
  holdResetToken,
  MAX_RESET_TOKEN_LENGTH,
  PASSWORD_CHANGED_REASON,
  RECOVER_PASSWORD_SCREEN,
  rememberedResetToken,
  rememberResetToken,
  resetPassword,
} from '../../src/auth/passwordReset';
import { SIGN_IN_PATH } from '../../src/auth/sessionEnd';
import { PASSWORD_HINT, PASSWORD_PROBLEM, passwordOk } from '../../src/auth/signupForm';
import { Button, TextField, TextLink } from '../../src/ui';
import { color, spacing, typography } from '../../src/ui/tokens';

// Copy de Criar senha nova (2.8; revisão de UX de 23/11, UX-DR99/UX-DR159).
// [ASSUMPTION: copy] Textos sem frase fixa no EXPERIENCE.md propostos na 2.8, a revisar com UX.
export const RESET_TITLE = 'Create a new password';
export const NEW_PASSWORD_FIELD = 'New password';
export const SAVE_PASSWORD_LABEL = 'SAVE PASSWORD';
export const BACK_LABEL = 'Back';
export const INVALID_TITLE = "This link doesn't work anymore.";
export const INVALID_BODY = 'Ask for a new link to create your password.';
export const NEW_LINK_LABEL = 'GET A NEW LINK';
export const GO_HOME_LABEL = 'GO TO HOME';

/** O `token` da query: o primeiro, se vier repetido; vazio vale como ausente. */
function tokenOf(param: string | string[] | undefined): string | null {
  const value = (Array.isArray(param) ? param[0] : param)?.trim();
  return value ? value : null;
}

/**
 * A página do link de redefinição (2.8, FR-4), pública, com ou sem sessão. Lê o
 * `token` uma vez, tira-o da URL (sem deixá-lo no histórico) e o guarda só em
 * memória, fora do componente: o remonte e o envio seguinte usam o mesmo. Não
 * chama a API ao abrir. 204: vai a Entrar com o aviso (sem histórico), depois de
 * apagar a sessão local, se havia uma. 410, sem token ou token longo demais: o
 * link inválido. 400, 429 e sem rede: `messageFor(code)`, a senha fica no campo.
 */
export default function ResetPassword() {
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const router = useRouter();
  const navigation = useNavigation();
  const client = useQueryClient();
  const leave = useLeave();
  const fromUrl = tokenOf(params.token);
  // A URL vence a memória; sem token na URL (já tirado, e o remonte), vale o guardado.
  const [token] = useState(() => {
    if (fromUrl) {
      if (fromUrl.length > MAX_RESET_TOKEN_LENGTH) {
        forgetResetToken();
        return null;
      }
      rememberResetToken(fromUrl);
      return fromUrl;
    }
    return rememberedResetToken();
  });
  const [invalid, setInvalid] = useState(!token);
  const [password, setPassword] = useState('');
  const [tried, setTried] = useState(false);
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  /** Dois toques no mesmo quadro passariam pelo `sending` (estado): o ref barra o segundo POST. */
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    // `setParams` da própria tela troca a entrada do histórico (no web, `replaceState`): o token não fica para trás.
    if (params.token !== undefined) navigation.setParams({ token: undefined } as never);
  }, [params.token, navigation]);

  // Saiu da pilha por qualquer caminho (Voltar, voltar do aparelho, gesto, voltar do navegador): o token sai da
  // memória. A troca pela mesma tela (o remonte) mantém o token.
  useEffect(() => holdResetToken(), []);

  useEffect(() => {
    if (invalid) AccessibilityInfo.announceForAccessibility(INVALID_TITLE);
  }, [invalid]);

  const passwordError = tried && !passwordOk(password) ? PASSWORD_PROBLEM : undefined;

  const submit = async () => {
    if (inFlight.current || !token) return;
    setTried(true);
    setFailure(null);
    if (!passwordOk(password)) return;
    inFlight.current = true;
    setSending(true);
    const outcome = await resetPassword(client, token, password);
    if (outcome.kind === 'reset') {
      // Sem a tela na pilha: o voltar não traz o formulário de novo.
      if (mounted.current) router.replace({ pathname: SIGN_IN_PATH, params: { motivo: PASSWORD_CHANGED_REASON } });
      return;
    }
    inFlight.current = false;
    if (outcome.kind === 'invalid') forgetResetToken();
    if (!mounted.current) return;
    setSending(false);
    if (outcome.kind === 'invalid') setInvalid(true);
    else setFailure(outcome.code);
  };

  const leaveTo = (path: Href) => {
    forgetResetToken();
    router.replace(path);
  };

  if (invalid) {
    return (
      <FormFrame
        testID="reset-invalid"
        footer={
          <>
            <Button label={NEW_LINK_LABEL} onPress={() => leaveTo(RECOVER_PASSWORD_SCREEN)} fullWidth />
            <Button label={GO_HOME_LABEL} variant="ghost" onPress={() => leaveTo('/')} fullWidth />
          </>
        }
      >
        <Text style={styles.title} accessibilityRole="header">
          {INVALID_TITLE}
        </Text>
        <Text style={styles.body}>{INVALID_BODY}</Text>
      </FormFrame>
    );
  }

  return (
    <FormFrame
      testID="reset-form"
      footer={
        <>
          {failure ? (
            <Text
              style={styles.failureText}
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              testID="reset-failure"
            >
              {messageFor(failure)}
            </Text>
          ) : null}
          <Button
            label={SAVE_PASSWORD_LABEL}
            onPress={() => void submit()}
            busy={sending}
            fullWidth
            testID="reset-submit"
          />
        </>
      }
    >
      <View style={styles.top}>
        <TextLink
          label={BACK_LABEL}
          small
          disabled={sending}
          onPress={() => {
            forgetResetToken();
            leave();
          }}
        />
      </View>
      <Text style={styles.title} accessibilityRole="header">
        {RESET_TITLE}
      </Text>
      <TextField
        label={NEW_PASSWORD_FIELD}
        value={password}
        onChangeText={(text) => {
          setFailure(null);
          setPassword(text);
        }}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="new-password"
        textContentType="newPassword"
        hint={PASSWORD_HINT}
        returnKeyType="go"
        onSubmitEditing={() => void submit()}
        error={passwordError}
        testID="reset-password"
      />
    </FormFrame>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', marginLeft: -spacing[3] },
  title: { ...typography.h1, color: color.ink },
  body: { ...typography.body, color: color.mutedStrong },
  failureText: { ...typography.bodyStrong, color: color.redDk, textAlign: 'center' },
});
