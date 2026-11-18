# Kit do App (`src/ui`)

Peças visuais do App do Aluno (histórias 1.8 e 1.9). A fonte é o DESIGN.md e o EXPERIENCE.md do planejamento (`../_bmad-output/planning-artifacts/ux-designs/ux-Fluveny-2026-11-13/`). Quando o protótipo e este kit divergem, vale o kit.

Importe sempre do barrel:

```tsx
import { Button, Card, ChoiceCard, GapSlot, MatchCard, ModeTag, SceneFrame, SpeechBubble, TextField } from '../src/ui';
```

Em desenvolvimento, a rota `/kit` mostra todas as peças e estados (`npx expo start --web` e abra `/kit`). No release, ela redireciona para `/`.

## Regras gerais

- Cores, tipos, raios, espaços e medidas só de `src/ui/tokens`. Hex ou `rgb()` fora dos tokens falha o lint. Medida que falta entra em `tokens/index.ts` vinda do `components` do `design.yaml`, com teste em `__tests__/tokens.test.ts`.
- A profundidade é a sombra sólida: `solid()` em pé, `sunk()` afundado. Toda peça tocável usa `Pressable3D`, que afunda exatamente a altura da sombra sem mover o layout. Não existe outro estado de pressionado: nada escurece nem muda de cor no toque.
- Sem sombra desfocada, sem gradiente, sem biblioteca de ícones ou de componentes de terceiros. Os ícones (`check`, `x`, `star`, `eye`) são SVG próprios em `icons.tsx`.
- Toda peça tocável tem papel, rótulo e estado (`disabled`, `selected`, `busy`) e área de toque de pelo menos 48 dp (o `Pressable3D` calcula o `hitSlop`).
- Estado nunca só por cor: certo e errado mostram ✓ ou ✕, e a palavra ("certo", "errado", "usado") entra no rótulo do leitor de tela. O texto visível do estado é o título da folha de feedback (1.11).
- Texto nunca corta: `minHeight` em vez de `height`, sem `numberOfLines`, `allowFontScaling` padrão. Com a fonte a 200%, o botão cresce em altura.
- Animações (pulo do XP, barra de progresso, transição entre Atividades, confete) desligam com "remover animações" do sistema (`useReducedMotion()`; o `Confetti` lê a preferência por conta própria, ver abaixo). As durações ficam em `motion` (`progressMs` 450, `activityMs` 260 com subida de `activityRise` 12 dp).
- Sem ícone nem botão de áudio no Lançamento 1.

## Peças

### `Button`

Botão "de borracha": face de 54 dp (46 no `small`), sombra de 5 (4 no `small`), rótulo em caixa alta peso 900, ícone opcional de 20 dp à esquerda, `fullWidth` no rodapé.

| Variante                               | Quando usar                                                                                 |
| -------------------------------------- | ------------------------------------------------------------------------------------------- |
| `primary` (azul)                       | A ação principal da tela: VERIFICAR, CONTINUAR, COMEÇAR.                                    |
| `ghost` (branco com borda)             | Ação secundária: VER RESPOSTA, CRIAR CONTA na boas-vindas.                                  |
| `success` (turquesa, rótulo `ink`)     | CONTINUAR depois de um Acerto.                                                              |
| `danger` (vermelho)                    | Só I DON'T LIKE no swipe.                                                                   |
| `reward` (ouro, rótulo `ink`)          | EXTRA HELP e RESPONDER PESQUISA RÁPIDA.                                                     |
| variante `disabled` ou prop `disabled` | Ação ainda indisponível (resposta incompleta, SEM CONEXÃO). Cinza, não afunda, não dispara. |

`busy` desabilita e anuncia "ocupado" enquanto a ação roda (por exemplo, SALVANDO…).

**Um único botão primário por tela, sempre no rodapé**, com a largura toda. Dois botões lado a lado só no swipe (I DON'T LIKE e I LIKE). Sem botões flutuantes nem links soltos como ação principal. Na folha de feedback, os botões ficam empilhados.

### `Card`

Borda de 2 dp, cantos de 20, sombra sólida de 4 na cor da borda. Tocável quando recebe `onPress` (e então exige `accessibilityLabel`) e afunda como o botão. A prop `disabled` do cartão tocável tira o toque e o afundar e o anuncia como desabilitado, sem mudar o visual: quem precisa de uma aparência própria a acrescenta (por exemplo, o cartão de Estágio bloqueado da história 2.5). Peça tocável sem `onPress` é sempre inerte.

| Tom        | Quando usar                                                                    |
| ---------- | ------------------------------------------------------------------------------ |
| `neutral`  | Padrão.                                                                        |
| `selected` | Item selecionado, Estágio atual. Anunciado como selecionado só quando tocável. |
| `wrong`    | Item errado depois de Verificar. Mostra ✕ e diz "errado".                      |
| `right`    | Acerto, resposta-modelo. Mostra ✓ e diz "certo".                               |
| `reward`   | Recompensa, convite de cadastro do Visitante, parágrafo do aluno.              |

### `XpChip` e `XpChipLight`

`XpChip` mostra o total ("30 XP") no canto superior direito do player e do painel e dá um pulo (escala 1,25 → 1) só quando o XP sobe. `XpChipLight` é a variante da folha de Acerto: "+10" em `gold-text` sobre `gold-lt`, anunciada como "+10 XP".

### `ProgressBar`

Barra de 16 dp com brilho no terço superior e preenchimento mínimo de 26 dp (nunca parece vazia). `value` vai de 0 a 1 (fora disso, é limitado). Anima em 450 ms. É um `progressbar` com valor de 0 a 100 para o leitor de tela; passe um `accessibilityLabel` que diga o que ela mede ("Posição no Estágio", "Estágios concluídos"). Use `style` só para layout (ex.: `flex: 1` na linha do topo do player).

### `WordChip`

Chip de palavra de 44 dp de face, com área de toque estendida a 48 dp. Bancos de palavras, Build a Sentence, lista de países, opções do avatar e do perfil. Chips quebram linha com 8 dp de espaço.

| Estado            | Quando usar                                                                                                      |
| ----------------- | ---------------------------------------------------------------------------------------------------------------- |
| `idle`            | No banco, disponível.                                                                                            |
| `placed`          | Escolhido ou colocado na frase. Anunciado como selecionado.                                                      |
| `used`            | Fantasma no banco depois de usado: sem sombra, não tocável, anunciado como "usado".                              |
| `right` / `wrong` | Depois de Verificar: ✓ ou ✕, e "certo" ou "errado" no rótulo. Passe `disabled` enquanto a resposta está travada. |

### `GapSlot`

Lacuna do Completar lacunas (UX-DR83, UX-DR84, história 1.17). Com `kind="bank"`, vazia é um espaço do tamanho do chip (44 dp de face mais a sombra, 72 dp de largura mínima) com borda tracejada `line-dk`, sem toque; preenchida, é o `WordChip` `placed`, e o toque a esvazia. Com `kind="typed"`, é um campo curto (128 dp) sem correção nem maiúscula automática, até 100 caracteres, com o anel de foco do `TextField`. O leitor ouve "Lacuna 2: your" ou "Lacuna 2, vazia", e o estado depois de Verificar.

| `state`           | Quando usar                                                       |
| ----------------- | ----------------------------------------------------------------- |
| `empty`           | Sem valor.                                                        |
| `filled`          | Com valor, antes de Verificar.                                    |
| `wrong` / `right` | Depois de Verificar: as cores do `WordChip`, "errado" ou "certo". |

Depois de Verificar, e na lacuna certa mantida por TENTAR DE NOVO, passe `locked`. Quem monta as linhas, o banco e a regra da primeira lacuna vazia é o `GapFill` (`src/player/GapFill.tsx`), que o Extra Help (1.18) reaproveita.

### `ModeTag`

Etiqueta azul no topo da Atividade, com um dos 11 valores de `ModeTagLabel`: GAME TIME, GRAMMAR TIME, VOCAB MODE, Q&A, GUESS WHO, FILL IN THE GAPS, BUILD A SENTENCE, READING TIME, VIDEO, EXTRA HELP, FINAL CHALLENGE. Não é tocável.

### Base: `Pressable3D`, `Icon`, `useReducedMotion`

`Pressable3D` é a base de toda peça tocável (sombra, afundar, `disabled`, `hitSlop`, acessibilidade). Use-a para uma peça nova do kit, nunca direto numa tela. `Icon` desenha `check`, `x`, `star` e `eye` com a cor de um token e fica oculto do leitor de tela. `useReducedMotion()` diz se "remover animações" está ligado.

O player (1.10) fica fora do kit, em `src/player`: `PlayerFrame` (topo com ✕ `muted` de 48 dp, `ProgressBar` e `XpChip`; linha de posição; conteúdo rolável; rodapé fixo com um `Button` primário) e `ActivityTransition` (fade com subida). A folha branca da boas-vindas usa `size.welcomeSheetRadius` (32).

### `SpeechBubble`

Balão de fala (`speech-bubble`): o `Card` neutro com o nome do falante em eyebrow vermelho, caixa alta e peso 900 ("ALEX"; `speaker` muda o nome), e a fala em `bubble`. Texto (string, número ou `Hi, {name}!`) vira `bubble` e o leitor ouve falante e fala juntos ("Alex: Hi, Júlia!"); um nó (por exemplo, a frase com Expressões Úteis tocáveis da 1.12) entra como veio. O rabicho é um quadrado de 14 dp girado 45°, oculto do leitor, e aponta para o personagem:

| Uso                                                 | Props                                | Rabicho                                                                                   |
| --------------------------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------- |
| Sobre a cena, no topo (Diálogo)                     | `tail="top"` (padrão)                | Sai da borda de baixo, apontando para Alex embaixo.                                       |
| Fora da cena (Expressão Útil, Resposta Livre, Fala) | `avatar="wave"` ou `avatar="listen"` | Avatar de 60 dp à esquerda; o rabicho sai da borda esquerda, na altura do meio do avatar. |

**Sem botão nem ícone de áudio** no Lançamento 1 (o DESIGN.md mostra um; o EXPERIENCE.md o tira).

### `SceneFrame`

Moldura da cena do Diálogo: cantos `xl` (26), recuo de 14 dp, o quarto (`Room`) ao fundo e Alex de 205 dp embaixo, no centro (`pose`, padrão `wave`; `null` tira Alex). Os `children` (o balão) ficam por cima, no topo. A altura é `sceneHeight(altura da tela)`: 46% da tela, entre 300 e 420 dp. É altura **mínima**: com a fonte a 200%, o balão empurra a moldura em vez de ser cortado. Fica fora da margem da tela (o recuo de 14 substitui os 20 de `screen-x`).

### `AlexAvatar`, `Alex` e `Room`

`Alex` desenha uma das três poses: `wave` (acena e conversa), `listen` (ouve a fala) e `cheer` (comemora o acerto). `AlexWave` é o atalho da pose `wave`. O `testID` é `alex-<pose>`. `AlexAvatar` é o círculo de 60 dp em `wall` com anel branco de 3 e Alex recortado. `Room` é o quarto, cobrindo a caixa inteira (`slice`).

Alex e as cenas são **decorativos** e ficam ocultos do leitor de tela. Passe `accessibilityLabel` só quando Alex disser algo que o texto em volta não diz. Alex nunca aparece triste: no erro, ele não aparece.

Os desenhos ficam em `art/alexSvg.ts` e `art/roomSvg.ts` (o único lugar, além dos tokens, com hex): chapados, sem contorno (traço só em linha, com `fill="none"`), sem imagem nem gradiente, com as cores da marca vindas dos tokens. Office, cafe, board e campus chegam nos épicos seguintes.

### `TextField`

Campo de texto (`text-field`): face mínima de 54 dp, borda de 2 em `line`, cantos de 16, texto `item` em `ink`, placeholder em `muted`. Com foco, borda `blue` e anel de 4 dp azul a 14% (`FOCUS_RING`). `label` é obrigatório: aparece acima do campo e é o rótulo do leitor de tela. Aceita as props do `TextInput` (`value`, `onChangeText`, `multiline`, `autoCapitalize`…), menos `style`. Use `multiline` na Resposta Livre ("Type your answer…").

### `ChoiceCard`

Alternativa A–D: o `Card` tocável com a letra num selo à esquerda e o texto em `item`. `index` vai de 0 (A) a 3 (D); fora disso é erro em desenvolvimento (máximo de 4 alternativas). O leitor de tela ouve a letra, o texto e o estado: "B, I'm from Brazil., errado".

| `state`           | Quando usar                                                   |
| ----------------- | ------------------------------------------------------------- |
| `neutral`         | Disponível.                                                   |
| `selected`        | Escolhida, antes de Verificar. Anunciada como selecionada.    |
| `wrong` / `right` | Depois de Verificar: ✕ ou ✓, e "errado" ou "certo" no rótulo. |

Depois de Verificar, **todas** as alternativas do grupo recebem `locked` (não só a certa e a errada), senão o aluno troca a resposta avaliada.

### `MatchCard`

Cartão ligável do Associar (Match the Speech Bubbles, UX-DR76): o `Card` tocável com um selo à esquerda e o texto em `item`. O selo leva o número do par (`pair`: 1, 2, 3…, na ordem das falas), em `blue-dk` sobre `blue-lt` com borda `blue-md`; a fala e a resposta do mesmo par mostram o mesmo número, então o par não depende só de cor. Sem par, o selo fica vazio (branco com borda `line`). O leitor ouve o texto, o outro lado do par e o estado: "Where are you from?, ligada a I am from Brazil., certo". A seleção é anunciada pelo `accessibilityState`.

| `state`           | Quando usar                                                         |
| ----------------- | ------------------------------------------------------------------- |
| `neutral`         | Livre.                                                              |
| `selected`        | Tocada, esperando o outro lado do par. Fundo `blue-lt`, borda azul. |
| `paired`          | Ligada a outro cartão, antes de Verificar: branca, com o número.    |
| `wrong` / `right` | Depois de Verificar: ✕ ou ✓, e "errado" ou "certo" no rótulo.       |

Tudo por toque, sem arrastar (UX-DR128). Depois de Verificar, e no par certo mantido por TENTAR DE NOVO, o cartão recebe `locked`.

### `FeedbackSheet`

Folha de feedback (`feedback-sheet`, UX-DR35 e UX-DR63 a UX-DR68): branca, cantos de 28 no topo, recuo 20/20/18, bloco de ícone de 44 dp com sombra sólida, título em `title` na cor do tom, linha de Resultado opcional, conteúdo rolável e botões empilhados com a largura toda. No player, ela entra no lugar do rodapé (`src/player/PlayerSheet.tsx`); quem decide o que ela mostra é o `useEvaluation`.

| `tone`    | Título          | Ícone      | O que mostra                                                                                                                    |
| --------- | --------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `correct` | "Mandou bem!"   | ✓ turquesa | Alex `cheer` espiando por cima da borda direita, selo `XpChipLight` só com `xpGain > 0`, justificativas, CONTINUAR (`success`). |
| `wrong`   | "Quase lá!"     | ✕ vermelho | Sem Alex. Texto padrão `WRONG_MESSAGE`, TENTAR DE NOVO (`primary`) e VER RESPOSTA (`ghost`).                                    |
| `review`  | "Vamos revisar" | olho azul  | Caixa `blue-lt` "RESPOSTA ESPERADA" (`expected`), justificativas e só CONTINUAR.                                                |

- `result`: use `resultLine(n, m, pct)` ("Resultado: 2 de 3 itens · 67%"), só quando há mais de um item.
- `error`: o texto de `messageFor(code)` da última ação, anunciado como alerta.
- Sobe com mola; com "remover animações", aparece direto (a configuração é lida antes de animar).
- Ao abrir e a cada tom, o título recebe o foco e o leitor anuncia título e Resultado (UX-DR135).
- A folha não sabe de rede: a moldura troca por "SEM CONEXÃO" a ação que chama o servidor.

### `ExpressionCard` e `ExpressionSheet`

Expressão Útil (`useful-expression`, UX-DR40 a UX-DR42, 1.14). O trecho tocável em si não é do kit: é o `RenderedText` dentro de um `ExpressionsProvider` (`src/renderer`), em `blue` sobre `blue-lt` com sublinhado pontilhado, papel de botão e a dica "Abre o significado da expressão".

- `ExpressionCard`: o cartão de dicionário. Caixa `blue-lt` com borda `blue-md`, bloco azul com o ícone `book`, eyebrow "USEFUL EXPRESSION", termo em `title` (900), significado em 600 e exemplos em itálico 700 com marcador vermelho. Todo o texto vem cru e sai pelo `RenderedText` (passe `vars` e `pronoun`). Sem o botão "Ouvir" no Lançamento 1.
- `ExpressionSheet`: `Modal` transparente com scrim `scrim` e a folha inferior (cantos de 28 no topo, coluna de até 440 dp) que sobe com mola; com "remover animações", aparece direto. Mostra o `ExpressionCard` e ENTENDI. Fecha com ENTENDI, toque no scrim e `onRequestClose` (voltar do Android; Esc no web). No player, quem a abre é o `ExpressionsProvider`, nunca com a folha de feedback aberta.

### `MicButton`, `TextLink`, `NoticeSheet` e `SheetModal`

Peças da Fala (1.15).

- `MicButton` (`mic-button`, UX-DR44, UX-DR45, UX-DR134): círculo de 132 dp azul com sombra sólida de 8 em `blue-dk`, dentro dos halos de 226 (`blue-lt`) e 176 (`blue-md`), ícone `mic`. `listening`: vermelho (sombra `red-dk`) com dois anéis pulsantes, sem pulsar com "remover animações". `disabled`: cinza, sem afundar, com a legenda "O microfone não está disponível neste aparelho.". Legenda em eyebrow abaixo ("TOQUE PARA FALAR", "OUVINDO…"); `message` troca a legenda por um aviso em texto corrido. Rótulo do leitor: "Microfone: toque para falar" ("Microfone: toque para parar" ouvindo); sem `onPress` ou indisponível, é anunciado como desabilitado. Toque, clique ou teclado; nunca manter pressionado.
- `TextLink`: link de texto azul, sem fundo nem sombra, área de toque de 48 dp, papel de botão. `caps` para o link em caixa alta com o peso de botão ("NÃO POSSO FALAR AGORA", o rodapé `variant: 'link'` do player). `small` para o link de rodapé em `caption` ("Política de privacidade", "Termos de uso"), com a mesma área de toque; com `caps`, o `small` é ignorado. Nunca é a ação principal da tela.
- `NoticeSheet`: aviso com duas ações empilhadas (primária e ghost), no casco da `ExpressionSheet`. Pede decisão: o scrim não fecha; o voltar do Android e o Esc fecham sem decidir. O foco vai para o texto ao abrir. `links` é um slot opcional abaixo das ações (os links `small` da política e dos termos, 1.21).
- `SheetModal`: o casco comum (`Modal` transparente, scrim, folha inferior com mola, alça). Use-o para folha nova por cima da tela.

### `Confetti`

Confete do Resumo do Estágio (UX-DR104, UX-DR132; história 1.20): 18 papéis chapados de 10 × 16 dp (cantos de 3) nas cores da marca (`red`, `gold`, `blue`, `teal`) caem uma vez do topo da caixa, giram e somem, em 1,8 a 3 s (`motion.confettiMs`, `confettiStepMs`, `confettiStaggerMs`). Fica por cima (`position: absolute`), sem toque e oculto do leitor de tela. `height` é quanto cai (padrão `size.confettiFall`, 420). Com "remover animações" (ou `prefers-reduced-motion` no web), e enquanto essa configuração não foi lida, não desenha nada (UX-DR143). É a exceção ao `useReducedMotion()`: ele começa em `false` antes de ler a preferência, e o confete cairia por um instante para quem pediu sem animações; por isso o `Confetti` lê o `AccessibilityInfo` e ouve a mudança por conta própria, começando em "não sei". Medidas e tempos `[ASSUMPTION]`, como no protótipo.

### `StatusBanner`

Faixa de estado global, só a peça visual: quem mostra e esconde é a tela (a lógica de rede não é do kit). O texto e a ação vêm de quem usa; a ação opcional é um `Button` pequeno ghost (área de toque de 48 dp).

| `tone`    | Quando usar                                                                          |
| --------- | ------------------------------------------------------------------------------------ |
| `offline` | Sem conexão: fundo `ink`, texto branco. É o único tom anunciado como alerta.         |
| `notice`  | Aviso do que é do aluno (consentimento do responsável): `gold-text` sobre `gold-lt`. |
| `quiet`   | Lembrete discreto (confirmar e-mail): `muted-strong` sobre `canvas`.                 |

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

| Situação          | Use                                                                                                                                                                                   | Evite                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Boas-vindas       | "Seu primeiro dia na universidade. Em inglês." / "Conheça o Alex, seu colega de quarto, e aprenda a se apresentar falando, escrevendo e jogando. Grátis."                             | "Aprenda inglês rápido!"                      |
| Painel            | "Hi, Júlia!" / "Bora continuar o seu primeiro dia?"                                                                                                                                   | Contagem de dias seguidos, culpa por ausência |
| Acerto            | "Mandou bem!" · "Perfect!" (fala) · "Perfil criado!" (perfil final)                                                                                                                   | "Correto." seco                               |
| Erro              | "Quase lá!" + "Os itens marcados em vermelho estão errados. Tente de novo ou veja a resposta com a explicação."                                                                       | "Errado!", "Resposta incorreta"               |
| Ver resposta      | "Vamos revisar" + "RESPOSTA ESPERADA"                                                                                                                                                 | "Você errou, a resposta era…"                 |
| Fala              | "Go ahead, I'm listening!" / "Toque no microfone e fale; ele para sozinho." / "A gente confere as palavras, não o sotaque. Seu nome não entra na conferência." / "A gente ouviu: “…”" | "Pronúncia ruim"                              |
| Pular fala        | "Não posso falar agora"                                                                                                                                                               | "Pular" (soa como desistência)                |
| Resposta Livre    | "Travou? O Extra Help transforma a pergunta num exercício guiado." / "Uma resposta possível" / "Compare com a sua. Não existe uma única resposta certa aqui."                         | "Sua resposta está errada"                    |
| Expressão Útil    | "Toque no trecho azul para ver o significado" / botão "Entendi"                                                                                                                       | —                                             |
| Resumo do Estágio | "Meet & Greet: check!" / "Você já sabe se apresentar e dizer de onde é." / "1 atividade de fala pulada. Você pode refazer quando quiser."                                             | —                                             |
| Visitante         | "Seu progresso está só neste aparelho" / "Crie uma conta grátis para guardar o Estágio 1 e continuar no Estágio 2."                                                                   | Bloqueio sem explicação                       |
| Cadastro          | "Nas histórias, o Alex fala de você como…" / "O Fluveny é para quem tem 12 anos ou mais." / "Menor de 18: pediremos o e-mail de um responsável para confirmar o consentimento."       | "Gênero"                                      |
| Conclusão         | "Campus Explorer" / "Júlia se apresentou, descreveu pessoas, pediu um café e criou o perfil na universidade." / "Em breve: novas aventuras com o Alex."                               | —                                             |
| Pesquisa          | "Pesquisa rápida · opcional" / "Valeu pela resposta!" / "Ela ajuda a equipe de Letras a melhorar as próximas unidades."                                                               | Pesquisa obrigatória                          |

## Divergências conhecidas

- A sombra é a borda inferior da própria caixa (no RN a borda fica dentro dela). Em peças com borda de 2 dp, a borda inferior em pé é a borda mais a sombra, na cor da sombra. No cartão `reward` (borda ouro, sombra `gold-dk`), os 2 dp de baixo ficam em `gold-dk`.
- Nos chips `right` e `wrong`, a sombra segue o `design.yaml` (herda `line` do `word-chip`).
- A estrela do chip de XP tem 16 dp, como no protótipo `[ASSUMPTION]`; o DESIGN.md não fixa a medida.
- O balão de fala do DESIGN.md tem um botão de áudio de 28 dp. Ele não entra no Lançamento 1 (EXPERIENCE.md, Component Patterns).
- O rabicho tem 14 dp, o anel do avatar tem 3 e o selo da letra A–D tem 30, como no protótipo `[ASSUMPTION]`; o DESIGN.md não fixa essas medidas.
- O recuo horizontal do campo de texto é 16 dp `[ASSUMPTION]`: o `text-field` do DESIGN.md não tem `padding`.
- O tom `quiet` da faixa usa `muted-strong`, não `muted`: sobre `canvas`, o `muted` fica abaixo de 4,5:1 (DESIGN.md, Colors).
- O placeholder do campo usa `muted` (4,6:1), não `faint`.
- O anel de foco é um `boxShadow` sem desfoque (`0 0 0 4px`), que não mexe no layout.
- A folha de feedback não tem a sombra desfocada do `feedback-sheet` (o kit não usa sombra desfocada): uma borda de 2 dp em `line` a separa do conteúdo `[ASSUMPTION]`.
- Na folha, Alex `cheer` tem 96 dp e o ícone do bloco tem 20 `[ASSUMPTION]`; o DESIGN.md não fixa as medidas. O ✓ vai em `ink` sobre o turquesa (AA).
