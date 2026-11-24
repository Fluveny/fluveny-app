import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError } from '../api/client';
import { messageFor } from '../api/errors';
import { ACCOUNT_PATH } from '../auth/accountPaths';
import { ConfirmationBanner, studentGreeting } from '../auth/StudentHome';
import { GuardianBanner } from '../auth/GuardianBanner';
import { guardianPending } from '../auth/guardianConsent';
import type { StudentProfile } from '../auth/student';
import { useOnline } from '../network/useOnline';
import { OFFLINE_LABEL, OFFLINE_TEXT } from '../network/text';
import { playerHref } from '../player/playerRoute';
import { reportReadFailure } from '../player/studentProgress';
import { UNIT_KEY, useStage } from '../player/useStage';
import { renderPlain, useRenderVars, type RenderContext } from '../renderer';
import { Button, Card, Icon, Pressable3D, ProgressBar, StatusBanner, XpChip } from '../ui';
import { color, fontFamily, size, spacing, typography } from '../ui/tokens';
import { useVisitor } from '../visitor/useVisitor';
import {
  comingSoonUnits,
  focusUnit,
  pendingDashboard,
  useDashboard,
  type Dashboard,
  type DashboardStage,
  type DashboardUnit,
} from './dashboard';

// Copy do painel (2.5, UX-DR100 a UX-DR102, EXPERIENCE.md Voice and Tone).
/** O subtítulo do cabeçalho (EXPERIENCE.md, Voice and Tone; UX-DR100). */
/** O botão de perfil do cabeçalho (2.9), que abre a Conta. [ASSUMPTION: copy] */
export const ACCOUNT_LABEL = 'Conta';
const ACCOUNT_ICON = 26;
export const DASHBOARD_SUBTITLE = 'Bora continuar o seu primeiro dia?';
export const DASHBOARD_START = 'COMEÇAR';
export const DASHBOARD_CONTINUE = 'CONTINUAR';
export const DASHBOARD_RETRY = 'TENTAR DE NOVO';
export const DASHBOARD_LOADING = 'Carregando o painel';
export const STAGES_EYEBROW = 'ESTÁGIOS';
export const STAT_XP = 'XP TOTAL';
export const STAT_BADGES = 'BADGES';
export const STAT_STAGES = 'ESTÁGIOS';
export const STAT_RESULT = 'RESULTADO MÉDIO';
/** O Resultado médio sem nenhuma Atividade corrigida (UX-DR101). */
export const NO_RESULT = '–';
// [ASSUMPTION: copy] Textos propostos na 2.5, a revisar com UX.
export const NO_RESULT_LABEL = 'Resultado médio: ainda sem Resultado';
export const NO_UNIT = 'Nenhuma Unidade disponível agora.';
export const ALL_DONE = 'Você concluiu os Estágios disponíveis. Os próximos chegam em breve.';
export const COMING_SOON = 'Em breve';
/** O que o leitor de tela diz de cada número e da barra da Unidade. [ASSUMPTION: copy] */
export const spokenXp = (xp: number) => `XP total: ${xp}`;
export const spokenBadges = (count: number) => `Badges: ${count}`;
export const spokenStages = (done: number, total: number) => `Estágios: ${done} de ${total}`;
export const spokenResult = (pct: number) => `Resultado médio: ${pct}%`;
export const UNIT_PROGRESS_LABEL = 'Estágios concluídos';
export const LOCKED_HINT = 'Conclua o Estágio anterior para desbloquear.';

/** O eyebrow do cartão da Unidade: "UNIT 1 · 0 DE 1 ESTÁGIOS". */
export const unitEyebrow = (unit: DashboardUnit) =>
  `UNIT ${unit.order} · ${unit.stagesCompleted} DE ${unit.stagesTotal} ESTÁGIOS`;
/** Onde o Aluno está no Estágio atual: "ATIVIDADE 3 DE 13". */
export const nextLine = (position: number, total: number) => `ATIVIDADE ${position} DE ${total}`;
/** O que o leitor de tela diz do Cartão de Estágio. */
export const stageLabel = (number: number, title: string, state: DashboardStage['state']) =>
  state === 'LOCKED'
    ? `Estágio ${number}, ${title}. ${LOCKED_HINT}`
    : `Estágio ${number}, ${title}${state === 'COMPLETED' ? ', concluído' : ', atual'}`;

/** O bloco de 50 px do Cartão de Estágio (DESIGN.md, Components). */
const STAGE_BLOCK = 50;
/** Cartão bloqueado: 60% de opacidade (UX-DR47). */
const LOCKED_OPACITY = 0.6;

/** Título do conteúdo em texto puro, com as Variáveis do Aluno; falha vira vazio. */
function plain(text: DashboardUnit['title'], context: RenderContext): string {
  try {
    return renderPlain(text, context.vars, context.pronoun);
  } catch {
    return '';
  }
}

/**
 * O painel do Aluno (2.5), a raiz com sessão: o cabeçalho azul com a saudação
 * e o chip de XP, as faixas do e-mail (2.2, 2.8), o cartão da Unidade em foco
 * com COMEÇAR/CONTINUAR, as estatísticas, os Cartões de Estágio, as Unidades
 * "em breve" e o Sair (até a 2.9). Tudo vem do `GET /students/me/dashboard`.
 * Sem rede, o painel do cache fica, com a faixa offline e sem abrir o player.
 */
export function StudentDashboard({ student }: { student: StudentProfile }) {
  const router = useRouter();
  const online = useOnline();
  const query = useDashboard();
  const context = useRenderVars();
  const { data: serverData, error, isPending, refetch, isFetching } = query;
  // O adolescente pendente (2.11) joga como Visitante: os números são os da loja do aparelho.
  const pending = guardianPending(student);
  const visitor = useVisitor();
  // As Atividades do Estágio 1 (o mesmo cache do player do Visitante), só para o pendente.
  const stageOne = useStage(UNIT_KEY, undefined, pending).stage;
  const stageOneKeys = useMemo(
    () => (Array.isArray(stageOne?.activities) ? stageOne.activities.map((entry) => entry.activityKey) : undefined),
    [stageOne],
  );
  const data = useMemo(
    () => (serverData && pending ? pendingDashboard(serverData, visitor.progress, stageOneKeys) : serverData),
    [serverData, pending, visitor.progress, stageOneKeys],
  );

  // A falha da leitura vai ao Sentry (menos sem rede e o 401, que fica com o ponto único da 2.3).
  useEffect(() => {
    if (error) reportReadFailure(error);
  }, [error]);

  // A rede voltou: o painel é relido.
  const wasOnline = useRef(online);
  useEffect(() => {
    const back = online && !wasOnline.current;
    wasOnline.current = online;
    if (back) void refetch();
  }, [online, refetch]);

  if (isPending && !error) {
    return (
      <SafeAreaView style={[styles.screen, styles.center]} testID="dashboard-loading">
        <ActivityIndicator size="large" color={color.blue} accessibilityLabel={DASHBOARD_LOADING} />
      </SafeAreaView>
    );
  }

  const name = data?.name ?? student.name;
  const unit = focusUnit(data);
  const open = (href: ReturnType<typeof playerHref>) => router.navigate(href);

  return (
    <SafeAreaView style={styles.screen} edges={['left', 'right', 'bottom']} testID="student-dashboard">
      <ScrollView contentContainerStyle={styles.scroll}>
        <SafeAreaView style={styles.header} edges={['top']}>
          {online ? null : <StatusBanner tone="offline" text={OFFLINE_TEXT} />}
          <View style={styles.headerRow}>
            <View style={styles.headerText}>
              <Text style={styles.greeting} accessibilityRole="header">
                {studentGreeting(name)}
              </Text>
              {unit?.next ? <Text style={styles.subtitle}>{DASHBOARD_SUBTITLE}</Text> : null}
            </View>
            {data ? <XpChip xp={data.xpTotal} /> : null}
            <Pressable3D
              accessibilityLabel={ACCOUNT_LABEL}
              onPress={() => router.navigate(ACCOUNT_PATH)}
              edge={{ color: color.blue, height: 0 }}
              minHeight={size.touchMin}
              style={styles.account}
              testID="dashboard-account"
            >
              <Icon name="user" size={ACCOUNT_ICON} color={color.surface} />
            </Pressable3D>
          </View>
        </SafeAreaView>
        <View style={styles.body}>
          {pending ? <GuardianBanner ownEmail={student.email} /> : null}
          {student.emailConfirmed ? null : (
            <ConfirmationBanner email={student.email} overdue={student.emailConfirmationOverdue} />
          )}
          {data ? (
            <DashboardBody data={data} unit={unit} online={online} context={context} open={open} />
          ) : (
            <View style={styles.failure}>
              {/* Sem rede, a faixa offline já diz o que houve: uma mensagem só, e TENTAR DE NOVO espera a rede. */}
              {online ? (
                <Text style={styles.failureText} accessibilityRole="alert" accessibilityLiveRegion="polite">
                  {messageFor(error instanceof ApiError ? error.code : undefined)}
                </Text>
              ) : null}
              <Button
                label={DASHBOARD_RETRY}
                disabled={!online}
                busy={isFetching}
                onPress={() => void refetch()}
                fullWidth
                testID="dashboard-retry"
              />
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function DashboardBody({
  data,
  unit,
  online,
  context,
  open,
}: {
  data: Dashboard;
  unit: DashboardUnit | undefined;
  online: boolean;
  context: RenderContext;
  open: (href: ReturnType<typeof playerHref>) => void;
}) {
  const soon = comingSoonUnits(data);
  const stages = unit && Array.isArray(unit.stages) ? unit.stages : [];
  const average = unit?.averageResultPct;
  return (
    <>
      <UnitCard unit={unit} online={online} context={context} open={open} />
      <View style={styles.stats}>
        <Stat label={STAT_XP} value={String(data.xpTotal)} spoken={spokenXp(data.xpTotal)} />
        <Stat label={STAT_BADGES} value={String(data.badgeCount)} spoken={spokenBadges(data.badgeCount)} />
        <Stat
          label={STAT_STAGES}
          value={unit ? `${unit.stagesCompleted}/${unit.stagesTotal}` : '0/0'}
          spoken={unit ? spokenStages(unit.stagesCompleted, unit.stagesTotal) : spokenStages(0, 0)}
        />
        <Stat
          label={STAT_RESULT}
          value={typeof average === 'number' ? `${average}%` : NO_RESULT}
          spoken={typeof average === 'number' ? spokenResult(average) : NO_RESULT_LABEL}
        />
      </View>
      {stages.length > 0 || soon.length > 0 ? <Text style={styles.eyebrow}>{STAGES_EYEBROW}</Text> : null}
      {unit
        ? stages.map((stage, index) => (
            <StageCard
              key={stage.stageKey}
              number={index + 1}
              stage={stage}
              title={plain(stage.title, context)}
              next={unit.next?.stageKey === stage.stageKey ? unit.next : undefined}
              online={online}
              onOpen={() => open(playerHref({ unidade: unit.unitKey, estagio: stage.stageKey }))}
            />
          ))
        : null}
      {soon.map((entry) => {
        const title = plain(entry.title, context);
        return (
          <View
            key={entry.unitKey}
            accessible
            accessibilityLabel={`${title}, em breve`}
            style={styles.locked}
            testID={`coming-soon-${entry.unitKey}`}
          >
            <Card>
              <View style={styles.stageRow}>
                <View style={[styles.block, styles.blockLocked]}>
                  <Icon name="lock" size={size.stateIcon} color={color.muted} />
                </View>
                <View style={styles.stageText}>
                  <Text style={styles.stageTitle}>{title}</Text>
                  <Text style={styles.meta}>{COMING_SOON}</Text>
                </View>
              </View>
            </Card>
          </View>
        );
      })}
    </>
  );
}

/** O cartão da Unidade em foco: eyebrow, título, barra de Estágios e COMEÇAR/CONTINUAR. */
function UnitCard({
  unit,
  online,
  context,
  open,
}: {
  unit: DashboardUnit | undefined;
  online: boolean;
  context: RenderContext;
  open: (href: ReturnType<typeof playerHref>) => void;
}) {
  if (!unit) {
    return (
      <Card testID="unit-card">
        <Text style={styles.body15}>{NO_UNIT}</Text>
      </Card>
    );
  }
  const { next } = unit;
  const ratio = unit.stagesTotal > 0 ? unit.stagesCompleted / unit.stagesTotal : 0;
  return (
    <Card testID="unit-card">
      <View style={styles.unit}>
        <Text style={styles.eyebrow}>{unitEyebrow(unit)}</Text>
        <Text style={styles.unitTitle}>{plain(unit.title, context)}</Text>
        <ProgressBar value={ratio} accessibilityLabel={UNIT_PROGRESS_LABEL} testID="unit-progress" />
        {next ? (
          <Button
            label={online ? (unit.started ? DASHBOARD_CONTINUE : DASHBOARD_START) : OFFLINE_LABEL}
            disabled={!online}
            onPress={() =>
              open(playerHref({ unidade: unit.unitKey, estagio: next.stageKey, atividade: next.activityKey }))
            }
            fullWidth
            testID="dashboard-play"
          />
        ) : (
          <Text style={styles.body15}>{ALL_DONE}</Text>
        )}
      </View>
    </Card>
  );
}

/** Um número do painel, lido como um todo pelo leitor de tela. */
function Stat({ label, value, spoken }: { label: string; value: string; spoken: string }) {
  return (
    <View style={styles.stat} accessible accessibilityLabel={spoken}>
      <Card>
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.eyebrow}>{label}</Text>
      </Card>
    </View>
  );
}

/**
 * O Cartão de Estágio (UX-DR47, UX-DR48): o atual em azul com o número, o
 * concluído com ✓ em turquesa (os dois tocáveis, abrem do início) e o
 * bloqueado com cadeado a 60%, sem toque.
 */
function StageCard({
  number,
  stage,
  title,
  next,
  online,
  onOpen,
}: {
  number: number;
  stage: DashboardStage;
  title: string;
  next: DashboardUnit['next'];
  online: boolean;
  onOpen: () => void;
}) {
  const content = useMemo(
    () => (
      <View style={styles.stageRow}>
        <View
          style={[
            styles.block,
            stage.state === 'CURRENT' ? styles.blockCurrent : null,
            stage.state === 'COMPLETED' ? styles.blockDone : null,
            stage.state === 'LOCKED' ? styles.blockLocked : null,
          ]}
        >
          {stage.state === 'CURRENT' ? <Text style={styles.blockNumber}>{number}</Text> : null}
          {stage.state === 'COMPLETED' ? <Icon name="check" size={size.stateIcon} color={color.surface} /> : null}
          {stage.state === 'LOCKED' ? <Icon name="lock" size={size.stateIcon} color={color.muted} /> : null}
        </View>
        <View style={styles.stageText}>
          <Text style={styles.stageTitle}>{title}</Text>
          {next ? <Text style={styles.meta}>{nextLine(next.position, next.total)}</Text> : null}
        </View>
      </View>
    ),
    [stage.state, number, title, next],
  );
  const testID = `stage-card-${stage.stageKey}`;
  if (stage.state === 'LOCKED') {
    return (
      <View accessible accessibilityLabel={stageLabel(number, title, 'LOCKED')} style={styles.locked} testID={testID}>
        <Card>{content}</Card>
      </View>
    );
  }
  return (
    <Card
      tone={stage.state === 'CURRENT' ? 'selected' : 'neutral'}
      onPress={onOpen}
      disabled={!online}
      accessibilityLabel={stageLabel(number, title, stage.state)}
      testID={testID}
    >
      {content}
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.canvas },
  center: { alignItems: 'center', justifyContent: 'center' },
  scroll: { flexGrow: 1 },
  header: {
    backgroundColor: color.blue,
    borderBottomLeftRadius: size.welcomeSheetRadius,
    borderBottomRightRadius: size.welcomeSheetRadius,
    paddingHorizontal: spacing.screenX,
    paddingTop: spacing[3],
    paddingBottom: spacing[6],
    gap: spacing[3],
  },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[3] },
  headerText: { flex: 1, gap: spacing[1] },
  account: { width: size.touchMin, alignItems: 'center', justifyContent: 'center', marginTop: -spacing[2] },
  greeting: { ...typography.display, color: color.surface },
  subtitle: { ...typography.bodyStrong, color: color.surface },
  body: { paddingHorizontal: spacing.screenX, paddingTop: spacing[4], paddingBottom: spacing[4], gap: spacing[3] },
  unit: { gap: spacing[3] },
  unitTitle: { ...typography.title, color: color.ink },
  eyebrow: { ...typography.eyebrow, color: color.mutedStrong },
  body15: { ...typography.body, color: color.mutedStrong },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[3] },
  stat: { flexBasis: '45%', flexGrow: 1 },
  statValue: { ...typography.title, color: color.ink },
  stageRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[3] },
  block: {
    width: STAGE_BLOCK,
    height: STAGE_BLOCK,
    borderRadius: size.xpChipRadius,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blockCurrent: { backgroundColor: color.blue },
  blockDone: { backgroundColor: color.teal },
  blockLocked: { backgroundColor: color.line },
  blockNumber: { ...typography.title, fontFamily: fontFamily[900], color: color.surface },
  stageText: { flex: 1, gap: spacing[1] },
  stageTitle: { ...typography.item, color: color.ink },
  meta: { ...typography.meta, color: color.mutedStrong },
  locked: { opacity: LOCKED_OPACITY },
  failure: { gap: spacing[3], paddingVertical: spacing[4] },
  failureText: { ...typography.bodyStrong, color: color.ink, textAlign: 'center' },
});
