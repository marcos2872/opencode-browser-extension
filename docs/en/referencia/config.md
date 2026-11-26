# Settings

## User preferences

Persisted in `chrome.storage.local` (`opencode.config`) and editable in the panel
or on the options page.

| Variable | Description | Type | Default | Required | Where it is used |
|---|---|---|---|---|---|
| `baseUrl` | Origin of the local server | string | — | Yes | API client |
| `token` | Pairing token | string | — | Yes | Basic header |
| `directory` | Extension conversations folder (session location) | string | announced by the plugin (`~/.opencode-browser-extensions`) | No | `?directory=` and `session.create` |
| `defaultModel` | Default model | ModelRef | server default model | No | Session creation |
| `permissionMode` | Permission mode | `ask` \| `allow` \| `deny` | `allow` | Yes | Permissions |
| `permissionTimeoutMs` | Prompt timeout | number | `60000` | No | Permissions |
| `findMode` | `find` ranking | `heuristic` \| `model` | `heuristic` | No | `tools/page.ts` |
| `soundEnabled` | Notification sound | boolean | `true` | No | Offscreen |
| `notifyEnabled` | System notification | boolean | `true` | No | `chrome.notifications` |
| `toolDisplay` | How tools appear in the chat (`grouped`, `rows`, `full`, `hidden`) | string | `grouped` | No | `sidepanel/Chat` |
| `bringTabsToFront` | Lets agent actions activate tabs/windows (stealing focus) | boolean | `false` | No | `background/focus.ts` |
| `followTabGroups` | Shows the session of the focused tab group in the panel | boolean | `true` | No | `service-worker` |
| `autoGroupNewSessions` | Creates a tab group (with a background tab) when starting a conversation | boolean | `false` | No | `service-worker` |

The extension always uses the `opencode-browser` agent for new sessions.
Existing conversations are unchanged; the panel selector controls only the model.

### Permission modes

| Mode | Behavior |
|---|---|
| `ask` | Asks on the first action of each domain |
| `allow` | Runs without asking, respecting the blocklist (recommended) |
| `deny` | Blocks actions; only read-only tools run |

## Conversations folder

By default, the plugin announces and creates the
`~/.opencode-browser-extensions` folder (the equivalent on each system, see
[plugin.md](../arquitetura/plugin.md)). The extension uses that folder as the
sessions' `location` and filters the listing by it: only conversations created
there show up. The "Browser conversations folder" field in the options lets you
change the path; a user-defined value is not overwritten by the plugin
announcement.

## Site lists

| Key | Description |
|---|---|
| `permissions.allow` | Hosts always allowed (one line per host in the options) |
| `permissions.deny` | Hosts always blocked |

## Language

| Key | Description | Values | Default |
|---|---|---|---|
| `ui.locale` | Interface language (panel, settings, on-page indicator, notifications and manifest) | `auto` \| `pt-BR` \| `en` | `auto` |

`auto` follows the browser UI language (`chrome.i18n.getUILanguage()`): any
Portuguese variant (`pt`, `pt-BR`, `pt-PT`) resolves to pt-BR and everything
else to English. It lives outside `opencode.config` because the onboarding needs
to read and change the language before pairing. The text the **model** reads
(tool descriptions, tool results and the agent template) is fixed in English;
the agent answers in the language of the user's message.

## Plugin environment variables

| Variable | Description | Type | Default | Required | Where it is used |
|---|---|---|---|---|---|
| `OPENCODE_BROWSER_RELAY_PORT` | Initial relay port | number | `8799` | No | `plugin/browser-relay.ts` |
| `OPENCODE_BROWSER_EXTENSION_ID` | Extension ID accepted at the origin | string | fixed manifest ID | No | Origin validation |
| `OPENCODE_BROWSER_ALLOW_ANY_EXTENSION` | Allows any extension | `0` \| `1` | `0` | No | Origin validation |
| `OPENCODE_BROWSER_REQUIRE_HELLO` | Requires `hello` before activating the socket | `0` \| `1` | `1` | No | Handshake |
| `OPENCODE_BROWSER_WS_SECRET` | Optional secret required in `hello` | string | — | No | Handshake (the current extension does not send it) |

## Relay file

| Path | Contents | Permission |
|---|---|---|
| `$XDG_RUNTIME_DIR/opencode-browser/relay.json` (if defined) | `{"token":"…","port":8800}` | folder `0700`, file `0600` |
| `~/.cache/opencode-browser/relay.json` (fallback) | `{"token":"…","port":8800}` | folder `0700`, file `0600` |

## Extension manifest

| Key | Value | Reason |
|---|---|---|
| `manifest_version` | `3` | Required for new extensions |
| `minimum_chrome_version` | `116` | Side panel and offscreen APIs used |
| `key` | public key | Guarantees a fixed ID across reloads |
| `side_panel.default_path` | `sidepanel.html` | Side panel |
| `options_page` | `options.html` | Settings |
| `background.type` | `module` | Service worker with ES modules |
| `commands.toggle-side-panel` | `Ctrl+Shift+O` | Panel shortcut |

### Permissions

| Permission | Reason |
|---|---|
| `sidePanel` | Opens the panel on icon click |
| `storage` | Configuration, lists and group map |
| `tabs` / `tabGroups` | List, group, create and close tabs |
| `scripting` | Injects the content script and runs functions in the page |
| `debugger` | Trusted events, screenshots, console and network |
| `activeTab` | Access to the active tab when the user attaches it |
| `alarms` | Service worker keepalive |
| `offscreen` | Hidden document for keepalive, sound and GIF |
| `notifications` | System notification when the panel is closed |
| `downloads` | Save the exported GIF |
| `host_permissions: <all_urls>` | Read/interact with pages and talk to the local server |

### Content scripts

| Match | Timing | Frames | File |
|---|---|---|---|
| `<all_urls>` | `document_start` | all | `assets/content.js` |
