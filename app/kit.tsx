import { Redirect } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  Button,
  Card,
  MODE_TAGS,
  ModeTag,
  ProgressBar,
  WordChip,
  XpChip,
  XpChipLight,
  type ButtonVariant,
  type CardTone,
  type WordChipState,
} from '../src/ui';
import { color, spacing, typography } from '../src/ui/tokens';

const VARIANTS: ButtonVariant[] = ['primary', 'ghost', 'success', 'danger', 'reward', 'disabled'];
const TONES: CardTone[] = ['neutral', 'selected', 'wrong', 'right', 'reward'];
const CHIP_STATES: WordChipState[] = ['idle', 'placed', 'used', 'right', 'wrong'];
const PROGRESS_STEPS = [0, 0.25, 0.5, 1];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.eyebrow} accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

/** Catálogo do kit (história 1.8, Decisão 1). Só em desenvolvimento: no release, volta para `/`. */
function KitCatalog() {
  const [xp, setXp] = useState(20);
  const [step, setStep] = useState(1);
  const [placed, setPlaced] = useState(false);
  const [selected, setSelected] = useState<CardTone | null>(null);
  const progress = PROGRESS_STEPS[step % PROGRESS_STEPS.length] ?? 0;

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.h1} accessibilityRole="header">
          Kit do App
        </Text>

        <Section title="BOTÕES">
          {VARIANTS.map((variant) => (
            <Button key={variant} label={variant} variant={variant} fullWidth onPress={() => {}} />
          ))}
          <Button label="Continuar" variant="success" icon="check" fullWidth onPress={() => {}} />
          <Button label="Pequeno" small onPress={() => {}} />
          <Button label="Desabilitado (prop)" disabled fullWidth onPress={() => {}} />
          <Button label="Salvando…" busy fullWidth onPress={() => {}} />
        </Section>

        <Section title="CARTÕES">
          {TONES.map((tone) => (
            <Card key={tone} tone={tone}>
              <Text style={styles.body}>{`Card ${tone}, sem toque`}</Text>
            </Card>
          ))}
          <Card
            tone={selected === 'selected' ? 'selected' : 'neutral'}
            accessibilityLabel="Card tocável"
            onPress={() => setSelected((t) => (t === 'selected' ? null : 'selected'))}
          >
            <Text style={styles.item}>Card tocável (toque para selecionar)</Text>
          </Card>
        </Section>

        <Section title="XP">
          <View style={styles.row}>
            <XpChip xp={xp} />
            <XpChipLight gain={10} />
          </View>
          <View style={styles.row}>
            <Button label="Ganhar XP" small onPress={() => setXp((v) => v + 10)} />
            <Button label="Perder XP" small variant="ghost" onPress={() => setXp((v) => Math.max(0, v - 10))} />
          </View>
        </Section>

        <Section title="PROGRESSO">
          <ProgressBar value={progress} accessibilityLabel="Progresso de exemplo" />
          <Button label="Avançar" small variant="ghost" onPress={() => setStep((s) => s + 1)} />
        </Section>

        <Section title="CHIPS DE PALAVRA">
          <View style={styles.wrap}>
            {CHIP_STATES.map((state) => (
              <WordChip key={state} label={state} state={state} onPress={() => {}} />
            ))}
            <WordChip label="toque" state={placed ? 'placed' : 'idle'} onPress={() => setPlaced((p) => !p)} />
          </View>
        </Section>

        <Section title="TAGS DE MODO">
          <View style={styles.wrap}>
            {MODE_TAGS.map((label) => (
              <ModeTag key={label} label={label} testID={`mode-tag-${label}`} />
            ))}
          </View>
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

export default function KitScreen() {
  if (!__DEV__) return <Redirect href="/" />;
  return <KitCatalog />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.canvas },
  content: { paddingHorizontal: spacing.screenX, paddingVertical: spacing[6], gap: spacing[6] },
  section: { gap: spacing.half },
  h1: { ...typography.h1, color: color.ink },
  eyebrow: { ...typography.eyebrow, color: color.mutedStrong, textTransform: 'uppercase' },
  body: { ...typography.body, color: color.ink },
  item: { ...typography.item, color: color.ink },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], flexWrap: 'wrap' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
});
