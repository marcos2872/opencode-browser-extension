# Índice da documentação

Documentação técnica do **OpenCode Browser** — extensão de navegador + plugin do
OpenCode.

| Documento | Descrição |
|---|---|
| [architecture.md](architecture.md) | Visão geral da arquitetura, componentes e fluxos |
| [extension.md](extension.md) | Como a extensão funciona por dentro (service worker, content scripts, páginas, offscreen) |
| [plugin.md](plugin.md) | Plugin do OpenCode: relay WebSocket, handshake, portas, token privado, fallback HTTP e ciclo de vida |
| [tools.md](tools.md) | Catálogo das 18 ferramentas `browser_*` com parâmetros e permissões |
| [api.md](api.md) | Endpoints da API v2 do OpenCode usados pela extensão |
| [types.md](types.md) | Tipos e modelos TypeScript compartilhados |
| [components.md](components.md) | Componentes React e módulos do background |
| [state.md](state.md) | Estado do service worker e chaves de armazenamento |
| [events.md](events.md) | Eventos SSE, mensagens do relay, mensagens internas e do content script |
| [config.md](config.md) | Configurações do usuário e variáveis de ambiente |
| [security.md](security.md) | Autenticação, permissões, isolamento e riscos |
| [errors.md](errors.md) | Mensagens de erro, causas e resoluções |
| [development.md](development.md) | Build, scripts, reload e checklist de testes manuais |
| [adr/](adr/) | Decisões de arquitetura (ADRs 0001–0009) |

## Leitura sugerida

1. **Quero usar:** [README](../README.md) → [security.md](security.md)
2. **Quero entender o fluxo:** [architecture.md](architecture.md) → [extension.md](extension.md) → [plugin.md](plugin.md)
3. **Quero contribuir:** [development.md](development.md) → [components.md](components.md) → [types.md](types.md)
4. **Quero revisar decisões:** [adr/](adr/)
