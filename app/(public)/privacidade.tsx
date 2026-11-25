import { LegalScreen } from '../../src/legal/LegalScreen';
import { PRIVACY_LINK } from '../../src/legal/paths';
import { PRIVACY_POLICY } from '../../src/legal/privacy';

/** Política de privacidade provisória (1.21), pública e fora do gate de versão. */
export default function PrivacyPolicy() {
  return <LegalScreen doc={PRIVACY_POLICY} title={PRIVACY_LINK} />;
}
