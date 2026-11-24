import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ACCOUNT_DELETED_REASON } from '../../src/auth/accountPaths';
import { SIGN_IN_PATH } from '../../src/auth/sessionEnd';
import { mayHaveSession, useCachedStudent, useStudent } from '../../src/auth/student';
import { StudentDashboard } from '../../src/dashboard/StudentDashboard';
import { PRIVACY_LINK, PRIVACY_PATH, TERMS_LINK, TERMS_PATH } from '../../src/legal/paths';
import { useOnline } from '../../src/network/useOnline';
import { OFFLINE_TEXT } from '../../src/network/text';
import { checkVisitorStageComplete } from '../../src/player/stageComplete';
import { AlexWave, Button, Room, StatusBanner, sceneHeight, TextLink } from '../../src/ui';
import { color, size, spacing, typography } from '../../src/ui/tokens';
import { openPlayer } from '../../src/visitor/events';

// Copy da boas-vindas (EXPERIENCE.md, Voice and Tone).
export const WELCOME_TITLE = 'Seu primeiro dia na universidade. Em inglês.';
export const WELCOME_BODY =
  'Conheça o Alex, seu colega de quarto, e aprenda a se apresentar falando, escrevendo e jogando. Grátis.';
/** Objetivo da Unit 1, em inglês, fixo no App [ASSUMPTION: Decisão 2 da 1.10; o conteúdo não tem `goal`]. */
export const WELCOME_GOAL = 'Learn how to introduce yourself, talk about yourself, and meet new people.';
export const TRY_NOW = 'EXPERIMENTAR AGORA';
export const SIGN_UP = 'CRIAR CONTA';
export const SIGN_IN = 'ENTRAR';
/** O aviso depois da exclusão da conta (`motivo=conta-excluida`, 2.10). [ASSUMPTION: copy] */
export const ACCOUNT_DELETED = 'Sua conta foi excluída.';
/** O convite ao cadastro, no lugar do Estágio 2 (1.20). */
export const INVITE_PATH = '/convite';
/** O cadastro (2.1). */
export const SIGN_UP_PATH = '/cadastro';

/**
 * Para onde o EXPERIMENTAR AGORA leva: com o Estágio 1 completo no aparelho, ao
 * convite (o "Estágio 2" do Visitante, 1.20); senão, ao player. Sem rede, direto
 * ao player (que mostra o aviso). Se a API falhar, ao player, que mostra o erro
 * e o TENTAR DE NOVO; se a loja falhar, também, e a falha vai ao Sentry. A
 * conferência tem um prazo único (`REQUEST_TIMEOUT_MS`); estourado, ao player.
 * Se a boas-vindas sair da tela no meio, não faz nada.
 */
function useTryNow(online: boolean) {
  const router = useRouter();
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const tryNow = useCallback(async () => {
    if (running.current) return;
    if (!online) {
      openPlayer(router);
      return;
    }
    running.current = true;
    setBusy(true);
    const done = await checkVisitorStageComplete(client);
    running.current = false;
    if (!mounted.current) return;
    setBusy(false);
    if (done) router.navigate(INVITE_PATH);
    else openPlayer(router);
  }, [client, router, online]);
  return { tryNow, busy };
}

/**
 * A raiz (2.1): com sessão, o painel do Aluno (2.5); sem sessão (401, ou o
 * Android sem token), a boas-vindas. No web, enquanto pergunta à API, só o fundo
 * azul da boas-vindas; qualquer falha da pergunta mostra a boas-vindas.
 */
export default function Root() {
  // O cache acorda a raiz logo depois do cadastro (o token acabou de ser guardado).
  const cached = useCachedStudent();
  return cached || mayHaveSession() ? <SessionRoot /> : <Welcome />;
}

function SessionRoot() {
  const student = useStudent();
  if (student.isPending) return <View style={styles.screen} testID="root-checking" />;
  if (student.data) return <StudentDashboard student={student.data} />;
  return <Welcome />;
}

/**
 * Boas-vindas, a raiz do Visitante (FR-1): o quarto com Alex acenando e a
 * folha branca com o título, o objetivo da Unit 1 e as três ações. Rola com a
 * fonte ampliada.
 */
export function Welcome() {
  const router = useRouter();
  const online = useOnline();
  const { height } = useWindowDimensions();
  const { tryNow, busy } = useTryNow(online);
  const { motivo } = useLocalSearchParams<{ motivo?: string }>();
  // O aviso da conta excluída aparece uma vez: é anunciado e o `motivo` sai da URL (recarregar não o mostra de novo).
  const [deleted] = useState(motivo === ACCOUNT_DELETED_REASON);
  useEffect(() => {
    if (motivo !== ACCOUNT_DELETED_REASON) return;
    AccessibilityInfo.announceForAccessibility(ACCOUNT_DELETED);
    router.setParams({ motivo: undefined });
  }, [motivo, router]);
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      {online ? null : (
        <View style={styles.banner}>
          <StatusBanner tone="offline" text={OFFLINE_TEXT} />
        </View>
      )}
      {deleted ? (
        <View style={styles.banner}>
          <StatusBanner tone="notice" text={ACCOUNT_DELETED} testID="welcome-account-deleted" />
        </View>
      ) : null}
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} bounces={false}>
        <View style={[styles.scene, { minHeight: Math.round(sceneHeight(height) * SCENE_SHARE) }]}>
          <Room />
          <View style={styles.alex}>
            <AlexWave size={ALEX_SIZE} />
          </View>
        </View>
        <SafeAreaView style={styles.sheet} edges={['bottom']}>
          <Text style={styles.title} accessibilityRole="header">
            {WELCOME_TITLE}
          </Text>
          <Text style={styles.body}>{WELCOME_BODY}</Text>
          <Text style={styles.goal} lang="en">
            {WELCOME_GOAL}
          </Text>
          <View style={styles.actions}>
            <Button label={TRY_NOW} onPress={() => void tryNow()} busy={busy} fullWidth />
            {/* Com o EXPERIMENTAR ocupado, as outras ações esperam: senão, ele arrastaria para o player depois. */}
            <Button
              label={SIGN_UP}
              variant="ghost"
              disabled={busy}
              onPress={() => router.navigate(SIGN_UP_PATH)}
              fullWidth
            />
            <Button
              label={SIGN_IN}
              variant="ghost"
              small
              disabled={busy}
              onPress={() => router.navigate(SIGN_IN_PATH)}
              fullWidth
            />
          </View>
          <View style={styles.legal}>
            <TextLink
              label={PRIVACY_LINK}
              small
              disabled={busy}
              onPress={() => router.navigate(PRIVACY_PATH)}
              testID="welcome-privacy"
            />
            <TextLink
              label={TERMS_LINK}
              small
              disabled={busy}
              onPress={() => router.navigate(TERMS_PATH)}
              testID="welcome-terms"
            />
          </View>
        </SafeAreaView>
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * A cena começa em 57% da do Diálogo e cresce com a tela: a folha com as três
 * ações e os links da política e dos termos (1.21) precisa caber sem rolar num
 * celular de 360×740.
 */
const SCENE_SHARE = 0.57;
/** Alex um pouco menor que em cena (205), para caber na cena reduzida [ASSUMPTION]. */
const ALEX_SIZE = 180;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.blue },
  banner: { paddingHorizontal: spacing.screenX, paddingVertical: spacing[2] },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  scene: { flexGrow: 1, overflow: 'hidden', justifyContent: 'flex-end', alignItems: 'center' },
  // A folha sobe o raio por cima da cena: atrás dos cantos arredondados aparece o quarto, não o azul da tela.
  // O Alex sobe o mesmo tanto e continua cortado pela folha no mesmo ponto.
  alex: { pointerEvents: 'none', marginBottom: size.welcomeSheetRadius - spacing[6] },
  sheet: {
    marginTop: -size.welcomeSheetRadius,
    backgroundColor: color.surface,
    borderTopLeftRadius: size.welcomeSheetRadius,
    borderTopRightRadius: size.welcomeSheetRadius,
    paddingHorizontal: spacing[6],
    paddingTop: spacing[6],
    paddingBottom: spacing[1],
    gap: spacing[3],
  },
  title: { ...typography.display, color: color.ink },
  body: { ...typography.body, color: color.muted },
  goal: { ...typography.item, color: color.blue },
  actions: { gap: spacing.half, marginTop: spacing[2] },
  // Os links da política e dos termos (1.21), numa linha abaixo das ações; quebram com a fonte ampliada.
  legal: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: -spacing[3] },
});
