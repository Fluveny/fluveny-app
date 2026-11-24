import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';

import { ApiError } from '../api/client';
import { messageFor, NETWORK_ERROR } from '../api/errors';
import { NoticeSheet, StatusBanner, TextLink } from '../ui';
import { color, spacing, typography } from '../ui/tokens';
import { resendConfirmation } from './emailConfirmation';
import { signOut } from './sessionEnd';

// As peças da tela inicial do Aluno (2.1 a 2.4, 2.8) que o painel (2.5) reaproveita: a saudação, a
// faixa do e-mail e o Sair. A tela inicial simples saiu: a raiz do Aluno é o painel (`src/dashboard`).
/** A saudação, em inglês como no painel ("Hi, {nome}!"); sem nome, "Hi, friend!". */
export const studentGreeting = (name: string | null | undefined) =>
  name?.trim() ? `Hi, ${name.trim()}!` : 'Hi, friend!';

// Faixa do e-mail não confirmado (2.2). [ASSUMPTION] Textos propostos na 2.2, a revisar com UX.
export const confirmationSent = (email: string) => `Enviamos um link de confirmação para ${email}.`;
export const confirmationResent = (email: string) => `Enviamos outro link para ${email}. Pode levar alguns minutos.`;
export const RESEND_LABEL = 'REENVIAR';
/** Depois dos 7 dias sem confirmar (`emailConfirmationOverdue`, 2.8, UX-DR117): a frase da UX. */
export const CONFIRM_TO_RECOVER = 'Confirme seu e-mail para poder recuperar a senha.';

/** O sair (2.3), discreto; desde a 2.9, na Conta. */
export const SIGN_OUT_LABEL = 'Sair';
// A folha de confirmação do sair: desde a 2.4, o Progresso do Aluno fica na conta, e o sair apaga
// só o que está no aparelho (a loja e o cache). [ASSUMPTION: copy] Textos propostos na 2.3 e na 2.4, a revisar com UX.
export const SIGN_OUT_TITLE = 'Sair da conta?';
export const SIGN_OUT_BODY = 'Seu progresso fica salvo na sua conta. O que está só neste aparelho será apagado.';
export const SIGN_OUT_CONFIRM = 'SAIR';
export const SIGN_OUT_CANCEL = 'CANCELAR';

/**
 * O link "Sair" (2.3): abre a folha de confirmação; SAIR encerra a sessão no
 * servidor e, com o 204, apaga o
 * token, o cache e a loja do aparelho e volta à boas-vindas, sem histórico.
 * Sem rede ou outro erro, mostra `messageFor(code)` e o aluno continua logado.
 */
export function SignOut() {
  const client = useQueryClient();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const running = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const leave = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setConfirming(false);
    setBusy(true);
    setFailure(null);
    try {
      await signOut(client);
    } catch (error) {
      running.current = false;
      if (!mounted.current) return;
      setBusy(false);
      setFailure(error instanceof ApiError ? error.code : NETWORK_ERROR);
      return;
    }
    // A raiz já mostra a boas-vindas (sem Aluno no cache); a pilha volta a ser só ela.
    if (router.canDismiss()) router.dismissAll();
    router.replace('/');
  }, [client, router]);
  return (
    <View style={styles.signOut}>
      {/* Numa linha: o `TextLink` se centra no eixo cruzado de uma coluna. */}
      <View style={styles.signOutRow}>
        <TextLink
          label={SIGN_OUT_LABEL}
          small
          busy={busy}
          onPress={() => {
            setFailure(null);
            setConfirming(true);
          }}
          testID="student-home-sign-out"
        />
      </View>
      <NoticeSheet
        open={confirming}
        text={`${SIGN_OUT_TITLE} ${SIGN_OUT_BODY}`}
        confirmLabel={SIGN_OUT_CONFIRM}
        onConfirm={() => void leave()}
        declineLabel={SIGN_OUT_CANCEL}
        onDecline={() => setConfirming(false)}
        onRequestClose={() => setConfirming(false)}
        testID="sign-out-sheet"
      />
      {failure ? (
        <Text
          style={styles.signOutFailure}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          testID="sign-out-failure"
        >
          {messageFor(failure)}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * A faixa do e-mail não confirmado (2.2), desde o cadastro: o e-mail para onde
 * foi o link e o REENVIAR. Depois dos 7 dias (`overdue`, 2.8), o texto diz que
 * sem confirmar não dá para recuperar a senha; o tom segue `quiet` (a UX pede
 * "faixa discreta"). O resultado do reenvio troca o texto da faixa e é
 * anunciado; no 409 (já confirmado), avisa e busca o perfil de novo, e a faixa some.
 */
export function ConfirmationBanner({ email, overdue }: { email: string; overdue: boolean }) {
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const running = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const resend = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    const outcome = await resendConfirmation(client);
    running.current = false;
    if (!mounted.current) return;
    setBusy(false);
    // Já confirmado (409): o perfil é buscado de novo (a faixa some); até lá, ou se a busca falhar, o aviso fica.
    const text =
      outcome.kind === 'sent'
        ? confirmationResent(email)
        : messageFor(outcome.kind === 'already-confirmed' ? 'EMAIL_ALREADY_CONFIRMED' : outcome.code);
    setNotice(text);
    AccessibilityInfo.announceForAccessibility(text);
  }, [client, email]);
  return (
    <StatusBanner
      tone="quiet"
      text={notice ?? (overdue ? CONFIRM_TO_RECOVER : confirmationSent(email))}
      action={{ label: RESEND_LABEL, onPress: () => void resend(), busy }}
      testID="email-confirmation-banner"
    />
  );
}

const styles = StyleSheet.create({
  signOut: { paddingTop: spacing[2] },
  signOutRow: { flexDirection: 'row', justifyContent: 'flex-end', marginRight: -spacing[3] },
  signOutFailure: { ...typography.meta, color: color.redDk, textAlign: 'right' },
});
