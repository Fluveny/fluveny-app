<!-- bmad:context -->
<!-- Verified 2026-11-16 against 50de7eb449f051f257693543a53f906f856e089d (main). Managed by bmad-project-context; edits inside this block are replaced on refresh. Keep anything you want preserved outside the markers. -->

## fluveny-app

App do Fluveny: um único projeto Expo (SDK 58, Expo Router, TypeScript ~6.0) para o App Android e o build web. As decisões ficam no repositório de planejamento ([Fluveny/fluveny-planejamento](https://github.com/Fluveny/fluveny-planejamento)), clonado como pasta pai deste: `../_bmad-output/planning-artifacts/`. A spine (`architecture/architecture-Fluveny-2026-11-13/ARCHITECTURE-SPINE.md`) e o DESIGN.md/EXPERIENCE.md vencem qualquer código deste repositório e o protótipo.

## Policy

- Nunca dê push na `main`. Branch curta, PR e squash na `main`. A `main` do App não é protegida: antes de mesclar, confira que `Verificação` e `Segredos` passaram (AD-2). Com a CI verde, mescle sem esperar pedido.
- Não copie o estado, a navegação nem o conteúdo do protótipo (`prototipo-fluveny`). Ele é só referência visual.
- O Expo muda a cada SDK: antes de usar uma API do Expo ou do React Native, confira a documentação da versão do `package.json` (https://docs.expo.dev/versions/v58.0.0/). Instale pacotes com `npx expo install`.
- Nunca grave segredo em arquivo. `EXPO_PUBLIC_*` entra no bundle.
- Implemente histórias com `bmad-build <número>` e revise com `bmad-code-review` num contexto novo.

## Running and verifying

- Antes de abrir PR: `mise run check`, o mesmo que a CI (inclui `npm ci`, `prettier --check` e o export web). Node 24 e lefthook vêm do `mise.toml`. Formato fora do padrão: `mise run format`.
- Web: `mise run api` (API no sha do lock + Mongo, via Docker) e `npx expo start --web`. Sem a API: `EXPO_PUBLIC_API_MOCK=1 npx expo start --web`.
- Com o mock ligado, mantenha `EXPO_PUBLIC_API_URL` preenchido: no Android o MSW só intercepta URL absoluta.
- Android: APK de desenvolvimento gerado localmente com `npx expo run:android` (Android SDK com NDK, JDK 17, `adb`), depois `npx expo start`. Para um `.apk` instalável: `npx eas-cli build --profile development -p android --local`. Nunca na nuvem do EAS sem pedido do Lucas.

## Conventions that differ from defaults

- Rotas em `app/` na raiz (não em `src/app`): `(public)` web, `(student)` App do Aluno, `(panel)` Painel em `*.web.tsx` (AD-1). Código que não é rota fica em `src/`.
- Contrato da API: `src/api/openapi.json` e `src/api/openapi.lock` só mudam por `npm run api:sync [sha]`; `src/api/schema.d.ts` só pelo `api:sync` ou `api:types`. Nunca edite os três à mão nem escreva tipo de resposta da API à mão: use `GetData<'/api/v1/...'>` e o `get()` de `src/api/client.ts`.
- Erros: mostre `messageFor(error.code)` (`src/api/errors.ts`), nunca `detail` nem a mensagem crua.
- Cores, tipografia, raios, espaços e sombra sólida só de `src/ui/tokens`. Hex ou `rgb()` fora dos tokens e de `src/ui/art` falha o lint (`fluveny/no-hex-color`). Mudou o DESIGN.md: `npm run design:sync`, atualize `src/ui/tokens/index.ts` e rode o teste dos tokens.
- Só Montserrat 500–900 (família por peso, `Montserrat_900Black`), sem modo escuro, sem gradiente (o degradê do wordmark no logo é a única exceção), só retrato, coluna de até 440 dp sem `minWidth` (360 dp é a menor largura suportada, não um piso).
- Testes com jest-expo e Testing Library v14: `render` e `renderRouter` são assíncronos (`await`).

## Known pitfalls

- O `openapi-typescript` 7.13 pede `typescript ^5`; o projeto usa o 6. Ele fica em `tools/openapi-types` (versões no lock dela; instale com `npm run api:tools`). Rode só pelos scripts, nunca instale no `package.json` da raiz.
- O header `X-App-Version` faz o navegador mandar preflight `OPTIONS`. Até a API tratar CORS (história 4.2), o `/meta` falha no web contra a API real e o App segue sem checar a versão.

<!-- /bmad:context -->

## Kit de UI

- Telas usam as peças de `src/ui` (importe de `src/ui/index.ts`): `Button`, `Card`, `WordChip`, `XpChip`, `ProgressBar`, `ModeTag`, `SpeechBubble`, `SceneFrame`, `AlexAvatar`, `TextField`, `ChoiceCard`, `MatchCard`, `GapSlot`, `StatusBanner`, `ExpressionCard`, `ExpressionSheet`, `MicButton`, `TextLink`, `NoticeSheet`. Nada de estilo de botão, cartão ou chip solto numa tela nem `Pressable` com `solid()`/`sunk()` à mão; peça nova do kit usa `Pressable3D`. Regras, variantes e copy em `src/ui/README.md`; catálogo em `/kit` (só com `__DEV__`).

## Build do EAS só sob pedido

- O `eas build` na nuvem tem cota limitada no plano grátis. Não gere build do EAS na nuvem para verificar uma história nem por rotina: só com pedido explícito do Lucas.
- Dependência nativa nova (`npx expo install`) pede um APK de desenvolvimento novo, gerado **localmente**: `npx expo run:android` (aparelho ou emulador) ou `npx eas-cli build --profile development -p android --local`.
- Para verificar, use `mise run check`, o web e o APK de desenvolvimento local, com `npx expo start`. Se um critério de aceite pedir build do EAS na nuvem, avise antes de gerar.

## Visitante, player e rede (1.10)

- `src/visitor`: `deviceId`, Variáveis do Aluno, Progresso e recibos do Visitante, no aparelho. `store.ts` (expo-sqlite) e `store.web.ts` (localStorage) têm a mesma API; use `visitorStore` ou `useVisitor()`. Só o `deviceId` vai para a API, e só nas rotas do Visitante (`/visitor/attempts`, `/attempts/reveal` e `/visitor/completions`, 1.12). Nome, país, texto livre, Progresso e recibos nunca vão para a API antes do cadastro (Épico 2).
- `src/player`: `registry.ts` liga `type` → componente. Tipo novo (1.12 a 1.19) troca o seu `PENDING` por um componente que recebe `{activity, versionId, setFooter, setSheet, advance}`. A Atividade não trata rede: a moldura troca o rodapé, e a ação da folha que chama o servidor, por "SEM CONEXÃO". O teste do registro falha se um `type` do `openapi.json` faltar no `registry`.
- Atividade avaliada usa `useEvaluation` (`src/player/useEvaluation.ts`, 1.11): manda a Tentativa, monta VERIFICAR e a folha de feedback e guarda o XP da primeira tentativa. O App nunca corrige nem tem gabarito; o do mock fica só em `src/api/mocks/routes.ts`. `post()` e `PostData<>` do `client.ts` tipam as rotas `POST`.
- Recibos (1.12): o Resultado da Tentativa ou da conclusão pode trazer `receipt`, opaco. Ele é gravado na hora (`recordReceipt`, só o primeiro por `activityKey`), antes da folha, e o App nunca o decodifica nem o mostra. Um `attemptId` por resposta enviada: repetir depois de falha reaproveita o id; ele muda com outra resposta ou depois de um Resultado. O reveal tem o seu.
- Atividade que termina com `advance({outcome: 'viewed' | 'skipped'})` passa pela rota `completions` (`src/player/completion.ts`) antes de avançar: recibo, depois Progresso com xp 0. Falha deixa a tela com `messageFor(code)`. O cartão PENDING avança sem registrar nada.
- `src/network/useOnline.ts`: estado da rede (expo-network no nativo, `navigator.onLine` no web).
- Dependências nativas: `expo-sqlite`, `expo-crypto`, `expo-network`, `expo-speech-recognition` (1.15). Nos testes, o `jest.setup.js` as simula (o `expo-sqlite` vira `node:sqlite` em memória; o reconhecimento de fala é controlado por `global.__speech`).
- Testing Library v14: `fireEvent` também é assíncrono. Sem `await`, os `act()` se sobrepõem e o próximo `renderRouter` do arquivo renderiza vazio.

## Fala (1.15)

- `SpeechActivity` usa o `useEvaluation` com `trigger: 'activity'`: o microfone chama `check(answer)` e a Atividade cuida do rodapé (o link "NÃO POSSO FALAR AGORA", primário com o microfone indisponível). `heard` põe "A gente ouviu: “…”" na folha.
- `useSpeechRecognition` (`src/player`): `en-US`, sem gravar, só resultado final, no aparelho no Android quando suportado; 7 s sem ouvir som nem fala volta ao início; eventos de sessão abortada são descartados; sem o modelo en-US no aparelho, tenta de novo online. O módulo é requerido na primeira chamada: sem o nativo no APK, o microfone fica indisponível em vez de quebrar.
- Antes de enviar, `tokenizeVariables` (`src/renderer/tokenize.ts`) troca `name` e `country` da transcrição pelos tokens (sem caixa nem acento, palavra inteira). Faz o possível: um nome ouvido com outra grafia ainda vai como veio. Quando o valor também é palavra literal da frase-alvo (nome "Alex"), as ocorrências que o alvo tem ficam e só as outras viram token.
- O aviso de privacidade é o flag `seen('speech-privacy')`/`markSeen` da loja do Visitante (tabela `seen` no nativo, `fluveny:visitor:seen` no web), não uma Variável do Aluno.

## Lacunas (1.17)

- `GapFill` (`src/player/GapFill.tsx`) é a mecânica das lacunas (linhas, `GapSlot`, banco e campos), sem rede nem avaliação; o `GapsActivity` e o Extra Help (1.18) montam a Atividade em volta dele. No banco, a Answer leva o texto da palavra na variante do pronome, com os tokens; digitada, o texto passa pelo `tokenizeVariables` antes de sair.
- Campo de texto no meio do conteúdo do player chama `useRevealField()` (de `PlayerFrame`) no `onFocus`: com o teclado aberto, a moldura rola até o campo caber acima dele. Quando o teclado abre, ela faz o mesmo com o campo focado (`TextInput.State.currentlyFocusedInput`); sem campo focado, rola até o fim.

## Resposta Livre (1.18)

- `FreeActivity` (`src/player/types/FreeActivity.tsx`): ENVIAR chama `complete('viewed')` (prop do player, que conclui pela rota `completions` sem avançar) e mostra a `modelAnswer` que vem no `CompletionResult`; CONTINUAR avança com `recorded: true`, e o player só grava o Progresso. O texto do aluno fica só no estado da tela: nunca vai à API nem à loja do Visitante, e aparece como texto puro (nunca pelo `RenderedText`).
- EXTRA HELP troca a tela, sem volta, pelas lacunas do banco do `extraHelp`, com a Answer `type: 'free'`. A resposta e a avaliação das lacunas ficam no `useGapAttempt` (`src/player/useGapAttempt.ts`), o mesmo do `GapsActivity`.

## Renderizador do conteúdo (1.10)

- Todo texto do conteúdo na tela usa `RenderedText` (`src/renderer`), com `vars` e `pronoun` do `useRenderVars()`. Nunca mostre `ContentText` cru nem escolha a variante à mão. Texto puro (rótulo, título de linha): `renderPlain`.
- A gramática é a do `ContentRenderer.java` da API (AD-8). Mudou a regra: muda na API e nos vetores, e o App acompanha. `src/renderer/render-vectors.json` e `.lock` só mudam pelo `npm run api:sync`, no mesmo sha do contrato; o `api:check` confere.
- `render` só troca placeholders e marca `studentVar`; `format` interpreta `**` e `[[rótulo|chave]]` só nos segmentos do conteúdo. O valor do aluno é sempre texto.
- Expressões Úteis (1.14): o `[[rótulo|chave]]` só vira trecho tocável dentro de um `ExpressionsProvider` (o player monta um com as `usefulExpressions` da Unidade, do `useStage`) e com chave conhecida; fora dele, é texto comum. O toque abre a `ExpressionSheet`; com a folha de feedback aberta (`disabled`), o trecho fica sem toque. Para trocar o que o toque faz (a Expressão destacada), envolva o texto num `ExpressionContext.Provider` próprio.
