# Documentation index

Technical documentation for **OpenCode Browser** — a browser extension plus an
OpenCode plugin.

**Language:** [Português (Brasil)](../index.md) · English

| Document | Description |
|---|---|
| [User guide](guias/guia-do-usuario.md) · [HTML version](../../web/en/index.html) | End-user guide: install, pair, chat, tabs, parallel sessions, permissions and settings |
| [architecture.md](arquitetura/architecture.md) | Architecture overview, components and flows |
| [extension.md](arquitetura/extension.md) | How the extension works internally (service worker, content scripts, pages, offscreen) |
| [plugin.md](arquitetura/plugin.md) | OpenCode plugin: WebSocket relay, handshake, ports, private token, HTTP fallback and lifecycle |
| [components.md](arquitetura/components.md) | React components and background modules |
| [state.md](arquitetura/state.md) | Service worker state and storage keys |
| [tools.md](referencia/tools.md) | Catalog of the 18 `browser_*` tools with parameters and permissions |
| [api.md](referencia/api.md) | OpenCode v2 API endpoints used by the extension |
| [types.md](referencia/types.md) | Shared TypeScript types and models |
| [events.md](referencia/events.md) | SSE events, relay messages, internal and content script messages |
| [config.md](referencia/config.md) | User settings and environment variables |
| [security.md](referencia/security.md) | Authentication, permissions, isolation and risks |
| [errors.md](referencia/errors.md) | Error messages, causes and fixes |
| [development.md](development.md) | Build, scripts, reload and manual testing checklist |
| [adr/](../adr/) | Architecture decisions (ADRs 0001–0010) |

## Suggested reading

1. **I want to use it:** [user guide](guias/guia-do-usuario.md) → [security.md](referencia/security.md)
2. **I want to understand the flow:** [architecture.md](arquitetura/architecture.md) → [extension.md](arquitetura/extension.md) → [plugin.md](arquitetura/plugin.md)
3. **I want to contribute:** [development.md](development.md) → [components.md](arquitetura/components.md) → [types.md](referencia/types.md)
4. **I want to review decisions:** [adr/](../adr/)
