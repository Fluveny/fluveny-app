import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { META_QUERY_KEY, versionStatus, type Meta } from '../api/meta';
import { Button, StatusBanner } from '../ui';
import { color, spacing, typography } from '../ui/tokens';
import { PROVISIONAL_NOTICE, type LegalDocument } from './types';

export const LEGAL_BACK = 'VOLTAR';

/** `2026-11-17` → `17/11/2026`. */
export function formatLegalDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

/** A linha de versão e data que abre o documento. */
export const versionLine = (doc: LegalDocument) => `Versão ${doc.version}, de ${formatLegalDate(doc.date)}`;

/**
 * Tela de um documento legal (1.21): título como cabeçalho, o aviso de versão
 * provisória, versão e data, as seções e VOLTAR no rodapé (volta à tela
 * anterior, ou à boas-vindas quando a política abriu por link direto). Texto
 * estático, sem rede: abre sem o `/meta` e com o App desatualizado.
 */
export function LegalScreen({ doc }: { doc: LegalDocument }) {
  const router = useRouter();
  const client = useQueryClient();
  // Sem tela anterior: a boas-vindas, ou a tela de atualizar com o App desatualizado
  // (a boas-vindas está atrás do guard, e o redirecionamento dele não leva para lá).
  // O /meta é lido no toque: a tela não precisa renderizar de novo quando ele chega.
  const back = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    const outdated = versionStatus(client.getQueryData<Meta>(META_QUERY_KEY), false) === 'outdated';
    router.replace(outdated ? '/atualize' : '/');
  };
  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.title} accessibilityRole="header">
          {doc.title}
        </Text>
        <StatusBanner tone="notice" text={PROVISIONAL_NOTICE} testID="legal-provisional" />
        <Text style={styles.version} testID="legal-version">
          {versionLine(doc)}
        </Text>
        {doc.sections.map((section, sectionIndex) => (
          <View key={sectionIndex} style={styles.section}>
            <Text style={styles.heading} accessibilityRole="header">
              {section.title}
            </Text>
            {section.paragraphs.map((paragraph, paragraphIndex) => (
              <Text key={paragraphIndex} style={styles.paragraph}>
                {paragraph}
              </Text>
            ))}
          </View>
        ))}
      </ScrollView>
      <View style={styles.footer}>
        <Button label={LEGAL_BACK} onPress={back} fullWidth />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.canvas },
  scroll: { flex: 1 },
  content: { paddingHorizontal: spacing.screenX, paddingTop: spacing[6], paddingBottom: spacing[6], gap: spacing[4] },
  title: { ...typography.h1, color: color.ink },
  version: { ...typography.caption, color: color.mutedStrong },
  section: { gap: spacing[2] },
  heading: { ...typography.item, color: color.ink },
  paragraph: { ...typography.reading, color: color.ink },
  footer: { paddingHorizontal: spacing.screenX, paddingTop: spacing[2], paddingBottom: spacing[6] },
});
