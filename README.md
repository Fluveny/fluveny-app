# Fluveny | App

App do Fluveny: um único projeto Expo (SDK 58, Expo Router, TypeScript ~6.0) que gera o App Android do Aluno e o build web (página pública e Painel da equipe). As decisões de arquitetura ficam no repositório de planejamento ([Fluveny/fluveny-planejamento](https://github.com/Fluveny/fluveny-planejamento)); a API é o [Fluveny/fluveny-api](https://github.com/Fluveny/fluveny-api).

## Requisitos

- **Node 22 ou mais novo** (a CI usa o 24) e npm.
- Android: Android Studio com um emulador ou um aparelho, e um JDK 17+ para o `expo run:android`. Sem isso, use o build do EAS.

## Comandos

```bash
npm ci                     # dependências
npx expo start --web       # web em http://localhost:8081
npx expo run:android       # build de desenvolvimento no emulador ou aparelho
npm run typecheck          # tipos das rotas (typedRoutes) + tsc
npx eslint .               # lint (inclui a regra fluveny/no-hex-color)
npx jest                   # testes (jest-expo e Testing Library)
npm run api:tools          # gerador de tipos do contrato (uma vez)
npm run api:check          # contrato da API: cópia, lock e tipos
npx expo export -p web     # build web em dist/ (output single, SPA)
```

## Variáveis de ambiente

Toda configuração vem do ambiente; nenhum segredo fica em arquivo. Para rodar local, copie `.env.example` para `.env.local` (ignorado pelo git). As variáveis `EXPO_PUBLIC_*` entram no bundle, então nunca ponha segredo nelas.

| Variável | Uso |
| --- | --- |
| `EXPO_PUBLIC_API_URL` | Base da API, sem barra no fim (por exemplo, `http://localhost:8080`). No emulador Android, `http://10.0.2.2:8080` (o host visto pelo emulador). Num aparelho físico, o IP da máquina na rede; HTTP sem TLS só funciona em build de debug. |
| `EXPO_PUBLIC_SENTRY_DSN` | Opcional. Sem ela, o Sentry fica desligado. Com ela, os erros vão sem PII (`sendDefaultPii: false` e o `beforeSend` remove usuário, IP, cookies, cabeçalhos de autenticação e corpo). |
| `EXPO_PUBLIC_SENTRY_ENVIRONMENT` | Opcional. Nome do ambiente no Sentry. |
| `EXPO_PUBLIC_STORE_URL` | Opcional. Para onde o botão ATUALIZAR leva no Android. Padrão: a página do pacote na Play. |

## Estrutura

```text
app/
  _layout.tsx        # providers, fontes, Sentry, coluna e a checagem de versão
  (public)/          # web: página pública (por enquanto, a tela inicial provisória)
  (student)/         # App do Aluno (a partir da 1.9)
  atualize.tsx       # "Atualize o app" (versão abaixo do mínimo)
src/
  api/               # cliente, contrato (cópia + lock), tipos gerados, erros, /meta
  ui/                # tokens, logo, coluna e ilustrações (o kit chega na 1.8)
  observability/     # Sentry
  player/ renderer/ visitor/   # vazias até as histórias delas
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

## Versão do App

Toda requisição leva `X-App-Version` com o `version` do `app.json`. Na abertura, o App consulta `GET /api/v1/meta`:

- versão igual ou acima de `minAppVersion`: segue;
- abaixo: fica preso na tela "Atualize o app", sem rota para voltar;
- `/meta` falhou (rede ou 5xx): segue sem bloquear, e o erro vai para o log e o Sentry.

## Convenções

- **Tokens:** cores, tipografia, raios, espaços e sombra sólida ficam em `src/ui/tokens`, escritos a partir do frontmatter do DESIGN.md (cópia em `src/ui/tokens/design.yaml`, atualizada com `npm run design:sync`). O teste dos tokens compara cada valor com o YAML. Cor literal (hex, `rgb()`, `hsl()`) fora de `src/ui/tokens` e das ilustrações (`src/ui/art`) falha o lint.
- **Sombra sólida:** `solid(corEscura, altura)` no estado normal e `sunk(altura)` ao pressionar; o elemento desce a altura exata da sombra e o layout não pula.
- **Fonte:** só Montserrat, de 500 a 900, empacotada. Use os estilos de `typography`; no Android o peso vem da família (`Montserrat_900Black`), não do `fontWeight`.
- **Sem modo escuro e sem gradiente.** O único degradê é o do wordmark no logo, que é asset da marca. O App é só retrato, numa coluna de até 440 dp, centralizada (360 dp é a menor largura suportada, não um piso).
- **Erros:** o App lê o `code` do problem+json e mostra o texto de `src/api/errors.ts`. Nunca mostre o `detail` nem a mensagem crua. Código novo da API ganha texto no catálogo; código desconhecido usa o genérico.
- **Estado do servidor:** TanStack Query. Estado local só de UI.
- Interface em pt-BR; conteúdo do curso em inglês; código e identificadores em inglês.
