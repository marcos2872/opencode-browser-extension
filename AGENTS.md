# AGENTS.md

Guia para agentes de código neste repositório. Leia antes de alterar o projeto.

## Comandos

Requisitos: Node.js 20+ e npm (o CI usa Node 22). O gerenciador é o **npm**
(`package-lock.json`); não há Makefile nem script de formatação. Todos os
comandos abaixo existem em `package.json` ou nos workflows de CI.

```bash
npm install              # instala dependências (README)
npm ci                   # instalação limpa e reprodutível (CI)

npm run dev              # servidor de desenvolvimento do Vite (apenas UI)
npm run build            # build completo em dist/ (UI + background + content + offscreen)
npm run build:ui         # side panel, options e permission
npm run build:bg         # service worker (assets/background.js)
npm run build:content    # content script (assets/content.js)
npm run build:offscreen  # documento offscreen (assets/offscreen.js)

npm run typecheck        # tsc --noEmit
npm run lint             # ESLint em todo o repositório
npm test                 # Vitest, execução única
npm run test:watch       # Vitest em modo interativo
npm run test:coverage    # Vitest + cobertura (mínimo de 80%)
npm run verify           # typecheck + build completo

npm run install:plugin   # copia o relay e o template do agente para ~/.config/opencode/plugins
npm run package          # build + zip em opencode-browser-extension.zip
```

O que o CI executa:

| Workflow | Arquivo | Passos |
|---|---|---|
| Testes e cobertura | `.github/workflows/test.yml` | `npm ci` → `npm run test:coverage` → resumo e artefato `coverage/` |
| Lint, tipos e build | `.github/workflows/quality.yml` | `npm ci` → `npm run lint` → `npm run typecheck` → `npm run build` → confere os artefatos de `dist/` |

Ambos rodam em toda `pull_request` e em `push` para `main`.

Fluxo mínimo antes de concluir uma alteração de código:

```bash
npm run lint && npm run typecheck && npm test
```

Para mudanças de build ou de manifest, rode também `npm run build`. Depois de
buildar, recarregue a extensão em `chrome://extensions`: o Chrome mantém o
service worker em cache e o comportamento antigo continua até o reload.

## Arquitetura

O projeto tem duas partes que conversam por loopback:

| Parte | Responsabilidade | Onde fica |
|---|---|---|
| Extensão MV3 | UI, sessões, streaming, permissões e execução das ações no navegador | `src/` (build em `dist/`) |
| Plugin `browser-relay` | Registra as 18 tools `browser_*` no OpenCode e faz a ponte WebSocket com a extensão | `plugin/browser-relay.ts` |

Nada sai da máquina: a extensão fala com o OpenCode local (`127.0.0.1`) e o
plugin escuta apenas em loopback (portas `8799`–`8802`). O relay exige um
`hello` da extensão antes de ativar o socket e publica token/porta em um arquivo
privado (`$XDG_RUNTIME_DIR/opencode-browser/relay.json` ou
`~/.cache/opencode-browser/relay.json`).

### Contextos da extensão

| Camada | Arquivos | Papel |
|---|---|---|
| Background | `src/background/**` | Orquestrador, cliente da API v2, SSE, relay, CDP, grupos de abas, permissões e tools |
| Conteúdo | `src/content/**` | Árvore de acessibilidade com refs, ações de DOM, indicador visual e botão Parar |
| UI | `src/sidepanel`, `src/options`, `src/permission` | Chat, configurações e popup de permissão (React 19) |
| Offscreen | `src/offscreen.ts` | Keepalive do service worker, som e codificação de GIF |
| Compartilhado | `src/shared/**` | Tipos, protocolo do relay/UI e armazenamento |

### Fluxo principal

1. O side panel conversa com o service worker por um `Port` (`opencode-browser-ui`).
2. O service worker fala com o OpenCode por HTTP + SSE, com Basic auth
   (`opencode:<token>` obtido no pareamento).
3. A extensão abre o WebSocket e envia `hello`; só depois o plugin a considera
   ativa e envia `tool_request`. O service worker aplica a permissão, executa a
   tool e devolve `tool_result` pelo mesmo socket.
4. Ações que alteram a página passam por permissão por ação/domínio; tools de
   leitura executam direto. Cada sessão ganha um grupo de abas isolado.
5. Entrada confiável, screenshots, console e rede usam CDP via
   `chrome.debugger`, com fallback para eventos de DOM em iframes.

### Build

São quatro configurações do Vite porque cada contexto do MV3 tem requisitos
diferentes:

| Config | Entrada | Formato | Saída |
|---|---|---|---|
| `vite.config.ts` | `sidepanel.html`, `options.html`, `permission.html` | ESM + HTML | páginas + `assets/*-[hash].js/css` |
| `vite.background.config.ts` | `src/background/service-worker.ts` | ESM (lib) | `assets/background.js` |
| `vite.content.config.ts` | `src/content/index.ts` | IIFE | `assets/content.js` |
| `vite.offscreen.config.ts` | `src/offscreen.ts` | IIFE | `assets/offscreen.js` |

O primeiro build limpa `dist/`; os demais usam `emptyOutDir: false`. Arquivos
estáticos (`manifest.json`, ícones e `offscreen.html`) vêm de `public/`. Nunca
edite `dist/`: é artefato gerado e está no `.gitignore`.

### Pontos de entrada

- `src/background/service-worker.ts` — estado e orquestração do background.
- `src/background/tools/registry.ts` — registro das tools e `browser_batch`
  (máximo de 20 ações).
- `plugin/browser-relay.ts` — servidor WebSocket, handshake `hello`/`ready`,
  `/health`, fallback HTTP `/tool` e `/cancel`, token privado e atualização
  versionada do agente.
- `src/shared/types.ts` e `src/shared/protocol.ts` — contratos compartilhados.
- `public/manifest.json` — manifest MV3 (permissões, content script, side panel).

Documentação detalhada em `docs/` (comece por `docs/index.md`, depois
`architecture.md`, `extension.md`, `plugin.md`, `tools.md` e `development.md`).
Decisões estruturais estão em `docs/adr/`.

## Convenções

- **Idioma:** código e documentação em português brasileiro; identificadores
  (variáveis, funções, tipos) em inglês. Mensagens de erro são voltadas ao
  usuário final, em português, dizendo o que fazer.
- **TypeScript estrito:** `strict: true`, `noEmit`, `verbatimModuleSyntax` e
  imports relativos (sem aliases). Use `import type` para tipos.
- **Tipos compartilhados:** ficam em `src/shared/`; não duplique tipos nos
  módulos. Novas mensagens de UI ou do relay devem ser adicionadas aos unions em
  `src/shared/protocol.ts`.
- **Tools:** nomes no formato `browser_*`; o registry remove o prefixo antes do
  despacho. Implementações ficam em `src/background/tools/` e devem devolver
  `ToolResult` (`content` + `images?` + `metadata?`). No relay, a tool pode ter
  um `wire` diferente do nome exposto: `tabs_close_tab` é exposta ao modelo como
  `browser_tabs_close_tab` e chega à extensão como `tabs_close`. **Não use
  `tabs_close` como nome exposto**: o plugin nativo `opencode.browser` registra
  `browser.tabs.close` e o nome `browser_tabs_close` colide e desaparece.
- **Permissões:** tools de leitura listadas em `permissions.ts` executam direto;
  as demais passam por `ctx.ask` conforme o modo (`ask`, `allow`, `deny`).
  Respeite as listas `permissions.allow` e `permissions.deny`.
- **Armazenamento:** chaves namespaced em `chrome.storage.local`, centralizadas
  em `src/shared/storage.ts` (`opencode.config`, `permissions.allow`,
  `permissions.deny`). Não espalhe acessos diretos a `chrome.storage`.
- **Estilo:** 2 espaços, aspas duplas, sem ponto e vírgula. ESLint usa
  `typescript-eslint` + `react-hooks`; `no-explicit-any` é liberado, mas evite.
- **Testes:** Vitest com `jsdom`, Testing Library e mock global das APIs do
  Chrome. Os testes ficam em `tests/`, espelhando `src/`; helpers em
  `tests/helpers/` (`chrome.ts` e `factories.ts`). Cobertura mínima de 80% para
  linhas, funções, branches e instruções (`vitest.config.ts`).
- **Commits:** Conventional Commits em português (`feat:`, `fix:`, `docs:`,
  `test:`, `ci:`, `chore:`), conforme o histórico do repositório.
- **Documentação:** vive em `docs/`, nunca dentro de `src/`.

### Armadilhas conhecidas

- `npm run typecheck` cobre apenas `src/` (o `tsconfig.json` tem
  `include: ["src"]`); `plugin/` e `tests/` não são checados por ele.
- O manifest é `public/manifest.json`. Alterar permissões ou o content script
  exige mudança nesse arquivo, não em `dist/`.
- O plugin valida a origem pelo ID fixo da extensão. Se o ID mudar, ajuste
  `OPENCODE_BROWSER_EXTENSION_ID` ou use `OPENCODE_BROWSER_ALLOW_ANY_EXTENSION=1`.
- Mantenha **uma única** cópia do plugin em `~/.config/opencode/plugins/`; duas
  cópias registram o mesmo id e uma falha.
- `npm run install:plugin` e o runtime do plugin usam apenas APIs Node/Bun
  (`os.homedir()`, `path.join`, `node:fs`, `node:crypto`), para funcionar em
  Linux, macOS e Windows. Não introduza comandos de shell POSIX no plugin.
- O token/porta do relay ficam em `$XDG_RUNTIME_DIR/opencode-browser/relay.json`
  ou `~/.cache/opencode-browser/relay.json` (pasta `0700`, arquivo `0600`). O
  antigo `/tmp/opencode-browser-relay.token` não é mais lido.
- O serviço do OpenCode carrega o plugin e o agente no startup. Depois de
  `npm run install:plugin` ou de atualizar o template, rode
  `opencode service restart`; senão o plugin/agente antigo continua em memória.
- O OpenCode v2 tem um plugin nativo `opencode.browser` que registra
  `browser.tabs.close` como `browser_tabs_close`. O nome é reservado: a tool do
  projeto é `browser_tabs_close_tab` (wire `tabs_close`). Não renomeie de volta.
- O agente `opencode-browser` é atualizado por marcador de versão
  (`<!-- opencode-browser-agent vN -->`), com backup `.bak-vN`. Arquivo sem
  marcador ou com versão igual/maior é preservado.
- O service worker não tem DOM: som e GIF ficam no documento offscreen.
- `plugin/browser-relay.ts` é copiado como arquivo local para
  `~/.config/opencode/plugins/`. Não importe `@opencode/plugin` nele: versões
  antigas do serviço não resolvem o pacote. `Plugin.define` é só identidade;
  exporte o objeto `{ id, setup }` diretamente.

## Memória do projeto

- Ao aprender algo durável sobre este projeto (decisão, convenção, armadilha, preferência do usuário), salve com a tool `memory_write` — uma frase objetiva por memória.
- As memórias são injetadas automaticamente no seu contexto (bloco `<project-memory>`); siga-as.
- Liste com `memory_list` e remova memórias obsoletas com `memory_delete`; o usuário também gerencia via `/memory`.
