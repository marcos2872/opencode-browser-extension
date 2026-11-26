# `browser_*` tools

The 18 tools are registered by the plugin in the `browser` namespace and appear
to the model as `browser_<name>`. All of them operate only on tabs in the
session group and, except for the read-only ones, request permission according
to the [security model](security.md).

## Read-only

### `browser_tabs_context`

Lists the tabs in the session group.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `createIfEmpty` | boolean | No | Creates a group/tab if one does not exist yet |

Returns `tabGroupId`, `currentTabId`, `availableTabs` and `tabCount`.

### `browser_read_page`

Accessibility tree with refs (`ref_1`, `ref_2`…).

| Parameter | Type | Required | Description |
|---|---|---|---|
| `filter` | `interactive` \| `all` | No | Interactive elements only or all of them |
| `depth` | number | No | Maximum depth (default 12) |
| `ref_id` | string | No | Focuses starting from an existing ref |
| `max_chars` | number | No | Character limit (default 50,000) |
| `include_hidden` | boolean | No | Includes invisible elements |
| `frames` | `main` \| `all` | No | Aggregates iframes with the `f<frameId>_ref_N` prefix |
| `tabId` | number | No | Target tab (default: the group's main tab) |

### `browser_find`

Searches elements by text/role/name.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `query` | string | Yes | Search term |
| `max_results` | number | No | Maximum results (default 20) |
| `frames` | `main` \| `all` | No | Also searches iframes |
| `tabId` | number | No | Target tab |

With `findMode: "model"` in the settings, candidates are ranked by the OpenCode
model through stateless generation; without it (or on failure), the local
heuristic is used.

### `browser_get_page_text`

Extracts the page's main text.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `max_chars` | number | No | Limit (default 50,000) |
| `frames` | `main` \| `all` | No | Also concatenates iframe text |
| `tabId` | number | No | Target tab |

### `browser_read_console_messages`

| Parameter | Type | Required | Description |
|---|---|---|---|
| `pattern` | string | No | Substring filter |
| `onlyErrors` | boolean | No | Errors/exceptions only |
| `limit` | number | No | Maximum messages (default 100) |
| `clear` | boolean | No | Clears the buffer after reading |
| `tabId` | number | No | Target tab |

Monitoring starts when the tool is used; reload the page to capture messages
from load time.

### `browser_read_network_requests`

| Parameter | Type | Required | Description |
|---|---|---|---|
| `urlPattern` | string | No | Substring filter on the URL |
| `limit` | number | No | Maximum requests (default 100) |
| `clear` | boolean | No | Clears the buffer after reading |
| `tabId` | number | No | Target tab |

The buffer is cleared when the domain changes.

## Tabs and navigation

### `browser_tabs_create`

| Parameter | Type | Required | Description |
|---|---|---|---|
| `url` | string | No | Initial URL (default `about:blank`) |
| `active` | boolean | No | Brings the tab to the front (default false) |

Reuses the main tab if it is blank or on the same origin; with a different
origin, it opens a new tab in the group. The tab is born **in the background**:
it is only activated with `active: true` and if `bringTabsToFront` is enabled in
the options.

### `browser_tabs_attach`

Moves an existing tab into the session group.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `tabId` | number | No | Target tab (default: the browser's active tab) |

Requests permission and removes the tab from the user's current group, if any.
The tab is not brought to the front. Because `chrome.tabs.group` moves the tab
into the group's window, attaching a tab from **another window** is refused with
an error message — open a new tab through the session or move the tab first.

### `browser_tabs_close_tab`

| Parameter | Type | Required | Description |
|---|---|---|---|
| `tabId` | number | Yes | Group tab to close |

The exposed name avoids a collision with `browser.tabs.close` from the native
`opencode.browser` plugin. In the protocol with the extension the name remains
`tabs_close`.

### `browser_navigate`

| Parameter | Type | Required | Description |
|---|---|---|---|
| `url` | string | No | URL or domain (`https://` is added if missing) |
| `direction` | `back` \| `forward` | No | History navigation |
| `tabId` | number | No | Target tab |

Requests permission for new domains (a transition card when the host changes).

### `browser_resize_window`

| Parameter | Type | Required | Description |
|---|---|---|---|
| `width` | number | Yes | Width in pixels |
| `height` | number | Yes | Height in pixels |
| `tabId` | number | No | Target tab |

## Interaction

### `browser_computer`

| Parameter | Type | Required | Description |
|---|---|---|---|
| `action` | `click` \| `type` \| `key` \| `scroll` \| `hover` \| `screenshot` \| `zoom` \| `wait` | Yes | Action |
| `ref` | string | No | Ref from `read_page`/`find` |
| `coordinate` | [number, number] | No | Viewport coordinate |
| `text` | string | No | Text for `type` |
| `keys` | string | No | Key or combination for `key` (e.g. `Enter`, `Ctrl+A`, `!`) |
| `submit` | boolean | No | Presses Enter after typing |
| `click_count` | number | No | 1–3 clicks |
| `button` | `left` \| `right` \| `middle` | No | Mouse button |
| `scroll_direction` | `up` \| `down` \| `left` \| `right` | No | Scroll direction |
| `scroll_amount` | number | No | Pixels (default 600) |
| `duration` | number | No | Seconds for `wait` (max. 10) |
| `region` | [number, number, number, number] | No | Region for `zoom` |
| `tabId` | number | No | Target tab |

On `screenshot`, the image is also written to disk
(`~/.cache/opencode-browser/capturas/`, or `$XDG_CACHE_HOME`) and the path comes
back in the response text (`Arquivo: …`), in addition to the image in the
content — that is what makes it possible to build pages that embed the screen,
such as the requirements map.

Clicks and typing use trusted events through CDP. Iframe refs use DOM events.
With DevTools open, click/hover fall back to DOM events when there is a ref.

Pass layout-dependent symbols literally (for example, `!`) instead of asking
for a physical chord such as `Shift+1`. The keyboard layout is not inferred.

### `browser_form_input`

| Parameter | Type | Required | Description |
|---|---|---|---|
| `ref` | string | Yes | Field (input, textarea, select, contenteditable) |
| `value` | string | Yes | Value |
| `tabId` | number | No | Target tab |

### `browser_javascript_tool`

| Parameter | Type | Required | Description |
|---|---|---|---|
| `text` | string | Yes | JavaScript code |
| `action` | `javascript_exec` | No | Compatibility |
| `tabId` | number | No | Target tab |

Runs in the page context with a 10 s timeout and output limited to 50 KB.

### `browser_upload_image`

| Parameter | Type | Required | Description |
|---|---|---|---|
| `ref` | string | Yes | File input or drop area |
| `files` | `[{ data, name, mimeType? }]` | Yes | Up to 3 files, base64, ~5 MB each |
| `tabId` | number | No | Target tab |

## Planning and batch

### `browser_update_plan`

| Parameter | Type | Required | Description |
|---|---|---|---|
| `domains` | string[] | Yes | Domains that will be visited |
| `approach` | string[] | Yes | High-level steps |

Shows an approval card. Approved domains are added to the session allowlist.

### `browser_batch`

| Parameter | Type | Required | Description |
|---|---|---|---|
| `actions` | `[{ name, input }]` | Yes | Up to 20 actions in sequence |

Runs tools one by one, with normal permissions, and returns the result of each
item.

### `browser_gif_creator`

| Parameter | Type | Required | Description |
|---|---|---|---|
| `action` | `start` \| `stop` \| `export` | Yes | Recording phase |

`start` begins recording (up to 30 frames, one per action), `stop` ends it and
`export` generates the GIF (up to 800 px, 600 ms per frame), saves it to
Downloads and returns the image.

## Permissions per tool

| Category | Tools | Behavior |
|---|---|---|
| Read-only (no prompt) | `tabs_context`, `tabs_create`, `read_page`, `get_page_text`, `find`, `read_console_messages`, `read_network_requests` | Run directly |
| Action (with prompt) | `navigate`, `computer`, `form_input`, `javascript_tool`, `tabs_close_tab` (wire `tabs_close`), `tabs_attach`, `upload_image`, `gif_creator` (export) | Prompt once / for this session / always / deny |
| Planning | `update_plan` | Plan card with domains and steps |
| Batch | `browser_batch` | Each sub-action follows its own rule |
