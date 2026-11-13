# Índice da documentação

Documentação técnica do **OpenCode Browser** — extensão de navegador + plugin do
OpenCode.

| Documento | Descrição |
|---|---|
| [Guia do usuário](guias/guia-do-usuario.md) · [versão HTML](../web/index.html) | Guia do usuário final: instalar, parear, conversar, abas, sessões paralelas, permissões e configurações |
| [architecture.md](arquitetura/architecture.md) | Visão geral da arquitetura, componentes e fluxos |
| [extension.md](arquitetura/extension.md) | Como a extensão funciona por dentro (service worker, content scripts, páginas, offscreen) |
| [plugin.md](arquitetura/plugin.md) | Plugin do OpenCode: relay WebSocket, handshake, portas, token privado, fallback HTTP e ciclo de vida |
| [components.md](arquitetura/components.md) | Componentes React e módulos do background |
| [state.md](arquitetura/state.md) | Estado do service worker e chaves de armazenamento |
| [tools.md](referencia/tools.md) | Catálogo das 18 ferramentas `browser_*` com parâmetros e permissões |
| [api.md](referencia/api.md) | Endpoints da API v2 do OpenCode usados pela extensão |
| [types.md](referencia/types.md) | Tipos e modelos TypeScript compartilhados |
| [events.md](referencia/events.md) | Eventos SSE, mensagens do relay, mensagens internas e do content script |
| [config.md](referencia/config.md) | Configurações do usuário e variáveis de ambiente |
| [security.md](referencia/security.md) | Autenticação, permissões, isolamento e riscos |
| [errors.md](referencia/errors.md) | Mensagens de erro, causas e resoluções |
| [development.md](development.md) | Build, scripts, reload e checklist de testes manuais |
| [adr/](adr/) | Decisões de arquitetura (ADRs 0001–0010) |

## Leitura sugerida

1. **Quero usar:** [guia do usuário](guias/guia-do-usuario.md) → [security.md](referencia/security.md)
2. **Quero entender o fluxo:** [architecture.md](arquitetura/architecture.md) → [extension.md](arquitetura/extension.md) → [plugin.md](arquitetura/plugin.md)
3. **Quero contribuir:** [development.md](development.md) → [components.md](arquitetura/components.md) → [types.md](referencia/types.md)
4. **Quero revisar decisões:** [adr/](adr/)
