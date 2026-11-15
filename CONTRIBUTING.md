# Contribuindo com o App do Fluveny

As decisões de arquitetura ficam no repositório de planejamento ([Fluveny/fluveny-planejamento](https://github.com/Fluveny/fluveny-planejamento)), e a gestão no [GitHub Projects](https://github.com/orgs/Fluveny/projects/12). Cada história do `epics.md` tem um card lá.

## Primeira vez

Precisa de [mise](https://mise.jdx.dev) (`brew install mise`) e do Docker ligado. Nada de JDK nem de Mongo: a API local vem da imagem.

```bash
git clone https://github.com/Fluveny/fluveny-app.git && cd fluveny-app
mise trust && mise install   # Node 24 e lefthook
mise run setup               # npm ci, gerador de tipos da API e hooks do git
cp .env.example .env.local
mise run api                 # API e Mongo em http://localhost:8080 (deixe rodando)
npx expo start --web         # em outro terminal: http://localhost:8081
```

- Se o `mise run api` disser que a imagem não existe, siga a mensagem: `npm run api:sync` ou `docker login ghcr.io` (token do GitHub com `read:packages`, enquanto a imagem da API for privada).
- Se o Mongo parar com "exited with code 1", o kernel do Docker está na faixa 6.19 a 7.0.13, em que o `mongo:8` não sobe (SERVER-121912): confira com `docker info --format '{{.KernelVersion}}'` e atualize o Docker Desktop.
- Senha dos usuários de seed da API: `LOCAL_SEED_PASSWORD=... mise run api` (o compose lê o ambiente do terminal, não o `.env.local` do Expo).
- Sem Docker ou sem a API, `EXPO_PUBLIC_API_MOCK=1 npx expo start --web` abre o App com os mocks.
- Android: instale o APK de desenvolvimento do [README](README.md#android-eas) e rode `npx expo start`.

## Fluxo: trunk-based com squash

- A `main` é o tronco e está sempre pronta para deploy. Nunca dê push direto nela.
- Cada história (ou parte dela) vira uma branch curta a partir da `main`, um PR e um squash na `main`. Rebaseie na `main` em vez de fazer merge dela na branch.
- O merge exige a CI verde e 1 aprovação humana (AD-2).
- Depois do merge, apague a branch, mude o status da história no `sprint-status.yaml` do planejamento e mova o card no Project.

### Nome das branches

`<tipo>/<história>-<resumo-curto>`, em minúsculas e kebab-case, com a história no formato da chave do `sprint-status.yaml` (`1-4`, não `1.4`):

| Tipo       | Quando                                  | Exemplo                                 |
| ---------- | --------------------------------------- | --------------------------------------- |
| `feat`     | funcionalidade de uma história          | `feat/1-9-kit-balao-cena-campos-faixas` |
| `fix`      | correção de bug                         | `fix/2-3-sessao-expirada`               |
| `chore`    | build, CI, dependências, ferramentas    | `chore/atualiza-expo`                   |
| `docs`     | só documentação                         | `docs/readme-ambiente-local`            |
| `refactor` | mudança interna sem mudar comportamento | `refactor/api-client`                   |

Trabalho fora de uma história fica sem o número.

### Commits e título do PR

- O título do PR vira a mensagem do squash: `<tipo>: <o que muda> (história X.Y)`, em português, por exemplo `feat: ambiente local em um comando (história 1.4)`.
- Dentro da branch, os commits são livres. Formatação em massa vai num commit só de formatação, separado do resto.
- O lefthook formata os arquivos staged com o Prettier a cada commit. A CI roda `mise run check`, que falha se algum arquivo estiver fora do formato (`mise run format` corrige).

### Template de PR

O [`.github/pull_request_template.md`](.github/pull_request_template.md) já vem no corpo de todo PR. Preencha:

- **História:** a chave do `sprint-status.yaml` e o link do card.
- **O que muda:** duas ou três frases.
- **Critérios de aceite:** copiados do `epics.md`, com o estado de cada um e o que ficou de fora.
- **Como testar:** os passos para quem revisa.
- **Checklist:** CI verde, `bmad-code-review` num contexto novo, nada contra as AD-1 a AD-19, nenhum segredo, README atualizado.

## Antes de abrir o PR

```bash
mise run check
```

É exatamente o que a CI roda (NFR13). O contrato da API só muda por `npm run api:sync`; rota nova no contrato pede um mock em `src/api/mocks/routes.ts`. Nunca edite o `openapi.json`, o `openapi.lock` nem o `schema.d.ts` à mão.
