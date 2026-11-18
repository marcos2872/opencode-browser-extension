# Security

## Authentication with OpenCode

| Scheme | Details | Where it applies |
|---|---|---|
| Link pairing | `opencode pair` generates a single-use code valid for 5 minutes; the extension exchanges it for a session token | `GET /auth/connect/{code}` |
| Basic auth | `Authorization: Basic base64("opencode:<token>")` on every call | Local v2 API |

The token stays only in the browser's `chrome.storage.local` and is never sent
to a host other than the configured `baseUrl` (loopback by default).

## Relay isolation

| Protection | Implementation |
|---|---|
| Local listening | The plugin server starts on `127.0.0.1` (never `0.0.0.0`) |
| Origin | The WebSocket upgrade is only accepted from `chrome-extension://<fixed ID>` |
| Handshake | The socket only becomes active after a valid `hello`; an unauthenticated socket does not receive `ready` and does not answer `tool_result` |
| Shared token | `$XDG_RUNTIME_DIR/opencode-browser/relay.json` or `~/.cache/opencode-browser/relay.json` (folder `0700`, file `0600`); required in the `x-relay-token` header of the HTTP fallback |
| Host | `/health`, `/tool` and `/cancel` refuse a `Host` that is not loopback on the server port (DNS rebinding) |
| Timeout | Calls expire in 180 s; permission prompts in up to 5 min (configurable) |
| Cancellation | `/cancel` and the `cancel` message abort pending executions |

The fixed ID comes from the `key` in the manifest. To change it, adjust
`OPENCODE_BROWSER_EXTENSION_ID` in the plugin; allowing any extension
(`OPENCODE_BROWSER_ALLOW_ANY_EXTENSION=1`) weakens the protection and is not
recommended. `hello` also accepts an optional secret
(`OPENCODE_BROWSER_WS_SECRET`), but the current extension does not send it: use
it only with an adapted extension. The HTTP fallback token lives in a private
folder, with owner and permission checks; a process from another user cannot
read it or plant a fake file in `/tmp`.

## Action permissions

| Mode | Behavior |
|---|---|
| `ask` | Asks on the first action of each domain |
| `allow` | Runs without asking, respecting the blocklist |
| `deny` | Blocks actions; read-only only |

| Decision | Scope |
|---|---|
| Allow once | That execution only |
| Allow for this session | In-memory allowlist until the browser closes |
| Always allow | Persistent allowlist (`permissions.allow`) |
| Deny / timeout | Execution refused |

Read-only tools (`tabs_context`, `read_page`, `find`, `get_page_text`,
`read_console_messages`, `read_network_requests`, `tabs_create`) run without a
prompt. Actions that change the page, navigate, close/attach tabs, run
JavaScript, send files or export a GIF ask for confirmation. Closing a tab
appears as `browser_tabs_close_tab` to the model and reaches the service worker
as `tabs_close`.

`update_plan` shows domains and steps before any navigation; approved domains
are added to the session allowlist.

## Tab isolation

- Each OpenCode session has its own tab group (`OpenCode`).
- The tools only see tabs in that group.
- Attaching an existing tab requires confirmation and removes the tab from the
  user's current group.

## Privacy and data

| Data | Destination |
|---|---|
| Conversation and prompts | Local OpenCode server (and the model provider configured there) |
| Pairing token | `chrome.storage.local` + Basic header to loopback |
| Screenshots and GIF | Tool result; the GIF is saved to Downloads |
| Console/network | In-memory buffers per tab, cleared when the domain changes |
| Configuration and lists | `chrome.storage.local` |

Nothing is sent to external extension servers: there is no telemetry.

## Redaction of sensitive data

The accessibility tree omits values of password, `hidden` and card/authentication
`autocomplete` fields (`current-password`, `cc-number`, `one-time-code` etc.),
showing `[value redacted]`.

## Risks and recommendations

| Risk | Recommendation |
|---|---|
| Prompt injection in pages | Keep `ask`; the agent prompt treats page content as data, never as instruction |
| Screenshots of private content | Avoid using it on healthcare, banking and similar sites |
| Chrome debugging banner | Expected with `chrome.debugger`; close DevTools while using it |
| Broad permissions (`<all_urls>`, `debugger`) | Install only builds you compiled yourself |
| Token file | Lives in a private folder (`0700`) with a `0600` file; the relay checks owner and permissions |
| Ignored permission prompt | Timeout denies automatically (60 s default) |

## Threat model

The local OpenCode and processes from the same user are assumed to be trusted.
The relay protects against web pages, other extensions and processes from other
users (private token + `Host`/`Origin` + `hello`). A local process running as
the same user can still read the token and impersonate the extension; separating
that case would require a shared secret in `hello`
(`OPENCODE_BROWSER_WS_SECRET`) and an extension that sends it.
