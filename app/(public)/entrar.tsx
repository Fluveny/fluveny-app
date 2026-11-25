import { useQueryClient } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { ApiError } from '../../src/api/client';
import { messageFor, UNKNOWN_ERROR } from '../../src/api/errors';
import { FormFrame, useLeave } from '../../src/auth/FormFrame';
import { PASSWORD_CHANGED_REASON, RECOVER_PASSWORD_SCREEN } from '../../src/auth/passwordReset';
import { returnPath, SESSION_ENDED_REASON } from '../../src/auth/sessionEnd';
import { signIn, useCachedStudent } from '../../src/auth/student';
import { captureError } from '../../src/observability/sentry';
import { Button, StatusBanner, TextField, TextLink } from '../../src/ui';
import { color, spacing, typography } from '../../src/ui/tokens';

// Copy de Entrar (revisão de UX de 20/11, UX-DR99/UX-DR159).
// [ASSUMPTION] Textos sem frase fixa no EXPERIENCE.md propostos na 2.3, a revisar com UX.
export const SIGN_IN_TITLE = 'Sign in';
export const EMAIL_FIELD = 'Email';
export const PASSWORD_FIELD = 'Password';
export const EMAIL_EMPTY = 'Enter your email.';
export const PASSWORD_EMPTY = 'Enter your password.';
export const FORGOT_LINK = 'I forgot my password';
export const SIGN_IN_LABEL = 'SIGN IN';
export const NO_ACCOUNT = "Don't have an account?";
export const CREATE_ACCOUNT_LINK = 'Create account';
export const BACK_LABEL = 'Back';
/** O aviso quando o 401 no meio do uso trouxe o aluno para cá (`motivo=sessao`), até a primeira tentativa. */
export const SESSION_ENDED = 'Your session ended. Sign in again.';
/**
 * O aviso depois da senha redefinida (`motivo=senha`, 2.8), até a primeira tentativa.
 * [ASSUMPTION: copy] Texto proposto na 2.8, a revisar com UX.
 */
export const PASSWORD_CHANGED = 'Password changed. Sign in with your new password.';
const SIGN_UP_PATH = '/cadastro';

/** O limite do contrato (`LoginRequest`). */
const EMAIL_MAX = 254;
const PASSWORD_MAX = 256;

/**
 * Entrar (2.3, FR-3): e-mail e senha, validação local só de preenchimento e o
 * `POST /auth/login`. Com sucesso, vai ao `volta` (só caminho da lista fechada)
 * ou à raiz, sem Entrar na pilha. Erro: `messageFor(code)` no rodapé, e os
 * campos ficam como estavam. Aberta pelo 401 no meio do uso (`?motivo=sessao`),
 * mostra que a sessão terminou; depois da senha redefinida (`?motivo=senha`,
 * 2.8), que a senha mudou. Com Aluno no cache, não mostra o formulário: vai
 * direto ao destino (entrar de novo derrubaria a sessão atual).
 */
export default function SignIn() {
  const router = useRouter();
  const client = useQueryClient();
  const leave = useLeave();
  const { volta, motivo } = useLocalSearchParams<{ volta?: string; motivo?: string }>();
  const cached = useCachedStudent();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  /** Depois da primeira tentativa de enviar, os campos vazios explicam o que falta. */
  const [tried, setTried] = useState(false);
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  /** Dois toques no mesmo quadro passariam pelo `sending` (estado): o ref barra o segundo POST. */
  const inFlight = useRef(false);
  const passwordRef = useRef<ComponentRef<typeof TextInput>>(null);
  /** Saiu da tela (Voltar do Android) no meio do envio: o destino não sequestra a navegação. */
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const emailError = tried && !email.trim() ? EMAIL_EMPTY : undefined;
  const passwordError = tried && !password ? PASSWORD_EMPTY : undefined;

  const submit = async () => {
    if (inFlight.current) return;
    setTried(true);
    setFailure(null);
    if (!email.trim() || !password) return;
    inFlight.current = true;
    setSending(true);
    try {
      await signIn(client, { email: email.trim(), password });
      // Sem Entrar na pilha: o voltar não traz o formulário de novo.
      if (mounted.current) router.dismissTo(returnPath(volta));
    } catch (error) {
      // Erro fora da API (o armazenamento seguro falhando depois do 200) não é "sem rede".
      if (!(error instanceof ApiError)) captureError(error);
      inFlight.current = false;
      if (!mounted.current) return;
      setFailure(error instanceof ApiError ? error.code : UNKNOWN_ERROR);
      setSending(false);
    }
  };

  // Já com sessão (e sem estar entrando agora): direto ao destino.
  if (cached && !sending) return <Redirect href={returnPath(volta)} />;

  return (
    <FormFrame
      testID="signin-form"
      footer={
        <>
          {failure ? (
            <Text
              style={styles.failureText}
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              testID="signin-failure"
            >
              {messageFor(failure)}
            </Text>
          ) : null}
          <Button label={SIGN_IN_LABEL} onPress={() => void submit()} busy={sending} fullWidth testID="signin-submit" />
          <View style={styles.signUp}>
            <Text style={styles.signUpText}>{NO_ACCOUNT}</Text>
            <TextLink
              label={CREATE_ACCOUNT_LINK}
              disabled={sending}
              onPress={() => router.navigate(SIGN_UP_PATH)}
              testID="signin-create"
            />
          </View>
        </>
      }
    >
      <View style={styles.top}>
        <TextLink label={BACK_LABEL} small disabled={sending} onPress={leave} />
      </View>
      <Text style={styles.title} accessibilityRole="header">
        {SIGN_IN_TITLE}
      </Text>
      {motivo === SESSION_ENDED_REASON && !tried ? (
        <StatusBanner tone="notice" text={SESSION_ENDED} testID="signin-session-ended" />
      ) : null}
      {motivo === PASSWORD_CHANGED_REASON && !tried ? (
        <StatusBanner tone="notice" text={PASSWORD_CHANGED} testID="signin-password-changed" />
      ) : null}
      <TextField
        label={EMAIL_FIELD}
        value={email}
        onChangeText={(text) => {
          setFailure(null);
          setEmail(text);
        }}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        inputMode="email"
        maxLength={EMAIL_MAX}
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => passwordRef.current?.focus()}
        error={emailError}
        testID="signin-email"
      />
      <View style={styles.password}>
        <TextField
          label={PASSWORD_FIELD}
          value={password}
          onChangeText={(text) => {
            setFailure(null);
            setPassword(text);
          }}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="current-password"
          textContentType="password"
          maxLength={PASSWORD_MAX}
          inputRef={passwordRef}
          returnKeyType="go"
          onSubmitEditing={() => void submit()}
          error={passwordError}
          testID="signin-password"
        />
        <View style={styles.forgot}>
          <TextLink
            label={FORGOT_LINK}
            small
            disabled={sending}
            onPress={() => router.navigate(RECOVER_PASSWORD_SCREEN)}
            testID="signin-forgot"
          />
        </View>
      </View>
    </FormFrame>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', marginLeft: -spacing[3] },
  title: { ...typography.h1, color: color.ink },
  password: { gap: spacing[1] },
  forgot: { flexDirection: 'row', justifyContent: 'flex-end', marginRight: -spacing[3] },
  failureText: { ...typography.bodyStrong, color: color.redDk, textAlign: 'center' },
  signUp: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' },
  signUpText: { ...typography.body, color: color.mutedStrong },
});
