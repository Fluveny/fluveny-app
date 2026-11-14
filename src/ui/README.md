# Kit do App (`src/ui`)

Peças visuais do App do Aluno (história 1.8). A fonte é o DESIGN.md e o EXPERIENCE.md do planejamento (`../_bmad-output/planning-artifacts/ux-designs/ux-Fluveny-2026-11-13/`). Quando o protótipo e este kit divergem, vale o kit.

Importe sempre do barrel:

```tsx
import { Button, Card, ModeTag, ProgressBar, WordChip, XpChip } from '../src/ui';
```

Em desenvolvimento, a rota `/kit` mostra todas as peças e estados (`npx expo start --web` e abra `/kit`). No release, ela redireciona para `/`.

## Regras gerais

- Cores, tipos, raios, espaços e medidas só de `src/ui/tokens`. Hex ou `rgb()` fora dos tokens falha o lint. Medida que falta entra em `tokens/index.ts` vinda do `components` do `design.yaml`, com teste em `__tests__/tokens.test.ts`.
- A profundidade é a sombra sólida: `solid()` em pé, `sunk()` afundado. Toda peça tocável usa `Pressable3D`, que afunda exatamente a altura da sombra sem mover o layout. Não existe outro estado de pressionado: nada escurece nem muda de cor no toque.
- Sem sombra desfocada, sem gradiente, sem biblioteca de ícones ou de componentes de terceiros. Os ícones (`check`, `x`, `star`) são SVG próprios em `icons.tsx`.
- Toda peça tocável tem papel, rótulo e estado (`disabled`, `selected`, `busy`) e área de toque de pelo menos 48 dp (o `Pressable3D` calcula o `hitSlop`).
- Estado nunca só por cor: certo e errado mostram ✓ ou ✕, e a palavra ("certo", "errado", "usado") entra no rótulo do leitor de tela. O texto visível do estado é o título da folha de feedback (1.11).
- Texto nunca corta: `minHeight` em vez de `height`, sem `numberOfLines`, `allowFontScaling` padrão. Com a fonte a 200%, o botão cresce em altura.
- Animações (pulo do XP, barra de progresso) desligam com "remover animações" do sistema (`useReducedMotion()`).
- Sem ícone nem botão de áudio no Lançamento 1.

## Peças

### `Button`

Botão "de borracha": face de 54 dp (46 no `small`), sombra de 5 (4 no `small`), rótulo em caixa alta peso 900, ícone opcional de 20 dp à esquerda, `fullWidth` no rodapé.

| Variante | Quando usar |
|---|---|
| `primary` (azul) | A ação principal da tela: VERIFICAR, CONTINUAR, COMEÇAR. |
| `ghost` (branco com borda) | Ação secundária: VER RESPOSTA, CRIAR CONTA na boas-vindas. |
| `success` (turquesa, rótulo `ink`) | CONTINUAR depois de um Acerto. |
| `danger` (vermelho) | Só I DON'T LIKE no swipe. |
| `reward` (ouro, rótulo `ink`) | EXTRA HELP e RESPONDER PESQUISA RÁPIDA. |
| variante `disabled` ou prop `disabled` | Ação ainda indisponível (resposta incompleta, SEM CONEXÃO). Cinza, não afunda, não dispara. |

`busy` desabilita e anuncia "ocupado" enquanto a ação roda (por exemplo, SALVANDO…).

**Um único botão primário por tela, sempre no rodapé**, com a largura toda. Dois botões lado a lado só no swipe (I DON'T LIKE e I LIKE). Sem botões flutuantes nem links soltos como ação principal. Na folha de feedback, os botões ficam empilhados.

### `Card`

Borda de 2 dp, cantos de 20, sombra sólida de 4 na cor da borda. Tocável quando recebe `onPress` (e então exige `accessibilityLabel`) e afunda como o botão. A prop `disabled` do cartão tocável tira o toque e o afundar e o anuncia como desabilitado, sem mudar o visual: quem precisa de uma aparência própria a acrescenta (por exemplo, o cartão de Estágio bloqueado da história 2.5). Peça tocável sem `onPress` é sempre inerte.

| Tom | Quando usar |
|---|---|
| `neutral` | Padrão. |
| `selected` | Item selecionado, Estágio atual. Anunciado como selecionado só quando tocável. |
| `wrong` | Item errado depois de Verificar. Mostra ✕ e diz "errado". |
| `right` | Acerto, resposta-modelo. Mostra ✓ e diz "certo". |
| `reward` | Recompensa, convite de cadastro do Visitante, parágrafo do aluno. |

### `XpChip` e `XpChipLight`

`XpChip` mostra o total ("30 XP") no canto superior direito do player e do painel e dá um pulo (escala 1,25 → 1) só quando o XP sobe. `XpChipLight` é a variante da folha de Acerto: "+10" em `gold-text` sobre `gold-lt`, anunciada como "+10 XP".

### `ProgressBar`

Barra de 16 dp com brilho no terço superior e preenchimento mínimo de 26 dp (nunca parece vazia). `value` vai de 0 a 1 (fora disso, é limitado). Anima em 450 ms. É um `progressbar` com valor de 0 a 100 para o leitor de tela; passe um `accessibilityLabel` que diga o que ela mede ("Posição no Estágio", "Estágios concluídos"). Use `style` só para layout (ex.: `flex: 1` na linha do topo do player).

### `WordChip`

Chip de palavra de 44 dp de face, com área de toque estendida a 48 dp. Bancos de palavras, Build a Sentence, lista de países, opções do avatar e do perfil. Chips quebram linha com 8 dp de espaço.

| Estado | Quando usar |
|---|---|
| `idle` | No banco, disponível. |
| `placed` | Escolhido ou colocado na frase. Anunciado como selecionado. |
| `used` | Fantasma no banco depois de usado: sem sombra, não tocável, anunciado como "usado". |
| `right` / `wrong` | Depois de Verificar: ✓ ou ✕, e "certo" ou "errado" no rótulo. Passe `disabled` enquanto a resposta está travada. |

### `ModeTag`

Etiqueta azul no topo da Atividade, com um dos 11 valores de `ModeTagLabel`: GAME TIME, GRAMMAR TIME, VOCAB MODE, Q&A, GUESS WHO, FILL IN THE GAPS, BUILD A SENTENCE, READING TIME, VIDEO, EXTRA HELP, FINAL CHALLENGE. Não é tocável.

### Base: `Pressable3D`, `Icon`, `useReducedMotion`

`Pressable3D` é a base de toda peça tocável (sombra, afundar, `disabled`, `hitSlop`, acessibilidade). Use-a para uma peça nova do kit, nunca direto numa tela. `Icon` desenha `check`, `x` e `star` com a cor de um token e fica oculto do leitor de tela. `useReducedMotion()` diz se "remover animações" está ligado.

Ficam para a história 1.9: balão de fala, cena, avatar de Alex, campo de texto, cartão de alternativa A–D e faixa de estado global. A folha de feedback é da 1.11, e o player, da 1.10.

## Padrões proibidos (UX-DR133)

Nada disto entra no App: contagem de dias seguidos, ranking, notificações push, temporizador em Atividade avaliada, sons automáticos, carrossel automático e confirmação "tem certeza?" ao sair do player.

## Microcopy (UX-DR146, UX-DR147, UX-DR149)

- **Interface em português do Brasil, informal e direta**, na segunda pessoa ("você"). Pode usar "a gente". Frases curtas.
- **Conteúdo em inglês**: falas de Alex, Expressões Úteis, alternativas, títulos de Atividade ("It's your turn!", "Build your avatar") e tags de modo. Frase em inglês do conteúdo nunca vai em caixa alta.
- **O erro é parte do método.** O feedback de erro nunca culpa nem usa "errado" no título: "Quase lá!", "Vamos revisar", "Não posso falar agora" (não "Pular"). Evite "Errado!", "Resposta incorreta", "Pronúncia ruim" e "Sua resposta está errada".
- **Números só reais.** Nada de "Você está arrasando!" sem base.
- **Botões com verbo no infinitivo ou imperativo curto**, em caixa alta peso 900 (o `Button` aplica a caixa alta).

## Tabela de copy oficial (UX-DR150)

Textos do EXPERIENCE.md (Voice and Tone). Use estes; os que não estão aqui e são novos ficam marcados `[ASSUMPTION]` nas telas.

| Situação | Use | Evite |
|---|---|---|
| Boas-vindas | "Seu primeiro dia na universidade. Em inglês." / "Conheça o Alex, seu colega de quarto, e aprenda a se apresentar falando, escrevendo e jogando. Grátis." | "Aprenda inglês rápido!" |
| Painel | "Hi, Júlia!" / "Bora continuar o seu primeiro dia?" | Contagem de dias seguidos, culpa por ausência |
| Acerto | "Mandou bem!" · "Perfect!" (fala) · "Perfil criado!" (perfil final) | "Correto." seco |
| Erro | "Quase lá!" + "Os itens marcados em vermelho estão errados. Tente de novo ou veja a resposta com a explicação." | "Errado!", "Resposta incorreta" |
| Ver resposta | "Vamos revisar" + "RESPOSTA ESPERADA" | "Você errou, a resposta era…" |
| Fala | "Go ahead, I'm listening!" / "Toque no microfone e fale; ele para sozinho." / "A gente confere as palavras, não o sotaque. Seu nome não entra na conferência." / "A gente ouviu: “…”" | "Pronúncia ruim" |
| Pular fala | "Não posso falar agora" | "Pular" (soa como desistência) |
| Resposta Livre | "Travou? O Extra Help transforma a pergunta num exercício guiado." / "Uma resposta possível" / "Compare com a sua. Não existe uma única resposta certa aqui." | "Sua resposta está errada" |
| Expressão Útil | "Toque no trecho azul para ver o significado" / botão "Entendi" | — |
| Resumo do Estágio | "Meet & Greet: check!" / "Você já sabe se apresentar e dizer de onde é." / "1 atividade de fala pulada. Você pode refazer quando quiser." | — |
| Visitante | "Seu progresso está só neste aparelho" / "Crie uma conta grátis para guardar o Estágio 1 e continuar no Estágio 2." | Bloqueio sem explicação |
| Cadastro | "Nas histórias, o Alex fala de você como…" / "O Fluveny é para quem tem 12 anos ou mais." / "Menor de 18: pediremos o e-mail de um responsável para confirmar o consentimento." | "Gênero" |
| Conclusão | "Campus Explorer" / "Júlia se apresentou, descreveu pessoas, pediu um café e criou o perfil na universidade." / "Em breve: novas aventuras com o Alex." | — |
| Pesquisa | "Pesquisa rápida · opcional" / "Valeu pela resposta!" / "Ela ajuda a equipe de Letras a melhorar as próximas unidades." | Pesquisa obrigatória |

## Divergências conhecidas

- A sombra é a borda inferior da própria caixa (no RN a borda fica dentro dela). Em peças com borda de 2 dp, a borda inferior em pé é a borda mais a sombra, na cor da sombra. No cartão `reward` (borda ouro, sombra `gold-dk`), os 2 dp de baixo ficam em `gold-dk`.
- Nos chips `right` e `wrong`, a sombra segue o `design.yaml` (herda `line` do `word-chip`).
- A estrela do chip de XP tem 16 dp, como no protótipo `[ASSUMPTION]`; o DESIGN.md não fixa a medida.
