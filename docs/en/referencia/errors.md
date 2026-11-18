# Errors

## Connection state in the panel

When the configuration exists but the OpenCode server is not responding, the
side panel shows a persistent banner with the cause and the next step:

| Text | Cause (`connection.failure`) | Banner action |
|---|---|---|
| "OpenCode is not responding" | `unreachable` | Start `opencode serve` and click **Try again** |
| "OpenCode took too long to respond" | `timeout` | Restart OpenCode and **Try again** |
| "OpenCode token invalid or expired" | `unauthorized` | Run `opencode pair` and open the settings |
| "OpenCode responded with an error" | `server_error` | Check the server log and **Try again** |
| "The connection to OpenCode was closed" | `stream_closed` | **Reconnect**; if it persists, restart OpenCode |
| "Connecting to OpenCode…" | `connecting` | None; wait for the attempt in progress |

The **Try again** button sends `connection:reconnect`. While the backend is not
`online`, the message field is locked with the reason in the placeholder — the
text you typed is not lost.

The field footer shows the plugin state ("tools connected" / "tools offline").
The plugin state is independent of the API state: chat works without it, but the
browser tools do not.

## Pairing and connection errors

| Message | Cause | Fix |
|---|---|---|
| "Invalid link. Paste the full link shown by opencode pair." | Text without a valid URL | Copy the full link |
| "The link does not contain /auth/connect/<code>." | URL from another route | Run `opencode pair` again |
| "Link expired or already used. Run opencode pair again." | Code consumed or past the 5 min | Generate a new link |
| "The server did not return a session token." | Unexpected response | Check the OpenCode version |
| "Could not reach OpenCode at <url>. Is it running?" | Server stopped or wrong port | Start `opencode serve` and use **Try again** in the banner |
| "OpenCode is not configured." | No pairing done | Complete the onboarding |

## Relay errors

| Message | Cause | Fix |
|---|---|---|
| "The OpenCode Browser extension is not connected." | No active socket | Open the side panel and check the plugin status |
| "The extension did not respond within 180s." | Tool stuck or extension suspended | Check the page and try again |
| "Execution cancelled." | Stop button or OpenCode cancellation | Expected |
| "Relay HTTP 403." | Token in the file does not match | Delete `~/.cache/opencode-browser/relay.json` (or `$XDG_RUNTIME_DIR/opencode-browser/relay.json`) and restart OpenCode |
| "Relay HTTP 503." | Server responded without the extension socket, even after the 8 s wait | Reconnect the panel |
| "could not open the relay on any candidate port" | 8799–8802 taken and none responds as a relay | Free a port or restart OpenCode |

### Close-tab tool unavailable

If the agent says `browser_tabs_close` does not exist, the plugin/agent is out of
date or collided with OpenCode's native browser. Run
`npm run install:plugin` + `opencode service restart` and use the current name
`browser_tabs_close_tab` (the extension keeps receiving `tabs_close`).

## Page and tool errors

| Message | Cause | Fix |
|---|---|---|
| "The tab is on "about:blank". Use navigate..." | Blank tab | Navigate first |
| "Could not prepare the page... chrome:// ..." | Internal page or Web Store | Use http(s) pages |
| "Ref <x> is inside an iframe and has no coordinates..." | Coordinate requested for an iframe ref | Use `ref` in click/type/form_input |
| "Ref <x> not found." | Ref expired after navigation | Run `read_page` again |
| "Tab <id> does not belong to this session's group." | Tab outside the group | `tabs_context` or `tabs_attach` |
| "The tab is in another window..." | `tabs_attach` of a tab in a different window from the group | Open a tab through the session or move the tab to the group window |
| "Only http(s) tabs can be attached." | Internal tab | Use a regular tab |
| "File <name> exceeds the ~5 MB limit." | Large base64 | Reduce the file |
| "No frames recorded..." | `gif_creator export` without `start` | Start recording first |
| "Failed to generate the GIF (offscreen unavailable)." | Offscreen did not start | Reload the extension |
| "DevTools is open on this tab..." | `chrome.debugger` busy | Close DevTools |

## Session errors

| Message | Cause | Fix |
|---|---|---|
| "Session created without an id." | Unexpected response | Check the OpenCode version |
| "No active session." | Action without a selected session | Create or select a conversation |
| "Could not create the session." | API failure | Check the backend/status |
| "Try again (attempt N): ..." | Provider retry | Wait or switch models |

## HTTP codes

| Status | Meaning | When it occurs |
|---|---|---|
| `401` | Unauthorized | Invalid/expired token in the OpenCode API |
| `403` | Forbidden | Invalid origin/token in the relay |
| `404` | Not found | Nonexistent route/tool or removed session |
| `409` | Conflict | Concurrent prompt in the session or relay call `id` already in use |
| `500` | Internal error | Unexpected relay failure |
| `503` | Unavailable | Extension disconnected or OpenCode feature disabled |
