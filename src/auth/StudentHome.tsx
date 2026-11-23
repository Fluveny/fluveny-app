import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError } from '../api/client';
import { messageFor, NETWORK_ERROR } from '../api/errors';
import { AlexWave, Button, NoticeSheet, StatusBanner, TextLink } from '../ui';
import { color, spacing, typography } from '../ui/tokens';
import { resendConfirmation } from './emailConfirmation';
import { signOut } from './sessionEnd';
import type { StudentProfile } from './student';

// Copy da tela inicial do Aluno (2.1). [ASSUMPTION] Textos propostos na 2.1, a revisar com UX.
/** A saudação, em inglês como no painel ("Hi, {nome}!"). */
export const studentGreeting = (name: string | null | undefined) =>
  name?.trim() ? `Hi, ${name.trim()}!` : 'Hi, friend!';
// [ASSUMPTION: copy] Desde a 2.4, o Progresso do Aluno fica na conta.
export const HOME_BODY = 'Sua conta está pronta. Seu progresso fica salvo na sua conta.';
export const HOME_STUDY = 'ESTUDAR AGORA';

// Faixa do e-mail não confirmado (2.2). [ASSUMPTION] Textos propostos na 2.2, a revisar com UX.
// A 2.8 troca o texto e o tom depois dos 7 dias.
export const confirmationSent = (email: string) => `Enviamos um link de confirmação para ${email}.`;
export const confirmationResent = (email: string) => `Enviamos outro link para ${email}. Pode levar alguns minutos.`;
export const RESEND_LABEL = 'REENVIAR';

/** O sair (2.3), discreto no canto da tela inicial; a 2.9 o move para a Conta. */
export const SIGN_OUT_LABEL = 'Sair';
// A folha de confirmação do sair: desde a 2.4, o Progresso do Aluno fica na conta, e o sair apaga
// só o que está no aparelho (a loja e o cache). [ASSUMPTION: copy] Textos propostos na 2.3 e na 2.4, a revisar com UX.
export const SIGN_OUT_TITLE = 'Sair da conta?';
export const SIGN_OUT_BODY = 'Seu progresso fica salvo na sua conta. O que está só neste aparelho será apagado.';
export const SIGN_OUT_CONFIRM = 'SAIR';
export const SIGN_OUT_CANCEL = 'CANCELAR';

const ALEX_SIZE = 180;

/**
 * Tela inicial simples do Aluno com sessão (2.1), na raiz `/`: a saudação e o
 * botão do player de hoje, com o Progresso salvo na conta (2.4). Sem o
 * `VISITOR_SESSION_STARTED` do `openPlayer`: o Aluno não é uma sessão de
 * Visitante. A 2.5
 * troca esta tela pelo painel (AD-12).
 */
export function StudentHome({ student }: { student: StudentProfile }) {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom', 'left', 'right']} testID="student-home">
      <ScrollView contentContainerStyle={styles.content}>
        <SignOut />
        {student.emailConfirmed ? null : <ConfirmationBanner email={student.email} />}
        <View style={styles.grow} />
        <View style={styles.alex}>
          <AlexWave size={ALEX_SIZE} />
        </View>
        <Text style={styles.title} accessibilityRole="header">
          {studentGreeting(student.name)}
        </Text>
        <Text style={styles.body}>{HOME_BODY}</Text>
        <View style={styles.grow} />
      </ScrollView>
      <View style={styles.footer}>
        <Button label={HOME_STUDY} onPress={() => router.navigate('/player')} fullWidth testID="student-home-study" />
      </View>
    </SafeAreaView>
  );
}

/**
 * O link "Sair" (2.3): abre a folha de confirmação; SAIR encerra a sessão no
 * servidor e, com o 204, apaga o
 * token, o cache e a loja do aparelho e volta à boas-vindas, sem histórico.
 * Sem rede ou outro erro, mostra `messageFor(code)` e o aluno continua logado.
 */
function SignOut() {
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
 * foi o link e o REENVIAR. O resultado do reenvio troca o texto da faixa e é
 * anunciado; no 409 (já confirmado), avisa e busca o perfil de novo, e a faixa some.
 */
function ConfirmationBanner({ email }: { email: string }) {
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
      text={notice ?? confirmationSent(email)}
      action={{ label: RESEND_LABEL, onPress: () => void resend(), busy }}
      testID="email-confirmation-banner"
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.canvas },
  signOut: { paddingTop: spacing[2] },
  signOutRow: { flexDirection: 'row', justifyContent: 'flex-end', marginRight: -spacing[3] },
  signOutFailure: { ...typography.meta, color: color.redDk, textAlign: 'right' },
  content: { flexGrow: 1, gap: spacing[4], paddingHorizontal: spacing.screenX },
  grow: { flexGrow: 1 },
  alex: { alignItems: 'center' },
  title: { ...typography.display, color: color.ink, textAlign: 'center' },
  body: { ...typography.body, color: color.mutedStrong, textAlign: 'center' },
  footer: { paddingHorizontal: spacing.screenX, paddingVertical: spacing[3] },
});
