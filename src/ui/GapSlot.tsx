import { useState, type ComponentRef, type Ref } from 'react';
import { StyleSheet, TextInput, View, type NativeSyntheticEvent, type TargetedEvent } from 'react-native';

import { STATE_LABEL } from './a11y';
import { FOCUS_RING } from './TextField';
import { WordChip } from './WordChip';
import { color, edge, rounded, size, spacing, typography } from './tokens';

/** `empty`: sem valor. `filled`: com valor, antes de Verificar. `right`/`wrong`: depois de Verificar. */
export type GapState = 'empty' | 'filled' | 'right' | 'wrong';

export const GAP_STATES: GapState[] = ['empty', 'filled', 'right', 'wrong'];

/** Largura mínima da lacuna vazia do banco [ASSUMPTION: cabe uma palavra curta, como o chip]. */
export const GAP_MIN_WIDTH = 72;

/** Largura do campo da lacuna digitada [ASSUMPTION: uma ou duas palavras]. */
export const GAP_FIELD_WIDTH = 128;

/** O que a lacuna diz ao leitor de tela: "Lacuna 2: your" ou "Lacuna 2, vazia" (EXPERIENCE.md). */
export function gapLabel(index: number, value: string | null | undefined): string {
  const text = value?.trim();
  return text ? `Lacuna ${index}: ${text}` : `Lacuna ${index}, vazia`;
}

type Common = {
  /** A posição da lacuna, a partir de 1. */
  index: number;
  state?: GapState;
  /** Depois de Verificar, ou certa e mantida por TENTAR DE NOVO: sem toque nem edição. */
  locked?: boolean;
  testID?: string;
};

export type GapSlotProps =
  | (Common & {
      kind: 'bank';
      /** A palavra posta, já renderizada; vazia sem palavra. */
      value?: string | null;
      /** Tocar na lacuna preenchida a esvazia. */
      onPress?: () => void;
    })
  | (Common & {
      kind: 'typed';
      value: string;
      onChangeText: (text: string) => void;
      onFocus?: (event: NativeSyntheticEvent<TargetedEvent>) => void;
      inputRef?: Ref<ComponentRef<typeof TextInput>>;
    });

/**
 * Lacuna do Completar lacunas (UX-DR83, UX-DR84). No banco, vazia é um espaço
 * do tamanho do chip com borda tracejada `line-dk`; preenchida, é o
 * `WordChip` `placed` (ou `right`/`wrong` depois de Verificar). Digitada, é um
 * campo curto, sem correção nem maiúscula automática, com a borda do estado.
 * O leitor de tela ouve "Lacuna n: valor" ou "Lacuna n, vazia", e o estado.
 */
export function GapSlot(props: GapSlotProps) {
  const { index, state = 'empty', locked = false, testID } = props;
  const stateWord = state === 'right' || state === 'wrong' ? state : undefined;
  if (props.kind === 'typed') return <TypedGap {...props} state={state} locked={locked} />;
  if (state === 'empty' || !props.value) {
    return <View accessible accessibilityLabel={gapLabel(index, null)} style={styles.empty} testID={testID} />;
  }
  return (
    <WordChip
      label={props.value}
      accessibilityLabel={gapLabel(index, props.value)}
      state={stateWord ?? 'placed'}
      disabled={locked}
      onPress={props.onPress}
      testID={testID}
    />
  );
}

function TypedGap({
  index,
  state,
  locked,
  value,
  onChangeText,
  onFocus,
  inputRef,
  testID,
}: Extract<GapSlotProps, { kind: 'typed' }> & { state: GapState; locked: boolean }) {
  const [focused, setFocused] = useState(false);
  const label = gapLabel(index, value);
  return (
    <TextInput
      ref={inputRef}
      value={value}
      onChangeText={onChangeText}
      editable={!locked}
      accessibilityLabel={state === 'right' || state === 'wrong' ? `${label}, ${STATE_LABEL[state]}` : label}
      accessibilityState={{ disabled: locked }}
      autoCapitalize="none"
      autoCorrect={false}
      autoComplete="off"
      spellCheck={false}
      maxLength={100}
      returnKeyType="done"
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      onBlur={() => setFocused(false)}
      style={[
        styles.field,
        state === 'right' ? styles.right : null,
        state === 'wrong' ? styles.wrong : null,
        focused && !locked ? styles.focused : null,
      ]}
      testID={testID}
    />
  );
}

const styles = StyleSheet.create({
  empty: {
    minWidth: GAP_MIN_WIDTH,
    // A face do chip e a sombra dele: a linha não pula quando a palavra entra.
    height: size.wordChipHeight + edge.chip,
    borderWidth: size.border,
    borderStyle: 'dashed',
    borderColor: color.lineDk,
    borderRadius: rounded.chip,
    backgroundColor: color.surface,
  },
  field: {
    ...typography.item,
    color: color.ink,
    width: GAP_FIELD_WIDTH,
    minHeight: size.wordChipHeight,
    backgroundColor: color.surface,
    borderWidth: size.border,
    borderColor: color.lineDk,
    borderRadius: rounded.chip,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
  },
  right: { backgroundColor: color.tealLt, borderColor: color.teal, color: color.tealDk },
  wrong: { backgroundColor: color.redLt, borderColor: color.red, color: color.redDk },
  // No web, o anel azul é o indicador de foco; o contorno do navegador sairia por cima dele.
  focused: {
    borderColor: color.blue,
    boxShadow: FOCUS_RING,
    outlineWidth: 0,
  },
});
