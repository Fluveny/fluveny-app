# Fluveny | App

App do Fluveny: um único projeto Expo (SDK 58, Expo Router, TypeScript ~6.0) que gera o App Android do Aluno e o build web (página pública e Painel da equipe). As decisões de arquitetura ficam no repositório de planejamento ([Fluveny/fluveny-planejamento](https://github.com/Fluveny/fluveny-planejamento)); a API é o [Fluveny/fluveny-api](https://github.com/Fluveny/fluveny-api).

## Requisitos

- **[mise](https://mise.jdx.dev)** (`brew install mise`). Ele instala o Node 24 e o lefthook nas versões do `mise.toml`.
- **Docker** ligado, para a API local (`mise run api`). Não precisa de JDK nem de Mongo: a API vem pronta da imagem.
- Android: Android SDK (com NDK), JDK 17 e `adb`, para gerar o APK de desenvolvimento na sua máquina (abaixo), num emulador ou aparelho.

> **Docker Desktop:** o `mongo:8` não sobe em kernels Linux 6.19 a 7.0.13 (SERVER-121912), e o `mise run api` para no Mongo. Confira com `docker info --format '{{.KernelVersion}}'` e, se estiver na faixa, atualize o Docker Desktop.

## Ambiente local

```bash
mise trust && mise install   # uma vez: Node 24 e lefthook
mise run setup               # npm ci, gerador de tipos da API e hooks do git
cp .env.example .env.local   # EXPO_PUBLIC_API_URL=http://localhost:8080
mise run api                 # API em http://localhost:8080 + Mongo, em outro terminal
npx expo start --web         # web em http://localhost:8081
```

- O `mise run api` sobe, com o `docker-compose.local.yml`, a imagem da API no sha do lock do contrato (`ghcr.io/fluveny/fluveny-api:sha-<sha do lock>`, no perfil `local`) e um `mongo:8` em replica set de um nó. App e API ficam sempre no mesmo contrato. Se a imagem não existir, a tarefa diz o que fazer: `npm run api:sync` (lock anterior ao perfil `local` da API) ou `docker login ghcr.io` (enquanto a imagem for privada no GHCR; use um token do GitHub com `read:packages`).
- Senha dos usuários que os carregadores da API criam: `LOCAL_SEED_PASSWORD=... mise run api`. O compose lê a variável do terminal, não do `.env.local` do Expo.
- O banco persiste entre um `up` e outro; `mise run api:down` derruba tudo e apaga o banco. Para recarregar os dados com a API no ar: `curl -X POST localhost:8080/local/reset`.
- A API local libera a CORS para `http://localhost:8081` (1.22). Para outra origem: `FLUVENY_WEB_ORIGINS=http://localhost:8081,http://localhost:8082 mise run api` (separadas por vírgula). Num celular, use `localhost` pelo `adb reverse` (abaixo), não o IP da máquina: fora de contexto seguro (HTTPS ou `localhost`), o `crypto.randomUUID` e o microfone não funcionam e o App quebra.

### Sem a API (mock)

Com `EXPO_PUBLIC_API_MOCK=1` no `.env.local` (ou na linha de comando), o App responde a API com os mocks de `src/api/mocks` (MSW) e abre sem nada no ar:

```bash
EXPO_PUBLIC_API_MOCK=1 npx expo start --web
```

- No web, o MSW roda no service worker `public/mockServiceWorker.js`; no Android, intercepta o `fetch`. Ele sobe antes do primeiro render, então o `/meta` da abertura já sai para o mock.
- No Android, o `src/api/mocks/mswPolyfills.ts` define antes o que o MSW pede e o Hermes não tem (`MessageEvent`, `BroadcastChannel`, `Headers.getSetCookie`). Se uma versão nova do MSW quebrar com "Property 'X' doesn't exist", o polyfill entra ali. Depois de mexer nos mocks, reinicie o Metro com `--clear`: o cache pode servir o bundle antigo.
- Os mocks são tipados pelo `schema.d.ts`: toda rota e método do contrato precisa de uma resposta em `src/api/mocks/routes.ts`, senão o `tsc` e o teste falham. Depois de um `api:sync` que traz rota nova, escreva o mock dela.
- Só a visão do aluno: Atividade mockada usa os tipos `*StudentView`, nunca a Atividade com resposta e justificativa. O teste falha se um mock trouxer campo que só existe fora da `StudentView`.
- Com a variável vazia, o MSW nem entra no bundle.

### Android (build local)

O App usa módulos nativos (`expo-sqlite`, `expo-crypto`, `expo-network`, `expo-dev-client`…), então o Expo Go não serve: é preciso um APK de desenvolvimento com eles. Ele é gerado **na sua máquina**, nunca na nuvem do EAS (a cota do plano grátis é limitada; ver `AGENTS.md`).

Pré-requisitos: Android SDK com NDK, JDK 17 e `adb` no `PATH` (`ANDROID_HOME` apontando para o SDK).

```bash
npx expo run:android                                          # compila, instala o dev client no emulador/aparelho e abre o Metro
npx eas-cli build --profile development -p android --local    # só se precisar de um .apk instalável para outra pessoa
```

- O `npx expo run:android` gera a pasta `android/` (ignorada pelo git) e instala o APK no aparelho conectado ou no emulador aberto. Depois disso, `npx expo start` basta enquanto nenhuma dependência nativa mudar.
- Dependência nativa nova entra com `npx expo install <pacote>` e pede um novo `npx expo run:android`.
- O build `--local` usa o perfil `development` do `eas.json` e deixa o `.apk` na pasta do projeto; não gasta a cota do EAS, mas pede `npx eas-cli login` com uma conta que tenha acesso à org `fluveny` do Expo (o projeto é dela).
- No emulador, a API fica em `http://10.0.2.2:8080`; num aparelho, no IP da sua máquina na rede.

### Web instalável e prova no aparelho (1.22)

O build web tem manifesto (`public/manifest.json`, ícones em `public/icons/`, meta tags em `public/index.html`) e pode ir para a tela inicial. Não há service worker de cache, porque não há modo offline (FR-10); o `mockServiceWorker.js` só é registrado com o mock ligado.

- **Orçamento:** a primeira tela (scripts do `index.html` mais os chunks do layout raiz e das boas-vindas) cabe em 500 KB com gzip (NFR11). O `mise run check` roda `npm run bundle:budget` depois do export e falha acima disso, com o peso de cada arquivo.
- **Sentry no web:** o SDK sai da primeira tela. O `initSentry` do `src/observability/sentry.web.ts` agenda o `import()` para depois do primeiro render, fora do React (`requestIdleCallback` ou `setTimeout` 0). Os erros de antes (os do `captureError` e os não tratados da janela) esperam numa fila de até 20. Sem DSN, nada é carregado; se o carregamento falhar, a fila é descartada.
- **Conferir no desktop:** `npx expo export -p web && npx serve -s dist -l 8081`, abra `http://localhost:8081` no Chrome com a emulação de celular. Em DevTools › Application › Manifest, o manifesto aparece sem erros e instalável; na aba Network, o chunk do Sentry não está entre os scripts da primeira tela (sem DSN, ele nunca baixa; com DSN, baixa depois do primeiro render).

**Roteiro do teste num Android de entrada.** O celular acessa o App e a API por `localhost`, via `adb reverse`, porque o `crypto.randomUUID` e o microfone só funcionam em contexto seguro (HTTPS ou `localhost`); pelo IP da máquina, o App quebra.

1. Num terminal, suba a API: `mise run api`.
2. Com `EXPO_PUBLIC_API_URL=http://localhost:8080` no `.env.local` e sem `EXPO_PUBLIC_API_MOCK`, gere o export de produção e sirva: `npx expo export -p web && npx serve -s dist -l 8081`.
3. Ligue a depuração USB no celular, conecte o cabo e rode `adb reverse tcp:8081 tcp:8081 && adb reverse tcp:8080 tcp:8080`.
4. No Chrome do celular, abra `http://localhost:8081`. No Chrome do desktop, abra `chrome://inspect`, clique em **inspect** na aba do celular e, em Network, escolha o perfil **Fast 4G** (desligue o cache).
5. Recarregue e percorra o Estágio inteiro, da boas-vindas à última Atividade. Teste também: instalar na tela inicial (menu › Adicionar à tela inicial) e abrir pelo ícone; o botão voltar do Android; e a animação com "Remover animações" ligado nas opções de acessibilidade.
6. Registre na seção "Prova no aparelho" da spec da 1.22 (`_bmad-output/implementation-artifacts/spec-1-22-app-web-instalavel-e-leve.md`):
   - aparelho (modelo, Android, RAM) e versão do Chrome (`chrome://version`);
   - tempo da próxima Atividade: do toque em CONTINUAR até a próxima aparecer (Performance do DevTools remoto ou cronômetro, três medidas);
   - problemas encontrados, com o passo onde apareceram;
   - capturas da boas-vindas, de uma Atividade, da folha de feedback e do App instalado.
7. Ao terminar: `adb reverse --remove-all` e `mise run api:down`.

### Homologação: Worker da Cloudflare (1.6)

O App web de homologação e a API ficam na mesma origem, por um Worker da Cloudflare (`fluveny-homolog`, em `*.workers.dev`; AD-18). Custo zero, no plano free (NFR22).

- **O que ele faz:** `wrangler.jsonc` serve o `dist/` com fallback de SPA (`not_found_handling: single-page-application`); só `/api/*` passa pelo código (`run_worker_first`). O [`worker/index.js`](worker/index.js) faz proxy de `/api/*` para a API do Render (`vars.API_ORIGIN`), com o mesmo método, caminho, query, corpo e cabeçalhos do aluno, sem seguir redirecionamento. Ele troca os `X-Fluveny-Proxy` e `X-Fluveny-Client-IP` que vierem do navegador pelos seus: o segredo de proxy e o `CF-Connecting-IP` que a borda do Cloudflare escreveu. A API lê o IP do aluno do `X-Fluveny-Client-IP`, porque o Render também fica atrás do Cloudflare, que troca o `CF-Connecting-IP` pelo IP do Worker na subrequisição. Sem o segredo no Worker, `/api/*` responde `503` problem+json, sem chamar a API; com a API fora do ar, `502`.
- **Só o handler sai do módulo:** o runtime de Workers trata todo export nomeado como handler e não sobe com uma constante exportada. O teste do Worker (`worker/__tests__`) confere isso e a matriz da spec.
- **Deploy:** a cada merge na `main`, o job "Deploy em homologação" do `ci.yml` (depois de `Segredos` e `Verificação`) gera o export web com `EXPO_PUBLIC_API_URL` = a origem do Worker e `EXPO_PUBLIC_SENTRY_ENVIRONMENT=homolog`, publica com `npx --yes wrangler@4.164.0 deploy --secrets-file`, que sobe o `PROXY_SECRET` na mesma versão do código (arquivo JSON temporário, modo 600, apagado no fim do passo), e confere o deploy: a página e `/api/v1/units` (200 com JSON) pela origem do Worker. Sem o secret `CLOUDFLARE_API_TOKEN`, o job avisa e não falha; com ele e faltando outro item do Environment, falha.
- **Conferir a configuração:** o `mise run check` roda `npx --yes wrangler@4.164.0 deploy --dry-run` depois do export, sem credenciais. Para rodar local: `npx --yes wrangler@4.164.0 dev --var PROXY_SECRET:<qualquer valor>` (com um valor falso, `/api/v1/units` responde 403 da API, o que prova o proxy; `/api/v1/meta` responde 200).

**Configuração, uma vez (quem tiver acesso de administrador):**

1. **Conta:** crie a conta da Cloudflare do Fluveny (plano Free) e, em Manage Account → Members, convide um segundo administrador, para a conta não depender de uma pessoa só.
2. **Subdomínio:** em Workers & Pages, escolha o subdomínio `*.workers.dev` da conta. A origem do Worker fica `https://fluveny-homolog.<subdomínio>.workers.dev`.
3. **Token:** em My Profile → API Tokens → Create Token, use o modelo "Edit Cloudflare Workers", restrito a essa conta. Copie o Account ID (Workers & Pages, coluna da direita).
4. **GitHub:** em Settings → Environments do `fluveny-app`, crie o `homolog` com:
   - secrets `CLOUDFLARE_API_TOKEN` (o token do passo 3) e `FLUVENY_PROXY_SECRET` (o mesmo valor do Render, veja o README da API);
   - variáveis `CLOUDFLARE_ACCOUNT_ID` e `FLUVENY_WEB_ORIGIN` (a origem do passo 2, sem barra no fim).
5. **API:** no Render, `FLUVENY_WEB_ORIGINS` com a mesma origem do Worker. Mescle o PR da API antes do PR do Worker: com o Worker no ar e a API antiga, o limite do Visitante contaria todos os alunos no IP do Worker.
6. **Conferir:** depois do primeiro deploy,

   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' https://fluveny-homolog.<subdomínio>.workers.dev/              # 200 (index.html)
   curl -s -o /dev/null -w '%{http_code}\n' https://fluveny-homolog.<subdomínio>.workers.dev/manifest.json # 200
   curl -s -o /dev/null -w '%{http_code}\n' https://fluveny-homolog.<subdomínio>.workers.dev/api/v1/units # 200
   ```

   No celular, abra a origem do Worker e percorra o Estágio 1 sem erro de CORS nem 403. Limite por IP: ~300 `POST /api/v1/visitor/attempts` da máquina pelo Worker chegam ao 429, e o celular no 4G segue usando o App.

## Comandos

```bash
mise run check             # o mesmo que a CI: npm ci, tipos, lint, prettier, testes, contrato, build web e orçamento
mise run format            # prettier --write
npx expo start --web       # web em http://localhost:8081
npx expo run:android       # build de desenvolvimento local (Android SDK com NDK e JDK 17)
npm run typecheck          # tipos das rotas (typedRoutes) + tsc
npx eslint .               # lint (inclui a regra fluveny/no-hex-color)
npx jest                   # testes (jest-expo e Testing Library)
npm run api:tools          # gerador de tipos do contrato (uma vez)
npm run api:check          # contrato da API: cópia, lock, tipos e vetores de renderização
npx expo export -p web     # build web em dist/ (output single, SPA)
npm run bundle:budget      # orçamento da primeira tela no dist/ (500 KB com gzip)
```

A formatação é a do Prettier (`.prettierrc.json`); o hook do lefthook formata os arquivos staged a cada commit, e a CI roda `prettier --check`.

## Variáveis de ambiente

Toda configuração vem do ambiente; nenhum segredo fica em arquivo. Para rodar local, copie `.env.example` para `.env.local` (ignorado pelo git). As variáveis `EXPO_PUBLIC_*` entram no bundle, então nunca ponha segredo nelas.

| Variável                         | Uso                                                                                                                                                                                                                                                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EXPO_PUBLIC_API_URL`            | Base da API, sem barra no fim (por exemplo, `http://localhost:8080`). No emulador Android, `http://10.0.2.2:8080` (o host visto pelo emulador). Num aparelho físico, o IP da máquina na rede; HTTP sem TLS só funciona em build de debug. Em homologação, a CI usa a origem do Worker (`FLUVENY_WEB_ORIGIN`). |
| `EXPO_PUBLIC_SENTRY_DSN`         | Opcional. Sem ela, o Sentry fica desligado. Com ela, os erros vão sem PII (`sendDefaultPii: false` e o `beforeSend` remove usuário, IP, cookies, cabeçalhos de autenticação e corpo).                                                                                                                         |
| `EXPO_PUBLIC_SENTRY_ENVIRONMENT` | Opcional. Nome do ambiente no Sentry.                                                                                                                                                                                                                                                                         |
| `EXPO_PUBLIC_STORE_URL`          | Opcional. Para onde o botão ATUALIZAR leva no Android. Padrão: a página do pacote na Play.                                                                                                                                                                                                                    |

## Estrutura

```text
app/
  _layout.tsx        # providers, fontes, Sentry, coluna, checagem de versão e partida a frio
  (public)/          # boas-vindas (raiz) e "Em breve"
  (student)/         # App do Aluno: o player (1.10)
  atualize.tsx       # "Atualize o app" (versão abaixo do mínimo)
src/
  api/               # cliente, contrato (cópia + lock), tipos gerados, erros, /meta
  ui/                # tokens, kit, logo, coluna e ilustrações
  observability/     # Sentry
  player/            # moldura do player, registro dos Tipos (registry.ts) e transição
  visitor/           # Visitante no aparelho: deviceId, variáveis e Progresso (expo-sqlite; localStorage no web)
  network/           # estado da rede (expo-network; navigator.onLine no web)
  ColdStartScreen.tsx  # "Acordando o campus…" (partida a frio do servidor)
  renderer/          # renderizador do conteúdo (placeholders, pronome, negrito, ouro) e render-vectors.json da API
assets/fonts/        # Montserrat 500 a 900 (OFL)
assets/logo.svg      # logo em Lexend Zetta, como imagem
```

## Contrato da API (AD-11)

O App guarda uma cópia do `openapi/openapi.json` da API em `src/api/openapi.json`, com o lock em `src/api/openapi.lock` (sha da `main` da API e sha256 do arquivo). Os tipos em `src/api/schema.d.ts` saem da cópia pelo `openapi-typescript` 7.13.

```bash
npm run api:sync           # cópia da ponta da main da API
npm run api:sync <sha>     # cópia num sha da main (recusa sha fora da main)
npm run api:types          # só regenera schema.d.ts a partir da cópia
```

- Só o `api:sync` muda a cópia e o lock. Não edite os dois arquivos nem o `schema.d.ts` à mão.
- O `openapi-typescript` 7.13 pede `typescript ^5`, e o App usa o 6. Por isso ele fica isolado em `tools/openapi-types`, com `typescript` 5.9.3 e `openapi-typescript` 7.13.0 presos no `package-lock.json` dela. Instale uma vez com `npm run api:tools` (é um `npm ci` nessa pasta) antes de `api:sync`, `api:types` ou `api:check`.
- A CI (`npm run api:check`) falha se a cópia não bater com o arquivo da API no sha do lock, se o sha não estiver na `main` ou se os tipos divergirem da cópia. Ela avisa, sem falhar, quando a cópia está atrás da `main` da API.
- No mesmo sha, o `api:sync` copia o `content/schema/render-vectors.json` da API para `src/renderer/render-vectors.json`, com o lock em `src/renderer/render-vectors.lock`, na mesma escrita atômica. O `api:check` falha se a cópia dos vetores não bater com o lock, se o lock dos vetores estiver noutro sha que o do contrato ou se o arquivo da API nesse sha não for o do lock. Não edite os vetores à mão.

## Versão do App

Toda requisição leva `X-App-Version` com o `version` do `app.json`. Na abertura, o App consulta `GET /api/v1/meta`:

- versão igual ou acima de `minAppVersion`: segue;
- abaixo: fica preso na tela "Atualize o app", sem rota para voltar;
- `/meta` falhou (rede ou 5xx) antes de 3 s: segue sem bloquear, e o erro vai para o log e o Sentry;
- `/meta` sem resposta em 3 s (`META_SPLASH_TIMEOUT_MS`): entra a tela azul "Acordando o campus…" (partida a frio do servidor), que fica até o `/meta` responder. Sem resposta (`NETWORK_ERROR`), ela mostra a faixa "Sem conexão" e refaz o `/meta` a cada 3 s.

## Visitante e player (1.10)

- A boas-vindas é a raiz. EXPERIMENTAR AGORA abre o player (`app/(student)/player.tsx`) no Estágio da posição 0 da `unit-1`; CRIAR CONTA e ENTRAR levam a "Em breve" até o Épico 2.
- `src/visitor` guarda no aparelho o `deviceId` (UUID gerado uma vez), as Variáveis do Aluno e o Progresso (`activityKey`, `outcome`, `xp`; só a primeira conclusão vale). No Android, `expo-sqlite`; no web, `localStorage` (`store.web.ts`). Nada disso vai para a API.
- `src/player/registry.ts` liga cada `type` de Atividade a um componente. Tipo sem componente (`PENDING`) mostra "Atividade em preparação" com CONTINUAR, que avança sem gravar Progresso. A Atividade chama `setFooter({label, disabled, onPress})`; a moldura põe "SEM CONEXÃO" por cima quando a rede cai.
- Todo texto do conteúdo passa pelo renderizador (`src/renderer`, AD-8): `render(text, vars, pronoun)` escolhe a variante de pronome (`they` sem pronome salvo) e troca os placeholders (`{name}`) pelas Variáveis do Aluno, com as regras do `ContentRenderer.java` da API; todos os vetores do `render-vectors.json` rodam no jest. Na tela, use `<RenderedText text vars pronoun style />`, com `vars` e `pronoun` do `useRenderVars()`: `**negrito**` em Montserrat 800, `[[rótulo|chave]]` só com o rótulo e a Variável do Aluno em ouro. O valor do aluno nunca vira formatação. Onde só cabe texto puro (o título do Estágio), use `renderPlain`.
- Nos testes, o `jest.setup.js` troca o `expo-sqlite` por um SQLite em memória do Node (`node:sqlite`) e simula o `expo-network` (`global.__setNetwork`).

## Convenções

- **Tokens:** cores, tipografia, raios, espaços e sombra sólida ficam em `src/ui/tokens`, escritos a partir do frontmatter do DESIGN.md (cópia em `src/ui/tokens/design.yaml`, atualizada com `npm run design:sync`). O teste dos tokens compara cada valor com o YAML. Cor literal (hex, `rgb()`, `hsl()`) fora de `src/ui/tokens` e das ilustrações (`src/ui/art`) falha o lint.
- **Sombra sólida:** `solid(corEscura, altura)` no estado normal e `sunk(altura)` ao pressionar; o elemento desce a altura exata da sombra e o layout não pula.
- **Fonte:** só Montserrat, de 500 a 900, empacotada. Use os estilos de `typography`; no Android o peso vem da família (`Montserrat_900Black`), não do `fontWeight`.
- **Sem modo escuro e sem gradiente.** O único degradê é o do wordmark no logo, que é asset da marca. O App é só retrato, numa coluna de até 440 dp, centralizada (360 dp é a menor largura suportada, não um piso).
- **Erros:** o App lê o `code` do problem+json e mostra o texto de `src/api/errors.ts`. Nunca mostre o `detail` nem a mensagem crua. Código novo da API ganha texto no catálogo; código desconhecido usa o genérico.
- **Estado do servidor:** TanStack Query. Estado local só de UI.
- Interface em pt-BR; conteúdo do curso em inglês; código e identificadores em inglês.

## Contribuindo

Fluxo de branches, commits e PR no [`CONTRIBUTING.md`](CONTRIBUTING.md).
