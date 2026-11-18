# Types and models

Shared types live in `src/shared/types.ts` and `src/shared/protocol.ts`.

## Configuration

### `OpencodeConfig`

**File:** `src/shared/types.ts`
**Description:** Configuration persisted in `chrome.storage.local` after
pairing.

| Field | Type | Required | Description |
|---|---|---|---|
| `baseUrl` | string | Yes | Origin of the local server (e.g. `http://127.0.0.1:49374`) |
| `token` | string | Yes | Session token obtained during pairing |
| `directory` | string | No | Directory sent as `location`/`?directory=` |
| `defaultModel` | ModelRef | No | Model used when creating sessions |
| `defaultAgent` | string | No | Default agent (`build`, `ask`, `plan`…) |
| `permissionMode` | `ask` \| `allow` \| `deny` | Yes | Permission mode |
| `permissionTimeoutMs` | number | No | Prompt timeout (default 60,000) |
| `findMode` | `heuristic` \| `model` | No | `find` ranking |
| `soundEnabled` | boolean | No | Notification sound (default true) |
| `notifyEnabled` | boolean | No | System notification (default true) |
| `toolDisplay` | `grouped` \| `rows` \| `full` \| `hidden` | No | Tool display in the chat (default `grouped`; `hidden` hides tools and reasoning) |
| `browserAgentDefault` | boolean | No | New sessions use `opencode-browser` (default true) |
| `bringTabsToFront` | boolean | No | Agent actions may activate tabs/windows (default false) |
| `followTabGroups` | boolean | No | Panel follows the focused tab group (default true) |
| `autoGroupNewSessions` | boolean | No | Creates a group + tab when starting a conversation (default false) |

## Models and sessions

### `ModelInfo` / `ModelRef`

| Field | Type | Description |
|---|---|---|
| `id` | string | Model ID at the provider |
| `providerID` | string | Provider (`opencode-go`, `opencode`…) |
| `variant` | string | Variant (`low`, `high`, `max`…) — only in `ModelRef` |
| `name` | string | Display name |
| `capabilities` | `{ tools?, input?, output?, temperature? }` | Declared capabilities |
| `limit` | `{ context?, output? }` | Token limits |
| `variants` | `Array<{ id }>` | Available variants |
| `disabled` | boolean | Removed from selection when true |

### `SessionInfo`

| Field | Type | Description |
|---|---|---|
| `id` | string | Session ID (`ses_…`) |
| `title` / `slug` | string | Generated title or nickname |
| `model` | ModelRef | Current model |
| `agent` | string | Current agent |
| `time` | `{ created?, updated? }` | Timestamps |
| `location` | `{ directory? }` | Session directory |
| `cost` | number | Accumulated cost reported by OpenCode |
| `tokens` | TokenUsage | Session usage (accumulated) |

### `TokenUsage`

| Field | Type | Description |
|---|---|---|
| `input` / `output` / `reasoning` / `total` | number | Request tokens |
| `cacheRead` / `cacheWrite` | number | Cache read/written (flattened) |
| `cache` | `{ read?, write? }` | Raw API format |
| `cost` | number | Message cost |

### `AgentInfo` / `CommandInfo`

| Field | Type | Description |
|---|---|---|
| `id` / `name` | string | Agent identifier and name |
| `description` | string | Description |
| `mode` | string | `primary` or `subagent` |
| `hidden` | boolean | Hidden from the listing |
| `name` (command) | string | Name without the slash (`commit`, `review`…) |

## Chat

### `ChatMessage`

Union discriminated by `kind`:

| Variant | Fields |
|---|---|
| `user` | `id`, `text`, `time` |
| `assistant` | `id`, `text`, `reasoning`, `tools: ToolCallView[]`, `time`, `streaming`, `error?` |

### `ToolCallView`

| Field | Type | Description |
|---|---|---|
| `id` | string | Call ID |
| `name` | string | Tool name |
| `input` | unknown | Arguments |
| `status` | `running` \| `ok` \| `error` | State |
| `output` | string | Result text |
| `images` | ImagePayload[] | Screenshots/GIF |
| `metadata` | Record | Metadata (e.g. `rankedByModel`) |

### `ImagePayload`

| Field | Type | Description |
|---|---|---|
| `name` | string | File name |
| `mime` | string | `image/png` or `image/gif` |
| `data` | string | Bytes in base64 |

## Permissions

### `PermissionRequest`

| Field | Type | Description |
|---|---|---|
| `id` | string | Request UUID |
| `kind` | `action` \| `plan` \| `domain` | Card type |
| `tool` | string | Tool that requested it |
| `title` | string | Displayed title |
| `detail` | string | Context (tab title, command…) |
| `url` / `host` | string | Target URL and host |
| `screenshot` | string | Preview in base64 |
| `text` | string | Text that will be typed |
| `plan` | `{ domains, approach }` | Plan data |
| `fromDomain` / `toDomain` | string | Domain transition |

### `PermissionDecision`

| Field | Type | Description |
|---|---|---|
| `allowed` | boolean | Decision |
| `scope` | `once` \| `site` \| `always` | Scope |

## Application state

### `AppSnapshot`

Sent from the service worker to the pages.

| Field | Type | Description |
|---|---|---|
| `config` | OpencodeConfig \| null | Current configuration |
| `models` | ModelInfo[] | Catalog |
| `sessions` | SessionInfo[] | Sessions ordered by update |
| `activeSessionID` | string \| null | Selected session |
| `messages` | ChatMessage[] | Current conversation |
| `forms` | FormInfo[] | Pending forms of the current conversation |
| `sessionMeta` | SessionMeta[] | `busy`/`unread` for live sessions |
| `relay` | RelayState | Plugin state |
| `busy` | boolean | Agent working |
| `backend` | `unknown` \| `online` \| `offline` | API state |
| `defaultModel` | ModelRef \| null | Server default model |
| `agents` | AgentInfo[] | Available agents |
| `commands` | CommandInfo[] | `/` commands |
| `statusMessage` | string \| null | Warning (e.g. retry) |
| `contextUsage` | TokenUsage | Usage of the last message (footer context) |

### `SessionMeta`

| Field | Type | Description |
|---|---|---|
| `sessionID` | string | Session |
| `busy` | boolean | Execution in progress |
| `unread` | boolean | Finished/generated a form while it was not the displayed one |

### `RelayState`

| Field | Type | Description |
|---|---|---|
| `connected` | boolean | Active WebSocket |
| `url` | string | Chosen URL (`ws://127.0.0.1:<port>`) |
| `lastError` | string | Last error |

## Relay protocol

`src/shared/protocol.ts` defines `RelayInbound` (plugin → extension),
`RelayOutbound` (extension → plugin), `UiRequest`/`UiResponse` (pages → service
worker) and `UiEvent` (service worker → pages). Details in
[events.md](events.md).
