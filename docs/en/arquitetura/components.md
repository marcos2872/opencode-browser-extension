# Components and modules

## React components

### `App` (side panel)

**File:** `src/sidepanel/App.tsx`
**Category:** component
**Description:** Orchestrates the panel: subscribes to the `Port` with the
service worker, keeps the selected model/agent, sends prompts and commands,
decides permissions and renders onboarding, chat, cards and toasts.

### `Chat`

**File:** `src/sidepanel/Chat.tsx`
**Description:** Message list with Markdown, collapsible reasoning, streaming
indicator and starter suggestions. In grouped mode (default), the tools of each
run become a single row with count/errors and open the `ToolsModal`; the running
tool and the questions (`question`) stay inline. In `hidden`, reasoning and
tools disappear, the messages of each run are aggregated into a single block and
the indicator shows the current action (e.g. "working: reading the page");
questions remain visible.

### `ToolsModal`

**File:** `src/sidepanel/ToolsModal.tsx`
**Description:** Modal with the tool list of one run, an "errors only" filter,
duration per call and an expandable detail (parameters, result and images).
Closes with ESC or a click on the backdrop.

### `Composer`

**File:** `src/sidepanel/Composer.tsx`
**Description:** Text box with auto-resize, send on Enter, Stop button and a `/`
command menu filtered by prefix. The footer shows only the context tokens used
+ percentage (`input + cache.read` of the last message) and the session cost
with 4 decimals; without data, it shows the keyboard hint.

### `ModelPicker`

**File:** `src/sidepanel/ModelPicker.tsx`
**Description:** Selects grouped by provider, with a variant when the model has
more than one.

### `SessionBar`

**File:** `src/sidepanel/SessionBar.tsx`
**Description:** Session selection, agent selector, attach current tab button,
new conversation and delete.

Control contract: `busy` is the state of the **displayed session** and does not
block global actions. "New conversation" is disabled only during creation
(`creating`), with `aria-busy`; delete, change agent and attach tab remain
blocked while that session is running.

### `Onboarding`

**File:** `src/sidepanel/Onboarding.tsx`
**Description:** Step-by-step for `opencode pair`, link field, plugin
instructions, relay status and reconnect button.

### `ToolCard`

**File:** `src/sidepanel/ToolCard.tsx`
**Description:** Tool card. The mode comes from `toolDisplay`: `grouped`
(groups into the modal), `rows` (compact expandable row, with the first line of
the error visible) or `full` (full card with images, parameters and result).

### `PermissionCard`

**File:** `src/components/PermissionCard.tsx`
**Description:** Card shown in the panel modal. Shows host, detail, screenshot,
text, plan domains and the decisions (once / session / always / deny).

### `Markdown`

**File:** `src/components/Markdown.tsx`
**Description:** Markdown rendering with GFM and links opening in a new tab.

### `icons`

**File:** `src/components/icons.tsx`
**Description:** Inline SVG icons (logo, gear, plus, send, stop, trash, refresh,
chevron, link, check, x, terminal, browser).

### `App` (options)

**File:** `src/options/App.tsx`
**Description:** Connection and pairing, default model/agent, permission mode,
timeout, allowed/blocked sites, sound, notification, tool list and security
notes.

## Background modules

### `service-worker`

**File:** `src/background/service-worker.ts`
**Description:** Global state, message routing, OpenCode client, SSE, tool
execution, permissions, GIF recording, badge, shortcut and keepalive.

### `OpencodeClient`

**File:** `src/background/opencode/client.ts`
**Description:** Pairing and REST calls (models, agents, commands, sessions,
prompt, interrupt, context, stateless generation) and SSE subscription.

| Method | Returns |
|---|---|
| `OpencodeClient.parsePairLink(link)` | `{ baseUrl, code }` |
| `OpencodeClient.pair(link)` | `{ baseUrl, token }` |
| `listModels()` / `defaultModel()` | catalog |
| `listAgents()` / `listCommands()` | agents and commands |
| `listSessions()` / `createSession()` / `deleteSession()` | sessions |
| `switchModel()` | in-session model switch |
| `context()` / `prompt()` / `runCommand()` / `interrupt()` | conversation |
| `generate(prompt, model?)` | stateless text |
| `subscribe(onEvent, signal)` | SSE stream |

### `parseSse`

**File:** `src/background/opencode/sse.ts`
**Description:** Incremental parser of `data: {json}\n\n` frames.

### `RelayClient`

**File:** `src/background/relay.ts`
**Description:** Discovers the plugin port via `GET /health` (8799–8802),
connects the WebSocket, sends `hello` (only then receives `ready`), keeps `pong`
every 20 s, reconnects with backoff and delivers `tool_request`/`cancel`.

### `Cdp`

**File:** `src/background/cdp.ts`
**Description:** Attaches the debugger (`1.3`), sends CDP commands, captures
screenshots, dispatches mouse/key/text and keeps console and network buffers per
tab (cleared when the domain changes). Enables
`Emulation.setFocusEmulationEnabled` before the first input (and reapplies it
after navigation) to act on a background tab; on screenshot, it expands a
collapsed group and falls back to `fromSurface: false`.

### `focus`

**File:** `src/background/focus.ts`
**Description:** Focus policy. `shouldBringTabsToFront()` reads
`opencode.config.bringTabsToFront` (default `false`) and `activateTab(tabId,
reason)` is the only place that calls `chrome.tabs.update({ active: true })`.

### `TabGroups`

**File:** `src/background/tabGroups.ts`
**Description:** Creates/recovers the session group, resolves the target tab,
creates/attaches/closes tabs, returns the group id and cleans orphan groups at
startup. Creates and reuses tabs in the background, refuses to attach a tab from
another window and does not close the active tab in `cleanup()`.

### `Permissions`

**File:** `src/background/permissions.ts`
**Description:** Evaluates mode, persistent allowlist, session allowlist and
blocklist; opens a modal in the panel and, without UI, signals with sound +
notification that opens the panel on click; applies the timeout; records
decisions.

### `Recording`

**File:** `src/background/recording.ts`
**Description:** Frame queue (screenshot + label) for `gif_creator`, with a
30-frame limit and a `flush` so frames are not lost in a race.

### `ToolRegistry`

**File:** `src/background/tools/registry.ts`
**Description:** Maps names to handlers, normalizes the `browser_` prefix and
runs `browser_batch` in sequence. The relay can expose `tabs_close_tab` and send
`tabs_close` (the `wire` field).

### `tools/a11y`

**File:** `src/background/tools/a11y.ts`
**Description:** Bridge to the content script: checks/injects the script, runs
functions per frame, prefixes iframe refs and aggregates trees/texts.

### Tool modules

| File | Tools |
|---|---|
| `tools/tabs.ts` | `tabs_context`, `tabs_create`, `tabs_attach`, `tabs_close`, `navigate`, `resize_window` |
| `tools/page.ts` | `read_page`, `find`, `get_page_text`, `form_input` |
| `tools/computer.ts` | `computer`, `javascript_tool`, `read_console_messages`, `read_network_requests` |
| `tools/upload.ts` | `upload_image` |
| `tools/gif.ts` | `gif_creator` |
| `tools/plan.ts` | `update_plan` |

## Content scripts

### `a11y`

**File:** `src/content/a11y.ts`
**Description:** Installs `window.__opencodeA11y` with tree generation, stable
refs, redaction of sensitive fields, resolution/filling, DOM actions and file
upload.

### `indicator`

**File:** `src/content/indicator.ts`
**Description:** Animated border, status, virtual mouse (with a click ripple) and
Stop button in shadow DOM. The lifecycle is controlled by
`src/background/presence.ts`.

## Offscreen

### `offscreen`

**File:** `src/offscreen.ts`
**Description:** Service worker keepalive (20 s), notification beep (Web Audio)
and GIF encoder (`gifenc`) with resizing and a label per frame.

## Shared

| File | Contents |
|---|---|
| `src/shared/types.ts` | Configuration, model, session, chat and permission types |
| `src/shared/protocol.ts` | Relay protocol, UI messages and port constants |
| `src/shared/storage.ts` | Reading/writing configuration, site lists and language (`ui.locale`) |
| `src/shared/i18n/` | Typed pt-BR/en catalogs (`pt-BR.ts`, `en.ts`), locale resolution and `t()` (`runtime.ts`), React hook (`react.ts`) |
