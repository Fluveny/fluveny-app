<!-- bmad:context -->
<!-- Verified 2026-11-14 against b20b7d936b25d440eb2c6eaf4a2d89ea0ffd36cb (feat/1-4-ambiente-local, história 1.4). Managed by bmad-project-context; edits inside this block are replaced on refresh. Keep anything you want preserved outside the markers. -->

## fluveny-app

App do Fluveny: um único projeto Expo (SDK 58, Expo Router, TypeScript ~6.0) para o App Android e o build web. As decisões ficam no repositório de planejamento ([Fluveny/fluveny-planejamento](https://github.com/Fluveny/fluveny-planejamento)), clonado como pasta pai deste: `../_bmad-output/planning-artifacts/`. A spine (`architecture/architecture-Fluveny-2026-11-13/ARCHITECTURE-SPINE.md`) e o DESIGN.md/EXPERIENCE.md vencem qualquer código deste repositório e o protótipo.

## Policy

- Nunca dê push na `main`. Branch curta, PR e squash na `main`, com CI verde e 1 aprovação humana (AD-2).
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

- Telas usam as peças de `src/ui` (importe de `src/ui/index.ts`): `Button`, `Card`, `WordChip`, `XpChip`, `ProgressBar`, `ModeTag`, `SpeechBubble`, `SceneFrame`, `AlexAvatar`, `TextField`, `ChoiceCard`, `StatusBanner`. Nada de estilo de botão, cartão ou chip solto numa tela nem `Pressable` com `solid()`/`sunk()` à mão; peça nova do kit usa `Pressable3D`. Regras, variantes e copy em `src/ui/README.md`; catálogo em `/kit` (só com `__DEV__`).

## Build do EAS só sob pedido

- O `eas build` na nuvem tem cota limitada no plano grátis. Não gere build do EAS na nuvem para verificar uma história nem por rotina: só com pedido explícito do Lucas.
- Dependência nativa nova (`npx expo install`) pede um APK de desenvolvimento novo, gerado **localmente**: `npx expo run:android` (aparelho ou emulador) ou `npx eas-cli build --profile development -p android --local`.
- Para verificar, use `mise run check`, o web e o APK de desenvolvimento local, com `npx expo start`. Se um critério de aceite pedir build do EAS na nuvem, avise antes de gerar.

## Visitante, player e rede (1.10)

- `src/visitor`: `deviceId`, Variáveis do Aluno e Progresso do Visitante, só no aparelho. `store.ts` (expo-sqlite) e `store.web.ts` (localStorage) têm a mesma API; use `visitorStore` ou `useVisitor()`. Nunca mande esses dados para a API antes do cadastro (Épico 2).
- `src/player`: `registry.ts` liga `type` → componente. Tipo novo (1.11 a 1.19) troca o seu `PENDING` por um componente que recebe `{activity, setFooter, advance}`. A Atividade não trata rede: a moldura troca o rodapé por "SEM CONEXÃO".
- `src/network/useOnline.ts`: estado da rede (expo-network no nativo, `navigator.onLine` no web).
- Dependências nativas: `expo-sqlite`, `expo-crypto`, `expo-network`. Nos testes, o `jest.setup.js` as simula (o `expo-sqlite` vira `node:sqlite` em memória).
- Testing Library v14: `fireEvent` também é assíncrono. Sem `await`, os `act()` se sobrepõem e o próximo `renderRouter` do arquivo renderiza vazio.
