/** Uma seção de um documento legal: título e parágrafos de texto puro (sem markdown). */
export type LegalSection = { title: string; paragraphs: readonly string[] };

/** Documento legal versionado no repositório (1.21): política de privacidade ou termos de uso. */
export type LegalDocument = {
  title: string;
  /** Versão do texto; muda a cada alteração publicada. */
  version: string;
  /** Data da versão, ISO (`AAAA-MM-DD`). */
  date: string;
  sections: readonly LegalSection[];
};

/** O aviso que abre os dois documentos enquanto não há revisão jurídica. */
export const PROVISIONAL_NOTICE =
  'Versão provisória, sem revisão jurídica. A versão final sai antes do lançamento do Fluveny.';
