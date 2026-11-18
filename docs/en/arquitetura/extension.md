# How the extension works

Manifest V3 extension with four contexts: **service worker** (the brain),
**content script** (bridge to the page), **UI pages** (side panel, options and
permission) and **offscreen document** (keepalive, sound and GIF).

## Folder structure

```
src/
├── background/
│   ├── service-worker.ts        # orchestrator: state, messages, SSE, tools
│   ├── opencode/client.ts       # v2 API client (pair, models, sessions, prompt)
│   ├── opencode/sse.ts          # /api/event stream parser
│   ├── relay.ts                 # plugin WebSocket client (port discovery)
│   ├── cdp.ts                   # chrome.debugger + CDP (input, screenshot, console, network)
│   ├── tabGroups.ts             # per-session tab groups + orphan cleanup
│   ├── permissions.ts           # modes, allowlist, notification and timeout
│   ├── focus.ts                # focus policy (activateTab)
│   ├── recording.ts             # frame recording for GIF
│   └── tools/                   # tool implementations
│       ├── registry.ts          # dispatch + browser_batch
│       ├── a11y.ts              # bridge to the content script (frames and refs)
│       ├── tabs.ts              # tabs_context/create/attach/close, navigate, resize
│       ├── page.ts              # read_page, find, get_page_text, form_input
│       ├── computer.ts          # computer, javascript_tool, console, network
│       ├── upload.ts            # upload_image
│       ├── gif.ts               # gif_creator
│       └── plan.ts              # update_plan
├── content/
│   ├── a11y.ts                  # accessibility tree + DOM actions
│   ├── indicator.ts             # animated border, virtual mouse and Stop button
│   └── index.ts                 # installs both
├── sidepanel/                   # chat (App, Chat, Composer, ModelPicker, SessionBar...)
├── options/                     # settings
├── components/                  # Markdown, icons, permission card
├── shared/                      # types.ts, protocol.ts, storage.ts, i18n/
├── styles/app.css               # light/dark theme, layout and scrollbars
├── offscreen.ts                 # keepalive, beep and GIF encoder
└── types/gifenc.d.ts            # encoder types
```

## Service worker

Entry point: `src/background/service-worker.ts` (built to
`assets/background.js`, `type: module`).

### Startup

1. Loads the site allowlist/blocklist (`permissions.init`).
2. Removes orphan tab groups (`tabs.cleanup`).
3. Reads the saved configuration and, if it exists, creates the OpenCode client,
   loads models, agents, commands and sessions, selects the active session and
   opens the SSE stream.
4. Connects to the plugin relay (discovers the port via `GET /health`).
5. Ensures the offscreen document (20 s keepalive) and registers the 30 s
   alarm; sets the side panel to open on icon click.

### OpenCode client

`src/background/opencode/client.ts` talks to the v2 API using
`Authorization: Basic base64("opencode:<token>")` and sends `?directory=` when a
default directory is configured. Pairing consumes the single-use link and stores
`baseUrl` + `token` in `chrome.storage.local`.

### Streaming and connection state

SSE is subscribed at `GET /api/event` and the channel state is published in
`AppSnapshot.connection` (`unconfigured`, `connecting`, `online`, `offline`).
`online` is only published after the stream response opens (the `onOpen`
callback of `subscribe`); failures carry the cause (`unreachable`, `timeout`,
`unauthorized`, `server_error`, `stream_closed`), which the panel banner uses to
say what to do.

- Automatic reconnection with exponential backoff from 2 s to 30 s (60 s when
  the token is rejected) and without republishing a snapshot on every attempt.
- Upon returning to `online`, models, agents, commands and sessions are reloaded
  and the active session is rehydrated.
- The **Try again** button sends `connection:reconnect`: it recreates the client
  from the saved configuration, clears orphan runs and restarts the stream.
- HTTP requests have a 15 s timeout (the SSE stream is exempt). The 30 s alarm
  performs a lightweight check roughly every 60 s and ends executions stuck
  after 5 s of outage.

Events are translated into chat state (messages, reasoning, tools, retries and
errors) and published to the pages through a long-lived `Port`. Each session has
its own state (`src/background/sessionState.ts`): events from sessions that are
not in the panel keep being applied and only publish `busy`/`unread`
(`sessions:meta`). When the user switches tab groups, `tabs.onActivated`
resolves the owning session and the panel starts showing that conversation
without clearing the state of the others. The full list is in
[events.md](../referencia/events.md).

### Tool execution

The plugin sends `tool_request` over WebSocket. The service worker builds the
execution context (session, `AbortSignal`, permissions, tab groups, CDP) and
calls the tool registry. The result goes back as `tool_result`, with text and,
when present, base64 images. If GIF recording is active, a frame is captured
after each action.

The **Stop** button (injected into the page) sends `browser:stop`: it aborts
running executions and interrupts the session in OpenCode.

### Sessions and the conversations folder

The plugin announces its own folder in the handshake
(`~/.opencode-browser-extensions` by default). The extension uses it as the
`location` when creating sessions and filters the listing by it — only
conversations created there show up. If the user sets another path in the
options, it takes precedence. Sessions without a `location` remain visible
(defensive).

In the global OpenCode configuration (`~/.config/opencode/agents/`), the plugin
ensures the `opencode-browser` agent from the
`plugin/opencode-browser.agent.md` template. The file is updated by version
(`<!-- opencode-browser-agent vN -->`): an older version is replaced with a
`.bak-vN` backup; a file without the marker or already at the current version is
preserved. The current template is **v4** (security, extension environment,
tabs by origin and context economy). When the server lists that agent, new
sessions start using it (`browserAgentDefault`, on by default; turning it off in
the options goes back to using the chosen default agent). It restricts tools to
`browser_*` and `question` — the agent does not read files, run commands or
access machine data. Being global, it appears in every OpenCode project, not
only in extension conversations.

### Tab groups

Each OpenCode session can have a Chrome group titled `OpenCode`, with a main tab
and the other tabs used by the agent. Tools only see tabs in the group. The
group is born only through an explicit action — `browser_tabs_create`,
`browser_tabs_attach` or `browser_tabs_context` with `createIfEmpty`. The other
tools fail with guidance when the session has no tab yet, so that a child
session (subagent), which has its own `sessionID`, does not open an empty group
by accident. At startup, groups without a matching session are undone (real tabs
are ungrouped; blank tabs are closed, except the one the user is using).

None of this brings tabs to the front: creating the group, opening or attaching
tabs works in the background, and `computer` actions use focus emulation through
CDP (`Emulation.setFocusEmulationEnabled`) to type and click without activating
the tab. The only exception is `bringTabsToFront` enabled in the options, which
unlocks `background/focus.ts → activateTab()`.

`tabs_create` reuses the main tab when it is **blank** or on the **same origin**
(scheme + host + port); if the URL is from another origin, it opens a new tab.
So asking for Hugging Face and then TabNews keeps both open.

Attaching a tab from another window is refused: `chrome.tabs.group` would move
the tab into the group's window, taking what the user is using out of place.

### Permissions without stealing focus

With the panel open, the request is a modal inside the panel. With the panel
closed (used through the plugin/CLI) there is no extension surface on screen —
and `chrome.sidePanel.open()` requires a user gesture, so the service worker
cannot open the panel on its own. In that case the request is signaled by a
sound + system notification; clicking the notification (a gesture) opens the
side panel, which receives the pending request on connect and shows the modal
right away. If the user does not answer, the request expires denied by the
timeout. With `notifyEnabled` off there is no notification: the request stays
pending and only appears in the modal when the panel is opened.

### Offscreen

The offscreen document (`offscreen.html` + `assets/offscreen.js`) keeps the
service worker awake (a message every 20 s), plays the notification sound (Web
Audio, no audio file) and encodes GIFs with the `gifenc` encoder.

## Content script

Injected into every URL at `document_start`, in all frames.

### Accessibility tree

Exposes `window.__opencodeA11y` with:

| Function | Returns |
|---|---|
| `generate(options)` | Tree text with refs (`ref_1`, `ref_2`…), viewport, count and URL |
| `elements()` | List of elements with role, name, type, value and rectangle |
| `resolve(ref)` | Scrolls to the element and returns its center in frame coordinates |
| `setValue(ref, value)` | Fills input, textarea, select or contenteditable |
| `pageText(max)` | Main text (article/main/body) without HTML |
| `clickRef(ref)` | Click through DOM events (used in iframes and as a fallback) |
| `hoverRef(ref)` | `mouseover` + `mousemove` through the DOM |
| `scrollRef(ref)` | Scrolls to the element |
| `focusRef(ref)` | Focuses the element |
| `uploadFiles(ref, files)` | Injects files into `input[type=file]` or a drop zone |

Refs are stable per element (weak map + counter) and sensitive values
(passwords and card/authentication fields) are redacted in the description.

### Visual indicator

- Animated pastel blue border: a 3 px ring with a spinning conic gradient and a
  pulsing inner glow, with fade-in/out. Respects `prefers-reduced-motion` and
  pauses the animation when the tab is not visible.
- Virtual mouse: travels smoothly to the target (the first appearance is born at
  the destination), "sinks" and releases a ripple on click. It disappears a few
  seconds after the last mouse action; the border stays lit.
- Status label and a floating **Stop** button that sends `browser:stop`.
- Accepted messages: `indicator:show`, `indicator:hide`, `indicator:status`,
  `indicator:cursor`, `indicator:click`. The content script also reports
  `indicator:prefers-reduced-motion` on install (page → service worker).

Presence state lives in the service worker (`src/background/presence.ts`),
because the overlay disappears when the page navigates:

- The overlay does **not** disappear on every action. `hideIndicator` only
  schedules the exit (2.5 s idle; 20 s while the session is busy, to cover the
  model's "thinking"), and any new action cancels the schedule — no flicker.
- Click: the cursor travels (≈320 ms), the ripple fires and only then does CDP
  click. With `prefers-reduced-motion`, the travel is skipped and the click
  lands immediately.
- Navigation (`tabs.onUpdated` → `complete`) resends border and label.
- If a tool fails after showing presence, the border is hidden right away.
- It disappears immediately when **Stop** is clicked, on interrupt, or when the
  session goes idle (`hideSession`).
- As a safety net, the content script hides the overlay after 2 min without
  messages from the service worker (extension reloaded or worker terminated).

## UI pages

| Page | File | Role |
|---|---|---|
| Side panel | `sidepanel.html` → `src/sidepanel/App.tsx` | Chat, models, agents, `/` commands, sessions, tool and permission cards |
| Options | `options.html` → `src/options/App.tsx` | Connection, default model/agent, permissions, sites, sound/notification, tools |

The side panel talks to the service worker through a `Port`
(`opencode-browser-ui`) and reconnects by itself if the worker restarts. The
messages are in [events.md](../referencia/events.md).

## Main flows

### `/` commands

When you type `/` in the composer, the extension lists the commands returned by
`GET /api/command` and filters by prefix. On send, the text becomes
`POST /api/session/:id/command` with the command name and arguments.

### File upload

The agent sends bytes in base64; the content script builds a `DataTransfer` with
a `File` and injects it into the input (`input`/`change` events) or fires
`dragenter`/`dragover`/`drop` on the target area.

### GIF

`gif_creator` records up to 30 frames (one screenshot per action), with a queue
so frames are not lost in a race. On export, the offscreen document resizes to
up to 800 px, draws the action label and encodes with `gifenc`; the file is
saved to Downloads and returned as an image in the result.

### Iframes

`read_page`/`find`/`get_page_text` accept `frames: "all"`. Refs from subframes
get the `f<frameId>_ref_N` prefix. `form_input` works in any frame; `computer`
uses DOM events for click/hover/scroll/type on iframe refs.

## Known limitations

- Iframe refs have no coordinates in the main frame; actions use DOM events
  (untrusted) in those cases.
- `chrome.debugger` shows the debugging banner and does not attach with DevTools
  open — there is a fallback to DOM events on click/hover.
- Internal pages (`chrome://`, Web Store) and `about:blank` do not accept
  injection; navigate first, then read.
- The service worker is kept alive by the offscreen document; even so, on
  restarts SSE reconnects and the panel resyncs the state.
