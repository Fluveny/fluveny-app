import { View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { ALEX_VIEWBOX, ALEX_XML, type AlexPose } from './alexSvg';

export type AlexProps = {
  pose?: AlexPose;
  /** Largura em dp; a altura segue a proporção do desenho. */
  size: number;
  /**
   * Só quando Alex diz algo que o texto em volta não diz. Sem rótulo, Alex é
   * decorativo e fica oculto do leitor de tela (EXPERIENCE.md, Accessibility).
   */
  accessibilityLabel?: string;
};

/**
 * Alex em uma das três poses. O `testID` é `alex-<pose>`. O View de fora leva o
 * `testID` e, com rótulo, o papel de imagem; o desenho fica num View oculto do
 * leitor (no web, o Svg repassaria as props ao DOM).
 */
export function Alex({ pose = 'wave', size, accessibilityLabel }: AlexProps) {
  const height = (size * ALEX_VIEWBOX.height) / ALEX_VIEWBOX.width;
  const labelled = !!accessibilityLabel?.trim();
  return (
    <View
      testID={`alex-${pose}`}
      accessible={labelled}
      accessibilityRole={labelled ? 'image' : undefined}
      accessibilityLabel={labelled ? accessibilityLabel : undefined}
      style={{ width: size, height }}
    >
      <View accessible={false} importantForAccessibility="no-hide-descendants" aria-hidden>
        <SvgXml xml={ALEX_XML[pose]} width={size} height={height} />
      </View>
    </View>
  );
}

/** Atalho da pose `wave` (tela "Atualize o app", boas-vindas, partida a frio). */
export function AlexWave(props: Omit<AlexProps, 'pose'>) {
  return <Alex {...props} pose="wave" />;
}
