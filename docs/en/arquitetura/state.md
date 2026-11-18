# State and storage

## In-memory state (service worker)

| Name | Type | Initial | Updated by | Description |
|---|---|---|---|---|
| `config` | OpencodeConfig \| null | null | pairing, `settings:update`, `unpair` | Active configuration |
| `client` | OpencodeClient \| null | null | pairing, server switch | API client |
| `models` | ModelInfo[] | [] | `refreshModels` | Model catalog |
| `sessions` | SessionInfo[] | [] | `refreshSessions`, SSE events | Known sessions |
| `activeSessionID` | string \| null | null | `session:new/select/delete`, group focus | Session shown in the panel |
| `sessionStates` | `SessionStates` | ∅ | SSE, send, hydration, selection | Per-session cache (`messages`, `forms`, `busy`, `statusMessage`, `contextUsage`, `unread`); limit of 4, preserving the displayed and the busy ones |
| `backend` | unknown \| online \| offline | unknown | SSE and calls | API state |
| `defaultModel` | ModelRef \| null | null | `refreshModels` | Server default model |
| `agents` | AgentInfo[] | [] | `refreshAgents` | Primary agents |
| `commands` | CommandInfo[] | [] | `refreshCommands` | `/` commands |
| `relayState` | RelayState | disconnected | RelayClient | Plugin state |
| `ports` | Set<Port> | ∅ | connected pages | Who receives broadcasts |
| `toolAborts` | `Map<string, { sessionID, controller }>` | ∅ | execution/stop | Per-call cancellation, with the owning session |
| `toolNames` | Map<string, string> | ∅ | SSE (`tool.input.started`) | Name per call id |
| `toolImages` | Map<string, ImagePayload[]> | ∅ | tool execution | Images per call |
| `sseAbort` | AbortController \| null | null | `startSse` | Stream cancellation |
| `followTimer` / `followTabID` | timer / number \| null | null | `tabs.onActivated`, `windows.onFocusChanged` | Debounce for following the focused group |

The state of each session lives in `sessionStates`
(`src/background/sessionState.ts`): `snapshot()` builds the displayed
conversation from it and `sessions:meta` publishes only `busy`/`unread` for the
others. The cache is read-only: OpenCode remains the source of truth for history
and the service worker rehydrates on wake.


## Extension storage

### `chrome.storage.local`

| Key | Type | Written by | Description |
|---|---|---|---|
| `opencode.config` | OpencodeConfig | pairing, options | Server, token and preferences |
| `permissions.allow` | string[] | "always" decision, options | Hosts always allowed |
| `permissions.deny` | string[] | options | Hosts always blocked |
| `ui.activeSession` | string | service worker | Last opened session |

### `chrome.storage.session`

| Key | Type | Written by | Description |
|---|---|---|---|
| `tabGroups` | `{ sessionID, groupId, mainTabId }[]` | TabGroups | Session → group link (at most one group per session) |
| `permission.request.<id>` | PermissionRequest | Permissions | Open request (shown in the panel modal) |

### In content script memory

| Name | Type | Description |
|---|---|---|
| `elementToRef` | WeakMap<Element, string> | Stable ref per element |
| `refToElement` | Map<string, Element> | Reverse map, used in actions |
| `counter` | number | `ref_N` generator |

### In plugin memory

| Name | Where | Description |
|---|---|---|
| `active` | server owner instance | Extension socket |
| `pending` | server owner instance | Calls waiting for `tool_result` |
| `server` | server owner instance | Bun server |
| `serverVersion` | server owner instance | Version used to force a rebind |
| `port` | server owner instance | Chosen port |
| `token` | server owner instance | Token written to the private file |
| `remotePort` | client process | Port of a relay from another process |
| `starting` | any instance | Promise that serializes server startup |
| `waiters` | any instance | Calls waiting for the extension to reconnect |
| `instances` | server owner instance | Counter of loaded instances |

State is shared between instances through a private file with token and port
(`$XDG_RUNTIME_DIR/opencode-browser/relay.json` or
`~/.cache/opencode-browser/relay.json`), plus the HTTP fallback described in
[plugin.md](plugin.md).
