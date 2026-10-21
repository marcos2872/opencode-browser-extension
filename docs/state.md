# Estado e armazenamento

## Estado em memória (service worker)

| Nome | Tipo | Inicial | Quem atualiza | Descrição |
|---|---|---|---|---|
| `config` | OpencodeConfig \| null | null | pareamento, `settings:update`, `unpair` | Configuração ativa |
| `client` | OpencodeClient \| null | null | pareamento, troca de servidor | Cliente da API |
| `models` | ModelInfo[] | [] | `refreshModels` | Catálogo de modelos |
| `sessions` | SessionInfo[] | [] | `refreshSessions`, eventos SSE | Sessões conhecidas |
| `activeSessionID` | string \| null | null | `session:new/select/delete` | Sessão aberta |
| `messages` | ChatMessage[] | [] | SSE, envio, hidratação | Conversa atual |
| `busy` | boolean | false | eventos SSE, envio, parada | Agente trabalhando |
| `backend` | unknown \| online \| offline | unknown | SSE e chamadas | Estado da API |
| `defaultModel` | ModelRef \| null | null | `refreshModels` | Modelo padrão do servidor |
| `agents` | AgentInfo[] | [] | `refreshAgents` | Agentes primários |
| `commands` | CommandInfo[] | [] | `refreshCommands` | Comandos `/` |
| `statusMessage` | string \| null | null | SSE (`session.retry.scheduled`) | Aviso no painel |
| `relayState` | RelayState | desconectado | RelayClient | Estado do plugin |
| `ports` | Set<Port> | ∅ | páginas conectadas | Quem recebe broadcasts |
| `toolAborts` | Map<string, AbortController> | ∅ | execução/parada | Cancelamento por chamada |
| `toolNames` | Map<string, string> | ∅ | SSE (`tool.input.started`) | Nome por id de chamada |
| `toolImages` | Map<string, ImagePayload[]> | ∅ | execução de tools | Imagens por chamada |
| `sseAbort` | AbortController \| null | null | `startSse` | Cancelamento do stream |
| `hydrateToken` | number | 0 | `selectSession` | Evita hidratação fora de ordem |

## Armazenamento da extensão

### `chrome.storage.local`

| Chave | Tipo | Quem grava | Descrição |
|---|---|---|---|
| `opencode.config` | OpencodeConfig | pareamento, options | Servidor, token e preferências |
| `permissions.allow` | string[] | decisão "sempre", options | Hosts sempre permitidos |
| `permissions.deny` | string[] | options | Hosts sempre bloqueados |
| `ui.activeSession` | string | service worker | Última sessão aberta |

### `chrome.storage.session`

| Chave | Tipo | Quem grava | Descrição |
|---|---|---|---|
| `tabGroups` | `{ sessionID, groupId, mainTabId }[]` | TabGroups | Mapa sessão → grupo do Chrome |
| `permission.request.<id>` | PermissionRequest | Permissions | Pedido aberto no popup |

### Em memória do content script

| Nome | Tipo | Descrição |
|---|---|---|
| `elementToRef` | WeakMap<Element, string> | Ref estável por elemento |
| `refToElement` | Map<string, Element> | Reverso, usado nas ações |
| `counter` | number | Gerador de `ref_N` |

### Em memória do plugin

| Nome | Onde | Descrição |
|---|---|---|
| `active` | instância dona do servidor | Socket da extensão |
| `pending` | instância dona do servidor | Chamadas aguardando `tool_result` |
| `server` | instância dona do servidor | Servidor Bun |
| `serverVersion` | instância dona do servidor | Versão para forçar rebind |
| `instances` | instância dona do servidor | Contador de instâncias carregadas |

O estado entre instâncias é compartilhado por um arquivo temporário com token e
porta (`/tmp/opencode-browser-relay.token`), além do fallback HTTP descrito em
[plugin.md](plugin.md).
