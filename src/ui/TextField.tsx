import { useState, type ComponentRef, type Ref } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { useInteraction } from './interaction';
import { color, overlay, rounded, size, spacing, typography } from './tokens';

export type TextFieldProps = Omit<
  TextInputProps,
  'style' | 'accessibilityLabel' | 'aria-label' | 'aria-labelledby' | 'placeholderTextColor'
> & {
  /** Rótulo visível acima do campo, em português; é também o rótulo do leitor de tela. */
  label: string;
  /** O nó do campo (para levá-lo acima do teclado no player, `useRevealField`). */
  inputRef?: Ref<ComponentRef<typeof TextInput>>;
  /** Dica fixa abaixo do campo, em `muted-strong` ("8 a 64 caracteres…"). */
  hint?: string;
  /** O que falta no campo, abaixo dele, em `red-dk`, com a borda em `red`; o leitor ouve como dica. */
  error?: string;
};

/** Anel de foco do `text-field`: `0 0 0 4px` azul a 14%, sem desfoque. */
export const FOCUS_RING = `0px 0px 0px ${size.focusRing}px ${overlay.focusRing}`;

/**
 * Campo de texto (DESIGN.md `text-field`): face mínima de 54 dp, borda de 2 em
 * `line`, texto `item` em `ink`, placeholder `muted`. Com foco, borda `blue` e
 * anel de 4 dp. A altura é mínima: com a fonte ampliada, o campo cresce.
 */
export function TextField({
  label,
  onFocus,
  onBlur,
  onChangeText,
  multiline,
  inputRef,
  hint,
  error,
  testID = 'text-field',
  ...input
}: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  const interacted = useInteraction();
  const help = [error, hint].filter(Boolean).join(' ');
  return (
    <View style={styles.wrap}>
      <Text style={styles.label} importantForAccessibility="no" aria-hidden>
        {label}
      </Text>
      <TextInput
        {...input}
        ref={inputRef}
        multiline={multiline}
        testID={testID}
        accessibilityLabel={label}
        accessibilityHint={help || undefined}
        placeholderTextColor={color.muted}
        onChangeText={
          onChangeText &&
          ((text) => {
            interacted();
            onChangeText(text);
          })
        }
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        style={[
          styles.field,
          multiline ? styles.multiline : null,
          error ? styles.invalid : null,
          focused ? styles.focused : null,
        ]}
      />
      {error ? (
        <Text style={styles.error} testID={`${testID}-error`} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
      {hint ? (
        <Text style={styles.hint} importantForAccessibility="no" aria-hidden>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing[2], alignSelf: 'stretch' },
  label: { ...typography.bodyStrong, color: color.ink },
  field: {
    ...typography.item,
    color: color.ink,
    backgroundColor: color.surface,
    minHeight: size.textFieldHeight,
    borderWidth: size.border,
    borderColor: color.line,
    borderRadius: rounded.md,
    paddingHorizontal: size.textFieldPaddingX,
    paddingVertical: spacing[3],
  },
  multiline: { textAlignVertical: 'top' },
  invalid: { borderColor: color.red },
  error: { ...typography.meta, color: color.redDk },
  hint: { ...typography.caption, color: color.mutedStrong },
  // No web, o anel azul é o indicador de foco; o contorno do navegador sairia por cima dele.
  focused: { borderColor: color.blue, boxShadow: FOCUS_RING, outlineWidth: 0 },
});
