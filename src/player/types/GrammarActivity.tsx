import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View, type TextStyle } from 'react-native';

import { RenderedText, useRenderVars, type ContentText } from '../../renderer';
import { Card, ModeTag } from '../../ui';
import { color, fontFamily, rounded, size, spacing, typography } from '../../ui/tokens';
import type { ActivityProps, ActivityView } from '../registry';

type GrammarView = Extract<ActivityView, { type: 'grammar' }>;

/** As três abas (UX-DR54), na ordem. */
export const GRAMMAR_TABS = ['1. Você já usou', '2. A regra', '3. Na prática'] as const;
export const NEXT_LABEL = 'PRÓXIMO';
export const CONTINUE_LABEL = 'CONTINUAR';
/** Abertura da aba 1, texto do App (sem citar cor: o destaque não é por cor). */
export const USED_INTRO = 'Você já usou estas formas neste Estágio. Repare na parte em destaque:';

/** O destaque da forma: peso e sublinhado em `ink`, nunca em cor (DESIGN.md, vermelho só para recompensa e erro). */
const FORM_HIGHLIGHT: TextStyle = {
  color: color.ink,
  textDecorationLine: 'underline',
  textDecorationColor: color.ink,
};

const list = <T,>(value: T[] | undefined): T[] => (Array.isArray(value) ? value : []);

/**
 * Grammar Time (FR-15, UX-DR54, UX-DR79): três abas segmentadas, tocáveis
 * desde a entrada [ASSUMPTION: abas livres, como no protótipo], sempre
 * começando na 1. "Você já usou" mostra as frases do Estágio com a forma em
 * destaque e as Variáveis do Aluno; "A regra", a tabela forma · uso · exemplo;
 * "Na prática", os exemplos. PRÓXIMO vai para a aba seguinte e, na 3,
 * CONTINUAR conclui com `viewed`. Sem correção, sem XP.
 */
export function GrammarActivity({ activity, setFooter, advance }: ActivityProps) {
  const context = useRenderVars();
  const view = activity as GrammarView;
  const used = useMemo(() => list(view.used), [view.used]);
  const rules = useMemo(() => list(view.rules), [view.rules]);
  const examples = useMemo(() => list(view.examples), [view.examples]);
  const [tab, setTab] = useState(0);
  const last = tab >= GRAMMAR_TABS.length - 1;

  const onPress = useCallback(() => {
    if (last) {
      advance({ outcome: 'viewed', xp: 0 });
      return;
    }
    setTab(tab + 1);
  }, [last, tab, advance]);

  // A troca de aba é anunciada (por toque ou PRÓXIMO); a entrada, não.
  const shownTab = useRef(tab);
  useEffect(() => {
    if (shownTab.current === tab) return;
    shownTab.current = tab;
    AccessibilityInfo.announceForAccessibility(GRAMMAR_TABS[tab]!);
  }, [tab]);

  useEffect(() => {
    setFooter({ label: last ? CONTINUE_LABEL : NEXT_LABEL, onPress });
  }, [setFooter, last, onPress]);

  const text = (value: ContentText, style: TextStyle, strong = false) => (
    <RenderedText
      style={style}
      text={value}
      vars={context.vars}
      pronoun={context.pronoun}
      {...(strong ? { strongStyle: FORM_HIGHLIGHT } : {})}
    />
  );

  return (
    <View style={styles.body} testID="grammar-activity">
      <ModeTag label="GRAMMAR TIME" />
      <RenderedText
        style={styles.title}
        accessibilityRole="header"
        text={view.title}
        vars={context.vars}
        pronoun={context.pronoun}
      />
      <View style={styles.tabs} accessibilityRole="tablist" testID="grammar-tabs">
        {GRAMMAR_TABS.map((label, k) => {
          const selected = k === tab;
          return (
            <Pressable
              key={label}
              onPress={selected ? undefined : () => setTab(k)}
              accessibilityRole="tab"
              accessibilityLabel={label}
              accessibilityState={{ selected }}
              style={[styles.tab, selected && styles.tabSelected]}
              testID={`grammar-tab-${k + 1}`}
            >
              <Text style={[styles.tabText, selected && styles.tabTextSelected]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
      {tab === 0 ? (
        <View style={styles.panel} testID="grammar-used">
          <Text style={styles.intro}>{USED_INTRO}</Text>
          {used.map((entry) => (
            <Card key={entry.sentenceKey} testID={`grammar-used-${entry.sentenceKey}`}>
              <View style={styles.cardBody}>
                {text(entry.form, styles.formLabel)}
                {text(entry.sentence, styles.sentence, true)}
              </View>
            </Card>
          ))}
        </View>
      ) : null}
      {tab === 1 ? (
        <Card testID="grammar-rules">
          <View>
            {rules.map((rule, k) => (
              <View
                key={rule.ruleKey}
                style={[styles.rule, k > 0 && styles.ruleDivider]}
                testID={`grammar-rule-${rule.ruleKey}`}
              >
                <View style={styles.ruleForm}>{text(rule.form, styles.ruleFormText)}</View>
                <View style={styles.ruleText}>
                  {text(rule.use, styles.ruleUse)}
                  {text(rule.example, styles.sentence, true)}
                </View>
              </View>
            ))}
          </View>
        </Card>
      ) : null}
      {tab === 2 ? (
        <View style={styles.panel} testID="grammar-examples">
          {examples.map((example) => (
            <Card key={example.exampleKey} testID={`grammar-example-${example.exampleKey}`}>
              {text(example.text, styles.sentence, true)}
            </Card>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing[4] },
  title: { ...typography.title, color: color.ink },
  tabs: {
    flexDirection: 'row',
    gap: spacing[1],
    padding: spacing[1],
    borderRadius: rounded.md,
    backgroundColor: color.line,
  },
  // Área de toque de 48 dp (UX-DR137); o rótulo quebra a linha, nunca corta.
  tab: {
    flex: 1,
    minHeight: size.touchMin,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing[1],
    paddingVertical: spacing[1],
    borderRadius: rounded.sm,
  },
  tabSelected: { backgroundColor: color.surface },
  tabText: {
    ...typography.caption,
    fontFamily: fontFamily[700],
    fontWeight: '700',
    color: color.mutedStrong,
    textAlign: 'center',
  },
  tabTextSelected: { fontFamily: fontFamily[900], fontWeight: '900', color: color.blue },
  panel: { gap: spacing[3] },
  intro: { ...typography.body, color: color.mutedStrong },
  cardBody: { gap: spacing[1] },
  formLabel: { ...typography.eyebrow, color: color.muted },
  // Peso de base 500: o negrito (800) da forma fica visível.
  sentence: { ...typography.body, fontSize: typography.item.fontSize, color: color.ink },
  rule: { flexDirection: 'row', gap: spacing[3], paddingVertical: spacing.half },
  ruleDivider: { borderTopWidth: size.border, borderTopColor: color.line },
  ruleForm: { width: '24%', flexShrink: 0 },
  ruleFormText: { ...typography.item, color: color.ink },
  ruleText: { flex: 1, gap: spacing[1] },
  ruleUse: { ...typography.body, color: color.mutedStrong },
});
