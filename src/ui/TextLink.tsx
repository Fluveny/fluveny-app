import { StyleSheet, Text } from 'react-native';

import { Pressable3D } from './Pressable3D';
import { color, size, spacing, typography } from './tokens';

export type TextLinkProps = {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  /** Ação em andamento: desabilitado e anunciado como ocupado. */
  busy?: boolean;
  /** Em caixa alta, com o peso de botão ("NÃO POSSO FALAR AGORA"); senão, texto corrido ("Permitir microfone"). */
  caps?: boolean;
  /** Texto corrido menor (caption), para links de rodapé, como os da política e dos termos. A área de toque segue em 48 dp. Ignorado com `caps`. */
  small?: boolean;
  testID?: string;
};

/**
 * Link de texto (ação secundária, nunca a principal da tela): azul, sem fundo
 * nem sombra, área de toque de 48 dp. Papel de botão para o leitor de tela.
 */
export function TextLink({
  label,
  onPress,
  disabled = false,
  busy = false,
  caps = false,
  small = false,
  testID,
}: TextLinkProps) {
  const off = disabled || busy;
  return (
    <Pressable3D
      accessibilityLabel={label}
      accessibilityState={{ busy }}
      disabled={off}
      onPress={onPress}
      edge={{ color: color.surface, height: 0 }}
      minHeight={size.touchMin}
      style={styles.link}
      testID={testID}
    >
      <Text style={[caps ? styles.caps : styles.text, small && !caps ? styles.small : null, off ? styles.off : null]}>
        {label}
      </Text>
    </Pressable3D>
  );
}

const styles = StyleSheet.create({
  link: { alignSelf: 'center', alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing[3] },
  caps: { ...typography.button, color: color.blue, textTransform: 'uppercase', textAlign: 'center' },
  text: {
    ...typography.bodyStrong,
    color: color.blue,
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
  small: { ...typography.caption },
  off: { color: color.muted },
});
