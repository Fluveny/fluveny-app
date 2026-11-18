import { LegalScreen } from '../../src/legal/LegalScreen';
import { TERMS_OF_USE } from '../../src/legal/terms';

/** Termos de uso provisórios (1.21), públicos e fora do gate de versão. */
export default function TermsOfUse() {
  return <LegalScreen doc={TERMS_OF_USE} />;
}
