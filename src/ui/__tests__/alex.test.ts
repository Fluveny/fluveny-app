import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ALEX_PARTS, ALEX_POSES, ALEX_XML } from '../art/alexSvg';
import { ROOM_XML } from '../art/roomSvg';
import { color } from '../tokens';

const ART: [string, string][] = [
  ...ALEX_POSES.map((pose) => [`alex ${pose}`, ALEX_XML[pose]] as [string, string]),
  ['room', ROOM_XML],
];
const tags = (xml: string) => [...xml.matchAll(/<[a-zA-Z]+(?:\s[^>]*)?>/g)].map(([tag]) => tag);
const attr = (tag: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];

describe('Alex e o quarto (SVG)', () => {
  it('três poses: wave, listen e cheer, cada uma com o corpo e a cabeça compartilhados', () => {
    expect(ALEX_POSES).toEqual(['wave', 'listen', 'cheer']);
    for (const pose of ALEX_POSES) {
      expect(ALEX_XML[pose]).toContain(ALEX_PARTS.body);
      expect(ALEX_XML[pose]).toContain(ALEX_PARTS.head);
    }
  });

  it('SVG plano: sem <symbol> nem <use>, que o react-native-svg do Android não desenha aninhados', () => {
    for (const pose of ALEX_POSES) expect(ALEX_XML[pose]).not.toMatch(/<symbol|<use|<defs/);
  });

  it.each(ART)('%s: nenhum elemento repete atributo', (_, xml) => {
    const repeated = tags(xml).filter((tag) => {
      const names = [...tag.matchAll(/\s([a-zA-Z:-]+)=/g)].map((m) => m[1]);
      return new Set(names).size !== names.length;
    });
    expect(repeated).toEqual([]);
  });

  it.each(ART)('%s: chapado, sem contorno: traço só em linha (fill="none"), sem imagem nem gradiente', (_, xml) => {
    const outlined = tags(xml).filter((tag) => {
      const stroke = attr(tag, 'stroke');
      return stroke !== undefined && stroke !== 'none' && attr(tag, 'fill') !== 'none';
    });
    expect(outlined).toEqual([]);
    expect(xml).not.toMatch(/<image|Gradient|<filter/i);
  });

  it('o corpo e a cabeça de Alex não têm traço nenhum fora das linhas do rosto', () => {
    const body = ALEX_PARTS.body;
    expect(body).toContain('stroke="none"');
    for (const tag of tags(body)) {
      const stroke = attr(tag, 'stroke');
      if (stroke && stroke !== 'none') expect(attr(tag, 'fill')).toBe('none');
    }
  });

  it('o quarto cobre a moldura (slice) e usa as cores da marca dos tokens', () => {
    expect(ROOM_XML).toContain('preserveAspectRatio="xMidYMid slice"');
    expect(ROOM_XML).toContain(color.wall);
  });

  it.each(['alexSvg.ts', 'roomSvg.ts'])('%s: as cores da marca vêm dos tokens, não de hex no desenho', (file) => {
    const source = readFileSync(join(__dirname, '../art', file), 'utf8');
    const brand: string[] = [color.blue, color.red, color.gold, color.ink, color.wall, color.surface];
    // O branco curto do protótipo (#fff) também não vale: o surface vem do token.
    brand.push(`#${'f'.repeat(3)}`);
    for (const hex of brand) expect(source.toLowerCase()).not.toMatch(new RegExp(`${hex.toLowerCase()}(?![0-9a-f])`));
  });
});
