import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';

import { messageFor } from '../../src/api/errors';
import { FormFrame, useLeave } from '../../src/auth/FormFrame';
import { requestPasswordRecovery } from '../../src/auth/passwordReset';
import { SIGN_IN_PATH } from '../../src/auth/sessionEnd';
import { EMAIL_MAX, EMAIL_PROBLEM, emailOk } from '../../src/auth/signupForm';
import { Button, TextField, TextLink } from '../../src/ui';
import { color, spacing, typography } from '../../src/ui/tokens';

// Copy de Recuperar senha (2.8; revisão de UX de 23/11, UX-DR99/UX-DR159).
// [ASSUMPTION: copy] Textos sem frase fixa no EXPERIENCE.md propostos na 2.8, a revisar com UX.
export const RECOVER_TITLE = 'Reset password';
export const RECOVER_BODY =
  "Enter your account's email. If it's confirmed, we'll send you a link to create a new password.";
export const EMAIL_FIELD = 'Email';
export const EMAIL_EMPTY = 'Enter your email.';
export const SEND_LINK_LABEL = 'SEND LINK';
export const REMEMBERED = 'Remembered your password?';
export const SIGN_IN_LINK = 'Sign in';
export const BACK_LABEL = 'Back';
export const SENT_TITLE = 'Check your email';
export const sentBody = (email: string) =>
  `If ${email} has an account with a confirmed email, we sent a link to create a new password. It works for 1 hour and may take a few minutes to arrive.`;
export const BACK_TO_SIGN_IN = 'BACK TO SIGN IN';
export const SEND_AGAIN_LINK = 'Send again';
export const SENT_AGAIN = 'We sent it again.';

/**
 * Recuperar senha (2.8, FR-4): pública, com ou sem sessão. Pede o link para o
 * e-mail digitado (o campo começa vazio: nada de e-mail na URL). O 202 é igual
 * para qualquer e-mail, e a tela troca para "Confira seu e-mail" sem revelar se
 * a conta existe. "Enviar de novo" manda outro pedido com o mesmo e-mail, sem
 * contador de espera (a API descarta em silêncio o repetido). Erro (429, 400,
 * sem rede): `messageFor(code)` no rodapé, com o campo mantido.
 */
export default function RecoverPassword() {
  const router = useRouter();
  const leave = useLeave();
  const [email, setEmail] = useState('');
  /** Depois da primeira tentativa de enviar, o campo explica o que falta. */
  const [tried, setTried] = useState(false);
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  /** O e-mail para onde o pedido foi aceito (202): a tela mostra o estado enviado. */
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [sentAgain, setSentAgain] = useState(false);
  /** Dois toques no mesmo quadro passariam pelo `sending` (estado): o ref barra o segundo POST. */
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const trimmed = email.trim();
  const emailError = !tried ? undefined : !trimmed ? EMAIL_EMPTY : !emailOk(trimmed) ? EMAIL_PROBLEM : undefined;

  const send = async (to: string, again: boolean) => {
    inFlight.current = true;
    setSending(true);
    setFailure(null);
    setSentAgain(false);
    const outcome = await requestPasswordRecovery(to);
    inFlight.current = false;
    if (!mounted.current) return;
    setSending(false);
    if (outcome.kind === 'error') {
      setFailure(outcome.code);
      return;
    }
    if (again) {
      // O texto entra numa região viva: ela mesma o anuncia.
      setSentAgain(true);
    } else {
      setSentTo(to);
      AccessibilityInfo.announceForAccessibility(SENT_TITLE);
    }
  };

  const submit = () => {
    if (inFlight.current) return;
    setTried(true);
    setFailure(null);
    if (!trimmed || !emailOk(trimmed)) return;
    void send(trimmed, false);
  };

  const sendAgain = () => {
    if (inFlight.current || !sentTo) return;
    void send(sentTo, true);
  };

  const failureText = failure ? (
    <Text style={styles.failureText} accessibilityLiveRegion="polite" testID="recover-failure">
      {messageFor(failure)}
    </Text>
  ) : null;

  if (sentTo) {
    return (
      <FormFrame
        testID="recover-sent"
        footer={
          <>
            {failureText}
            {sentAgain ? (
              <Text style={styles.noticeText} accessibilityLiveRegion="polite" testID="recover-sent-again">
                {SENT_AGAIN}
              </Text>
            ) : null}
            <Button
              label={BACK_TO_SIGN_IN}
              onPress={() => router.dismissTo(SIGN_IN_PATH)}
              disabled={sending}
              fullWidth
              testID="recover-back-to-sign-in"
            />
            <TextLink label={SEND_AGAIN_LINK} busy={sending} onPress={sendAgain} testID="recover-send-again" />
          </>
        }
      >
        <Text style={styles.title} accessibilityRole="header">
          {SENT_TITLE}
        </Text>
        <Text style={styles.body}>{sentBody(sentTo)}</Text>
      </FormFrame>
    );
  }

  return (
    <FormFrame
      testID="recover-form"
      footer={
        <>
          {failureText}
          <Button label={SEND_LINK_LABEL} onPress={submit} busy={sending} fullWidth testID="recover-submit" />
          <View style={styles.signIn}>
            <Text style={styles.signInText}>{REMEMBERED}</Text>
            <TextLink
              label={SIGN_IN_LINK}
              disabled={sending}
              onPress={() => router.dismissTo(SIGN_IN_PATH)}
              testID="recover-sign-in"
            />
          </View>
        </>
      }
    >
      <View style={styles.top}>
        <TextLink label={BACK_LABEL} small disabled={sending} onPress={leave} />
      </View>
      <Text style={styles.title} accessibilityRole="header">
        {RECOVER_TITLE}
      </Text>
      <Text style={styles.body}>{RECOVER_BODY}</Text>
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
        returnKeyType="go"
        onSubmitEditing={submit}
        error={emailError}
        testID="recover-email"
      />
    </FormFrame>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', marginLeft: -spacing[3] },
  title: { ...typography.h1, color: color.ink },
  body: { ...typography.body, color: color.mutedStrong },
  failureText: { ...typography.bodyStrong, color: color.redDk, textAlign: 'center' },
  noticeText: { ...typography.bodyStrong, color: color.ink, textAlign: 'center' },
  signIn: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' },
  signInText: { ...typography.body, color: color.mutedStrong },
});
