# Events and messages

## OpenCode SSE events

Subscribed at `GET /api/event` and translated into chat state. There is a single
stream carrying all sessions; each event is written to the state of the session
that produced it. Only the displayed session generates a full `snapshot` — the
others update `busy`/`unread` through `sessions:meta`.

| Event                         | Data used                                                            | Effect in the extension                                     |
| ----------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------- |
| `server.connected`            | —                                                                    | Marks the backend as online                                 |
| `session.created`             | `sessionID`, `title`, `slug`, `model`                                | Adds the session to the list                                |
| `session.renamed`             | `sessionID`, `title`                                                 | Updates the title                                           |
| `session.step.started`        | `sessionID`                                                          | `busy = true`, clears the warning                           |
| `session.execution.started`   | `sessionID`                                                          | `busy = true`                                               |
| `session.text.started`        | `assistantMessageID`                                                 | Creates the assistant message                               |
| `session.text.delta`          | `delta`                                                              | Appends text (streaming)                                    |
| `session.text.ended`          | `text`                                                               | Consolidates the final text and ends message streaming      |
| `message.updated`             | `info.id`, `info.sessionID`, `info.role`, `info.tokens`, `info.cost` | Updates tokens and cost of the assistant response           |
| `session.usage.updated`       | `messageID?`, `usage` or `tokens`/`cost`                             | Updates the usage published during execution                |
| `session.reasoning.delta`     | `delta`                                                              | Appends reasoning                                           |
| `session.reasoning.ended`     | `text`                                                               | Consolidates the reasoning                                  |
| `session.tool.input.started`  | `id`, `name`                                                         | Records the call name                                       |
| `session.tool.called`         | `id`, `input`                                                        | Creates the tool card                                       |
| `session.tool.progress`       | `id`, `metadata`                                                     | Updates card metadata                                       |
| `session.tool.success`        | `id`, `content`, `metadata`                                          | Card as `ok` with the result                                |
| `session.tool.failed`         | `id`, `error`                                                        | Card as `error`                                             |
| `session.step.ended`          | `finish`                                                             | Ends step streaming; `busy` only drops outside `tool-calls` |
| `session.execution.succeeded` | —                                                                    | `busy = false`; sound/notification if the panel is closed   |
| `session.execution.failed`    | `error` or `message`                                                 | Ends execution and shows the error in the response          |
| `session.retry.scheduled`     | `attempt`, `message`                                                 | Shows a "retrying" warning                                  |
| `session.status`              | `status.type`                                                        | `idle` ends the busy state                                  |
| `session.error`               | `error`                                                              | Ends execution and shows the error in the response          |

Other events (`session.inbox.*`, `session.instructions.updated`,
`project.updated`, etc.) are ignored.

## Relay protocol (extension ↔ plugin)

Implementation details in [plugin.md](../arquitetura/plugin.md).

| Direction         | Message        | Fields                                                   |
| ----------------- | -------------- | -------------------------------------------------------- |
| extension → plugin | `hello`        | `v`, `extensionId`, `secret?`                            |
| extension → plugin | `tool_result`  | `id`, `ok`, `content?`, `images?`, `error?`, `metadata?` |
| extension → plugin | `progress`     | `id`, `phase`, `detail?`                                 |
| extension → plugin | `pong`         | —                                                        |
| extension → plugin | `ensure_agent` | `id`                                                     |
| plugin → extension | `ready`        | `v`, `home`, `workspace` (only after `hello`)            |
| plugin → extension | `tool_request` | `id`, `tool`, `args`, `sessionID?`                       |
| plugin → extension | `cancel`       | `id`                                                     |
| plugin → extension | `ping`         | —                                                        |
| plugin → extension | `ensure_agent_result` | `id`, `ok`, `path?`, `error?`                     |

## Internal messages (pages ↔ service worker)

Sent with `chrome.runtime.sendMessage` (pages → SW) and through a `Port` named
`opencode-browser-ui` (SW → pages).

### Requests (`UiRequest`)

| Message               | Fields                  | Description                            |
| --------------------- | ----------------------- | -------------------------------------- |
| `state:get`           | —                       | Returns the full snapshot              |
| `pair`                | `link`                  | Consumes the link and saves the configuration |
| `unpair`              | —                       | Removes the token and resets the state |
| `models:refresh`      | —                       | Reloads the catalog                    |
| `sessions:list`       | —                       | Reloads the sessions                   |
| `session:new`         | `model?`, `agent?`, `windowId?` | Creates a session; `windowId` defines where the automatic group is born |
| `session:select`      | `id`                    | Selects and hydrates                   |
| `session:delete`      | `id`                    | Removes the session                    |
| `session:model`       | `model`, `sessionID?`   | Changes the session model              |
| `session:agent`       | `agent`, `sessionID?`   | Changes the session agent              |
| `tabs:attach-current` | `sessionID?`            | Attaches the active tab to the group (refuses a tab from another window) |
| `tabs:list`           | `sessionID`             | Lists tabs in the session context      |
| `tabs:detach`         | `sessionID`, `tabID`    | Removes the tab from the context without closing it |
| `prompt`              | `text`, `sessionID?`    | Sends a message                        |
| `command`             | `name`, `text`, `sessionID?` | Runs a `/` command                |
| `interrupt`           | `sessionID?`            | Interrupts the session execution       |
| `settings:update`     | `patch`                 | Updates the configuration              |
| `open:options`        | —                       | Opens the settings                     |
| `open:sidepanel`      | —                       | Reserved                               |
| `permission:respond`  | `requestId`, `decision` | Answers a request                      |
| `relay:reconnect`     | —                       | Reconnects to the plugin               |

### Events (`UiEvent`)

| Message               | Fields      | Description                         |
| --------------------- | ----------- | ----------------------------------- |
| `snapshot`            | `snapshot`  | Full state (60 ms throttle)         |
| `sessions:meta`       | `items`     | `busy`/`unread` for each live session |
| `relay`               | `relay`     | Plugin state                        |
| `permission`          | `request`   | New permission request              |
| `permission:sync`     | `requests`  | Authoritative list on (re)connect   |
| `permission:resolved` | `requestId` | Request answered/expired            |
| `event`               | `event`     | Reserved (not used today)           |

### Direct messages from the service worker

| Message              | Target         | Description                                          |
| -------------------- | -------------- | ---------------------------------------------------- |
| `SW_KEEPALIVE`       | service worker | Offscreen keeps the worker awake                     |
| `browser:stop`       | service worker | Stop button on the page (session resolved by the tab's group) |
| `permission:respond` | service worker | Answer from the panel modal                          |
| `PLAY_NOTIFICATION`  | offscreen      | Plays the notification sound                         |
| `ENCODE_GIF`         | offscreen      | Encodes frames; responds `{ data }` or `{ error }`   |

## Content script

| Message            | Direction   | Fields         | Effect                                 |
| ------------------ | ----------- | -------------- | -------------------------------------- |
| `indicator:show`   | SW → page   | —              | Lights the animated border and the Stop button (fade-in) |
| `indicator:hide`   | SW → page   | —              | Fades out and removes the indicator    |
| `indicator:status` | SW → page   | `text`, `busy` | Updates label and animation            |
| `indicator:cursor` | SW → page   | `x`, `y`       | Moves the virtual mouse (builds the overlay if needed) |
| `indicator:click`  | SW → page   | `x`, `y`       | Mouse sinks and releases a ripple at the point |
| `indicator:prefers-reduced-motion` | page → SW | `value` | Reports whether the tab prefers less motion; the click does not wait for the travel |
| `browser:stop`     | page → SW   | —              | Aborts executions and interrupts the session |

## Alarms

| Alarm       | Period | Action                                                                   |
| ----------- | ------ | ------------------------------------------------------------------------ |
| `keepalive` | 30 s   | Ensures the offscreen document, reconnects the relay and reopens SSE if offline |
