import { StyleSheet, View } from 'react-native';

import { RenderedText, useRenderVars } from '../../renderer';
import { ModeTag } from '../../ui';
import { color, spacing, typography } from '../../ui/tokens';
import { GapFill } from '../GapFill';
import type { ActivityProps, ActivityView } from '../registry';
import { useGapAttempt } from '../useGapAttempt';

type GapsView = Extract<ActivityView, { type: 'gaps' }>;

/**
 * Completar lacunas (Fill in the Gaps, FR-19, UX-DR83, UX-DR84): as linhas com
 * as lacunas, e o banco de palavras (`bank`) ou um campo por lacuna (`typed`).
 * A mecânica é o `GapFill`; a resposta e a avaliação, o `useGapAttempt`.
 * VERIFICAR fica liberado sem lacuna vazia.
 */
export function GapsActivity({ activity, versionId, setFooter, setSheet, advance }: ActivityProps) {
  const context = useRenderVars();
  const view = activity as GapsView;
  const mode = view.mode === 'typed' ? 'typed' : 'bank';
  const { lines, bank, values, setValues, kept, marks, locked } = useGapAttempt({
    activity,
    versionId,
    setFooter,
    setSheet,
    advance,
    type: 'gaps',
    mode,
    lines: view.lines,
    items: view.items,
    bank: view.bank,
  });

  return (
    <View style={styles.body} testID="gaps-activity">
      <ModeTag label="FILL IN THE GAPS" />
      <RenderedText
        style={styles.title}
        accessibilityRole="header"
        text={view.title}
        vars={context.vars}
        pronoun={context.pronoun}
      />
      {view.prompt ? (
        <RenderedText style={styles.prompt} text={view.prompt} vars={context.vars} pronoun={context.pronoun} />
      ) : null}
      <GapFill
        lines={lines}
        mode={mode}
        bank={bank}
        values={values}
        onChange={setValues}
        marks={marks}
        kept={kept}
        disabled={locked}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing[4] },
  title: { ...typography.title, color: color.ink },
  prompt: { ...typography.body, color: color.mutedStrong },
});
