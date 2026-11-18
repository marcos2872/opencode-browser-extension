# Architecture

The system has three processes/contexts:

| Component | Responsibility | Technology | Address |
|---|---|---|---|
| **Extension** | UI, sessions, streaming, execution of actions in the browser | TypeScript, React 19, MV3 | `chrome-extension://<id>` |
| **Local OpenCode** | Models, sessions, agent, history, SSE | OpenCode v2 (HTTP API) | `http://127.0.0.1:<port>` |
| **`browser-relay` plugin** | Registers the `browser_*` tools and bridges to the extension | TypeScript in the OpenCode runtime | `ws://127.0.0.1:8799` (or 8800–8802; reuses an already active relay) |

```mermaid
flowchart LR
    subgraph Navegador["Chrome / Chromium"]
        UI["Side panel (React)<br/>chat, models, permissions"]
        SW["Service worker<br/>API, SSE, CDP, tab groups"]
        CS["Content scripts<br/>accessibility tree + indicator"]
        OFF["Offscreen<br/>keepalive, sound, GIF"]
        UI <-->|"chrome.runtime<br/>(port + messages)"| SW
        SW -->|"chrome.scripting / debugger"| CS
        SW <-->|"messages"| OFF
    end

    subgraph Maquina["Local machine"]
        OC["OpenCode v2<br/>models, sessions, agent"]
        PL["Plugin browser-relay<br/>tools browser_*"]
        OC --- PL
    end

    SW -->|"HTTP + SSE<br/>Basic auth"| OC
    SW <-->|"WebSocket + HTTP fallback<br/>local token"| PL
```

> OpenCode v2 ships the native `opencode.browser` plugin (the desktop app's
> browser) with the `browser.tabs.close` operation, exposed as
> `browser_tabs_close`. To avoid a collision, this project's equivalent tool is
> `browser_tabs_close_tab` (wire name `tabs_close`).

## Conversation flow

```mermaid
sequenceDiagram
    participant U as User
    participant UI as Side panel
    participant SW as Service worker
    participant OC as OpenCode
    participant PL as Plugin
    participant CH as Chrome

    U->>UI: types and sends
    UI->>SW: prompt
    SW->>OC: POST /api/session/:id/prompt
    OC-->>SW: SSE session.text.delta
    SW-->>UI: snapshot with streaming
    OC->>PL: tool browser_navigate
    PL->>SW: tool_request (WebSocket)
    SW->>CH: permission + navigation
    CH-->>SW: result
    SW-->>PL: tool_result
    PL-->>OC: tool content
    OC-->>SW: SSE session.tool.success
    SW-->>UI: updated tool card
```

## Pairing flow

```mermaid
sequenceDiagram
    participant U as User
    participant UI as Side panel
    participant SW as Service worker
    participant OC as OpenCode

    U->>OC: opencode pair
    OC-->>U: link http://127.0.0.1:<porta>/auth/connect/<code>
    U->>UI: pastes the link
    UI->>SW: pair(link)
    SW->>OC: GET /auth/connect/<code> (Accept: application/json)
    OC-->>SW: { token }
    SW->>SW: saves baseUrl + token
    SW->>OC: GET /api/model, /api/agent, /api/command
    SW-->>UI: snapshot with models, agents and commands
```

## Tool and permission flow

```mermaid
flowchart TD
    A["Plugin sends tool_request"] --> B{"Is the tool read-only?"}
    B -->|"yes"| C["Runs directly"]
    B -->|"no"| D{"Host already allowed?"}
    D -->|"yes"| C
    D -->|"no"| E{"Panel open?"}
    E -->|"yes"| F["Card in the side panel"]
    E -->|"no"| G["Permission popup"]
    F --> H{"Decision"}
    G --> H
    H -->|"allow once"| C
    H -->|"allow for this session"| I["Session allowlist"] --> C
    H -->|"always allow"| J["Persistent allowlist"] --> C
    H -->|"deny / timeout"| K["Denied result"]
```

## Extension layers

| Layer | Files | Role |
|---|---|---|
| Background | `src/background/**` | OpenCode client, SSE, relay, CDP, tab groups, permissions, tool registry |
| Content | `src/content/**` | Accessibility tree with refs, DOM actions, visual indicator and Stop button |
| UI | `src/sidepanel`, `src/options` | Chat and settings; permission is a modal inside the panel |
| Offscreen | `src/offscreen.ts` | Service worker keepalive, notification sound and GIF encoding |
| Shared | `src/shared/**` | Types, relay protocol, storage |

## Recorded decisions

The structural choices are in [adr/](../../adr/): MV3 + side panel, link-based
pairing, local plugin with a relay, per-action/domain permissions, CDP with a
fallback, per-session tab groups, optional ranking in `find` and GIF in the
offscreen document.
