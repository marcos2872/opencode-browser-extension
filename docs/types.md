# Tipos e modelos

Tipos compartilhados ficam em `src/shared/types.ts` e
`src/shared/protocol.ts`.

## Configuração

### `OpencodeConfig`

**Arquivo:** `src/shared/types.ts`
**Descrição:** Configuração persistida em `chrome.storage.local` após o
pareamento.

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `baseUrl` | string | Sim | Origem do servidor local (ex.: `http://127.0.0.1:49374`) |
| `token` | string | Sim | Token de sessão obtido no pareamento |
| `directory` | string | Não | Diretório enviado como `location`/`?directory=` |
| `defaultModel` | ModelRef | Não | Modelo usado ao criar sessões |
| `defaultAgent` | string | Não | Agente padrão (`build`, `ask`, `plan`…) |
| `permissionMode` | `ask` \| `allow` \| `deny` | Sim | Modo de permissão |
| `permissionTimeoutMs` | number | Não | Timeout do prompt (padrão 60 000) |
| `findMode` | `heuristic` \| `model` | Não | Ranking do `find` |
| `soundEnabled` | boolean | Não | Aviso sonoro (padrão true) |
| `notifyEnabled` | boolean | Não | Notificação do sistema (padrão true) |
| `toolDisplay` | `grouped` \| `rows` \| `full` | Não | Exibição das tools no chat (padrão `grouped`) |
| `browserAgentDefault` | boolean | Não | Novas sessões usam `opencode-browser` (padrão true) |

## Modelos e sessões

### `ModelInfo` / `ModelRef`

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | string | ID do modelo no provedor |
| `providerID` | string | Provedor (`opencode-go`, `opencode`…) |
| `variant` | string | Variante (`low`, `high`, `max`…) — só em `ModelRef` |
| `name` | string | Nome de exibição |
| `capabilities` | `{ tools?, input?, output?, temperature? }` | Capacidades declaradas |
| `limit` | `{ context?, output? }` | Limites de tokens |
| `variants` | `Array<{ id }>` | Variantes disponíveis |
| `disabled` | boolean | Removido da seleção quando true |

### `SessionInfo`

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | string | ID da sessão (`ses_…`) |
| `title` / `slug` | string | Título gerado ou apelido |
| `model` | ModelRef | Modelo atual |
| `agent` | string | Agente atual |
| `time` | `{ created?, updated? }` | Timestamps |
| `location` | `{ directory? }` | Diretório da sessão |

### `AgentInfo` / `CommandInfo`

| Campo | Tipo | Descrição |
|---|---|---|
| `id` / `name` | string | Identificador e nome do agente |
| `description` | string | Descrição |
| `mode` | string | `primary` ou `subagent` |
| `hidden` | boolean | Oculto na listagem |
| `name` (comando) | string | Nome sem a barra (`commit`, `review`…) |

## Chat

### `ChatMessage`

União discriminada por `kind`:

| Variante | Campos |
|---|---|
| `user` | `id`, `text`, `time` |
| `assistant` | `id`, `text`, `reasoning`, `tools: ToolCallView[]`, `time`, `streaming`, `error?` |

### `ToolCallView`

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | string | ID da chamada |
| `name` | string | Nome da ferramenta |
| `input` | unknown | Argumentos |
| `status` | `running` \| `ok` \| `error` | Estado |
| `output` | string | Texto do resultado |
| `images` | ImagePayload[] | Screenshots/GIF |
| `metadata` | Record | Metadados (ex.: `rankedByModel`) |

### `ImagePayload`

| Campo | Tipo | Descrição |
|---|---|---|
| `name` | string | Nome do arquivo |
| `mime` | string | `image/png` ou `image/gif` |
| `data` | string | Bytes em base64 |

## Permissões

### `PermissionRequest`

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | string | UUID do pedido |
| `kind` | `action` \| `plan` \| `domain` | Tipo de card |
| `tool` | string | Ferramenta que pediu |
| `title` | string | Título exibido |
| `detail` | string | Contexto (título da aba, comando…) |
| `url` / `host` | string | URL e host alvo |
| `screenshot` | string | Prévia em base64 |
| `text` | string | Texto que será digitado |
| `plan` | `{ domains, approach }` | Dados do plano |
| `fromDomain` / `toDomain` | string | Transição de domínio |

### `PermissionDecision`

| Campo | Tipo | Descrição |
|---|---|---|
| `allowed` | boolean | Decisão |
| `scope` | `once` \| `site` \| `always` | Abrangência |

## Estado da aplicação

### `AppSnapshot`

Enviado do service worker para as páginas.

| Campo | Tipo | Descrição |
|---|---|---|
| `config` | OpencodeConfig \| null | Configuração atual |
| `models` | ModelInfo[] | Catálogo |
| `sessions` | SessionInfo[] | Sessões ordenadas por atualização |
| `activeSessionID` | string \| null | Sessão selecionada |
| `messages` | ChatMessage[] | Conversa atual |
| `relay` | RelayState | Estado do plugin |
| `busy` | boolean | Agente trabalhando |
| `backend` | `unknown` \| `online` \| `offline` | Estado da API |
| `defaultModel` | ModelRef \| null | Modelo padrão do servidor |
| `agents` | AgentInfo[] | Agentes disponíveis |
| `commands` | CommandInfo[] | Comandos `/` |
| `statusMessage` | string \| null | Aviso (ex.: retry) |

### `RelayState`

| Campo | Tipo | Descrição |
|---|---|---|
| `connected` | boolean | WebSocket ativo |
| `url` | string | URL escolhida (`ws://127.0.0.1:<porta>`) |
| `lastError` | string | Último erro |

## Protocolo do relay

`src/shared/protocol.ts` define `RelayInbound` (plugin → extensão),
`RelayOutbound` (extensão → plugin), `UiRequest`/`UiResponse` (páginas → service
worker) e `UiEvent` (service worker → páginas). Detalhes em
[events.md](events.md).
