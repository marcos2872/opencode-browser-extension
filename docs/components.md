# Componentes e módulos

## Componentes React

### `App` (side panel)

**Arquivo:** `src/sidepanel/App.tsx`
**Categoria:** componente
**Descrição:** Orquestra o painel: assina o `Port` com o service worker, mantém
modelo/agente selecionados, envia prompts e comandos, decide permissões e
renderiza onboarding, chat, cards e toasts.

### `Chat`

**Arquivo:** `src/sidepanel/Chat.tsx`
**Descrição:** Lista de mensagens com Markdown, raciocínio colapsável,
indicador de streaming e sugestões iniciais. No modo agrupado (padrão), as
tools de cada execução viram uma linha com contagem/erros e abrem o
`ToolsModal`; a ferramenta em execução e as perguntas (`question`) continuam
inline. Em `hidden`, raciocínio e tools somem, as mensagens de cada execução
são agregadas em um único bloco e o indicador mostra a ação atual (ex.:
“trabalhando: lendo a página”); perguntas continuam visíveis.

### `ToolsModal`

**Arquivo:** `src/sidepanel/ToolsModal.tsx`
**Descrição:** Modal com a lista de tools de uma execução, filtro “somente
erros”, duração por chamada e detalhe expansível (parâmetros, resultado e
imagens). Fecha com ESC ou clique no fundo.

### `Composer`

**Arquivo:** `src/sidepanel/Composer.tsx`
**Descrição:** Caixa de texto com auto-resize, envio por Enter, botão Parar e
menu de comandos `/` filtrado por prefixo. O rodapé mostra apenas os tokens de
contexto usados + porcentagem (`input + cache.read` da última mensagem) e o custo
da sessão com 4 casas; sem dados, mostra a dica de teclado.

### `ModelPicker`

**Arquivo:** `src/sidepanel/ModelPicker.tsx`
**Descrição:** Selects agrupados por provedor, com variante quando o modelo tem
mais de uma.

### `SessionBar`

**Arquivo:** `src/sidepanel/SessionBar.tsx`
**Descrição:** Seleção de sessão, seletor de agente, botão de anexar aba atual,
nova conversa e excluir.

Contrato dos controles: `busy` é o estado da **sessão exibida** e não bloqueia
ações globais. "Nova conversa" fica desabilitado apenas durante a criação
(`creating`), com `aria-busy`; excluir, trocar de agente e anexar aba continuam
bloqueados durante a execução daquela sessão.

### `Onboarding`

**Arquivo:** `src/sidepanel/Onboarding.tsx`
**Descrição:** Passo a passo do `opencode pair`, campo do link, instruções do
plugin, status do relay e botão de reconexão.

### `ToolCard`

**Arquivo:** `src/sidepanel/ToolCard.tsx`
**Descrição:** Card de ferramenta. O modo vem de `toolDisplay`: `grouped`
(agrupa no modal), `rows` (linha compacta expansível, com a primeira linha do
erro visível) ou `full` (card completo com imagens, parâmetros e resultado).

### `PermissionCard`

**Arquivo:** `src/components/PermissionCard.tsx`
**Descrição:** Card exibido no modal do painel. Mostra host, detalhe,
screenshot, texto, domínios do plano e as decisões (uma vez / sessão / sempre /
negar).

### `Markdown`

**Arquivo:** `src/components/Markdown.tsx`
**Descrição:** Renderização de Markdown com GFM e links abrindo em nova aba.

### `icons`

**Arquivo:** `src/components/icons.tsx`
**Descrição:** Ícones SVG inline (logo, engrenagem, mais, enviar, parar, lixeira,
refresh, chevron, link, check, x, terminal, navegador).

### `App` (options)

**Arquivo:** `src/options/App.tsx`
**Descrição:** Conexão e pareamento, modelo/agente padrão, modo de permissão,
timeout, sites permitidos/bloqueados, som, notificação, lista de ferramentas e
notas de segurança.

## Módulos do background

### `service-worker`

**Arquivo:** `src/background/service-worker.ts`
**Descrição:** Estado global, roteamento de mensagens, cliente do OpenCode, SSE,
execução de ferramentas, permissões, gravação de GIF, badge, atalho e keepalive.

### `OpencodeClient`

**Arquivo:** `src/background/opencode/client.ts`
**Descrição:** Pareamento e chamadas REST (modelos, agentes, comandos, sessões,
prompt, interrupção, contexto, geração stateless) e assinatura do SSE.

| Método | Retorno |
|---|---|
| `OpencodeClient.parsePairLink(link)` | `{ baseUrl, code }` |
| `OpencodeClient.pair(link)` | `{ baseUrl, token }` |
| `listModels()` / `defaultModel()` | catálogo |
| `listAgents()` / `listCommands()` | agentes e comandos |
| `listSessions()` / `createSession()` / `deleteSession()` | sessões |
| `switchModel()` / `switchAgent()` | troca em sessão |
| `context()` / `prompt()` / `runCommand()` / `interrupt()` | conversa |
| `generate(prompt, model?)` | texto stateless |
| `subscribe(onEvent, signal)` | stream SSE |

### `parseSse`

**Arquivo:** `src/background/opencode/sse.ts`
**Descrição:** Parser incremental de frames `data: {json}\n\n`.

### `RelayClient`

**Arquivo:** `src/background/relay.ts`
**Descrição:** Descobre a porta do plugin por `GET /health` (8799–8802), conecta
o WebSocket, envia `hello` (só então recebe `ready`), mantém `pong` a cada 20 s,
reconecta com backoff e entrega `tool_request`/`cancel`.

### `Cdp`

**Arquivo:** `src/background/cdp.ts`
**Descrição:** Anexa o depurador (`1.3`), envia comandos CDP, captura
screenshots, despacha mouse/tecla/texto e mantém buffers de console e rede por
aba (limpos ao trocar de domínio). Habilita `Emulation.setFocusEmulationEnabled`
antes do primeiro input (e reaplica após navegação) para agir em aba de segundo
plano; no screenshot, expande grupo colapsado e cai para `fromSurface: false`.

### `focus`

**Arquivo:** `src/background/focus.ts`
**Descrição:** Política de foco. `shouldBringTabsToFront()` lê
`opencode.config.bringTabsToFront` (padrão `false`) e `activateTab(tabId, reason)`
é o único ponto que chama `chrome.tabs.update({ active: true })`.

### `TabGroups`

**Arquivo:** `src/background/tabGroups.ts`
**Descrição:** Cria/recupera o grupo da sessão, resolve a aba alvo, cria/anexa/
fecha abas, devolve o id do grupo e limpa grupos órfãos na inicialização. Cria e
reaproveita abas em segundo plano, recusa anexar aba de outra janela e não fecha a
aba ativa no `cleanup()`.

### `Permissions`

**Arquivo:** `src/background/permissions.ts`
**Descrição:** Avalia modo, allowlist persistente, allowlist da sessão e lista de
bloqueio; abre modal no painel e, sem UI, avisa por som + notificação que abre o painel no clique;
aplica timeout; registra decisões.

### `Recording`

**Arquivo:** `src/background/recording.ts`
**Descrição:** Fila de quadros (screenshot + rótulo) para o `gif_creator`, com
limite de 30 e `flush` para não perder quadros em corrida.

### `ToolRegistry`

**Arquivo:** `src/background/tools/registry.ts`
**Descrição:** Mapeia nomes para handlers, normaliza prefixo `browser_` e executa
`browser_batch` em sequência. O relay pode expor `tabs_close_tab` e enviar
`tabs_close` (campo `wire`).

### `tools/a11y`

**Arquivo:** `src/background/tools/a11y.ts`
**Descrição:** Ponte com o content script: verifica/injeta o script, executa
funções por frame, prefixa refs de iframes e agrega árvores/textos.

### Módulos de ferramentas

| Arquivo | Ferramentas |
|---|---|
| `tools/tabs.ts` | `tabs_context`, `tabs_create`, `tabs_attach`, `tabs_close`, `navigate`, `resize_window` |
| `tools/page.ts` | `read_page`, `find`, `get_page_text`, `form_input` |
| `tools/computer.ts` | `computer`, `javascript_tool`, `read_console_messages`, `read_network_requests` |
| `tools/upload.ts` | `upload_image` |
| `tools/gif.ts` | `gif_creator` |
| `tools/plan.ts` | `update_plan` |

## Content scripts

### `a11y`

**Arquivo:** `src/content/a11y.ts`
**Descrição:** Instala `window.__opencodeA11y` com geração de árvore, refs
estáveis, redação de campos sensíveis, resolução/preenchimento, ações de DOM e
upload de arquivos.

### `indicator`

**Arquivo:** `src/content/indicator.ts`
**Descrição:** Moldura, status, cursor fantasma e botão Parar em shadow DOM.

## Offscreen

### `offscreen`

**Arquivo:** `src/offscreen.ts`
**Descrição:** Keepalive do service worker (20 s), beep de notificação (Web
Audio) e encoder de GIF (`gifenc`) com redimensionamento e rótulo por quadro.

## Compartilhado

| Arquivo | Conteúdo |
|---|---|
| `src/shared/types.ts` | Tipos de configuração, modelos, sessões, chat e permissões |
| `src/shared/protocol.ts` | Protocolo do relay, mensagens de UI e constantes de porta |
| `src/shared/storage.ts` | Leitura/escrita de configuração e listas de sites |
