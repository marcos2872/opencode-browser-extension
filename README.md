# <img src="public/icons/icon-128.png" width="34" height="34" alt="Ícone da extensão: um prompt de terminal" /> OpenCode Browser

[![Testes](https://github.com/marcos2872/opencode-browser-extension/actions/workflows/test.yml/badge.svg)](https://github.com/marcos2872/opencode-browser-extension/actions/workflows/test.yml)
[![Qualidade de código](https://github.com/marcos2872/opencode-browser-extension/actions/workflows/quality.yml/badge.svg)](https://github.com/marcos2872/opencode-browser-extension/actions/workflows/quality.yml)
[![Licença: MIT](https://img.shields.io/badge/licen%C3%A7a-MIT-blue.svg)](LICENSE)

<img src="assets/screenshots/05-resumo-hacker-news.jpg" alt="Chrome com o painel do OpenCode Browser aberto ao lado do Hacker News: o agente leu a página e resumiu as cinco notícias do dia" width="100%" />

> Extensão MV3 que conecta o Chrome ao OpenCode instalado na sua máquina: usa os
> modelos locais para conversar e dá ao agente um grupo de abas isolado para
> navegar, ler e interagir com páginas — sempre com confirmação do usuário.

O projeto tem duas partes que trabalham juntas:

| Parte | O que é | Onde fica |
|---|---|---|
| **Extensão** | Side panel com chat, seletor de modelos, cards de ferramenta e permissões; service worker que fala com a API v2 do OpenCode e executa as ações no navegador | `src/` (build em `dist/`) |
| **Plugin** | Plugin do OpenCode que expõe as ferramentas `browser_*` ao agente e conversa com a extensão por WebSocket local | `plugin/browser-relay.ts` |

Nada sai da sua máquina: a extensão fala apenas com o servidor local do OpenCode
(`127.0.0.1`) e o plugin escuta apenas em loopback.

## Como é

| Painel | O agente pergunta | Configurações |
|:--:|:--:|:--:|
| ![Painel novo, com as sugestões de partida](assets/screenshots/01-painel-vazio.png) | ![Card de pergunta do agente, com opções e campo de resposta livre](assets/screenshots/06-pergunta-do-agente.jpg) | ![Tela de configurações: conexão, modelo padrão e agente](assets/screenshots/02-configuracoes-conexao.png) |
| Conversas em execução continuam rodando; o painel mostra a que você escolher | Quando precisa de uma decisão, o agente pergunta no próprio chat | Modelo, agente, permissões e avisos em um só lugar |

Mais capturas — execução em andamento, detalhe de notícia e configurações de
permissões — em [`assets/screenshots/`](assets/screenshots).

## Stack

- **Extensão:** TypeScript + React 19 + Vite 7 (MV3, service worker, side panel)
- **Plugin:** TypeScript rodando no runtime do OpenCode (Bun), com `Bun.serve`
- **Navegador:** Chrome/Chromium 116+ (testado em Chromium e Brave)
- **OpenCode:** API v2 local (`opencode serve` / serviço em background)

## Pré-requisitos

- Node.js 20+ e npm
- Chrome/Chromium 116+
- OpenCode v2 instalado (`opencode --version`)

## Instalação

```bash
npm install
npm run build
```

1. Abra `chrome://extensions`, ative o **modo desenvolvedor** e clique em
   **Carregar sem compactação**, apontando para a pasta `dist/`.
2. Instale o plugin no OpenCode (relay + template do agente) e reinicie o
   serviço para carregar a versão nova:
   ```bash
   npm run install:plugin
   opencode service restart
   ```
   O script é multiplataforma (Linux, macOS e Windows): resolve a pasta de
   plugins do OpenCode, remove cópias antigas e cria a pasta das conversas.
3. Rode `opencode pair` no terminal, copie o link e cole no onboarding do
   side panel (clique no ícone da extensão para abrir).

As conversas criadas pela extensão ficam em `~/.opencode-browser-extensions`
(no Windows, `%USERPROFILE%\.opencode-browser-extensions`) e a extensão lista
apenas as que estão nessa pasta. O caminho é configurável nas opções.

Pronto: escolha um modelo, crie uma conversa e peça algo como
"abra o Hacker News e resuma as 5 principais notícias".

> A tool de fechar aba se chama `browser_tabs_close_tab` para não colidir com
> `browser.tabs.close` do plugin nativo `opencode.browser` do OpenCode v2.

## Comandos

| Comando | Descrição |
|---|---|
| `npm run build` | Build completo (UI + service worker + content script + offscreen) em `dist/` |
| `npm run build:ui` | Apenas as páginas (side panel, options, permissão) |
| `npm run build:bg` | Apenas o service worker |
| `npm run build:content` | Apenas o content script |
| `npm run build:offscreen` | Apenas o documento offscreen |
| `npm test` | Roda a suíte de testes (Vitest) |
| `npm run test:coverage` | Testes com cobertura e mínimo de 80% |
| `npm run lint` | ESLint (qualidade de código) |
| `npm run typecheck` | Checagem de tipos (sem emitir) |
| `npm run verify` | `typecheck` + build completo |
| `npm run install:plugin` | Copia o relay e o template do agente para `~/.config/opencode/plugins/` |
| `npm run package` | Gera `opencode-browser-extension.zip` a partir de `dist/` |
| `npm run dev` | Servidor de desenvolvimento do Vite (apenas UI) |

Após qualquer alteração no código, rode `npm run build` e clique em
**Recarregar** na página da extensão. O Chrome mantém o service worker em cache,
então o reload é obrigatório.

## Documentação

| Documento | Conteúdo |
|---|---|
| [docs/index.md](docs/index.md) | Índice geral da documentação |
| [docs/guia-do-usuario.md](docs/guia-do-usuario.md) | Guia do usuário final (também em [HTML](docs/guia-do-usuario.html)) |
| [docs/architecture.md](docs/architecture.md) | Visão de arquitetura e componentes |
| [docs/extension.md](docs/extension.md) | Como a extensão funciona (service worker, content scripts, UI) |
| [docs/plugin.md](docs/plugin.md) | Plugin do OpenCode, relay, protocolo e portas |
| [docs/tools.md](docs/tools.md) | As 18 ferramentas `browser_*` |
| [docs/api.md](docs/api.md) | Endpoints da API v2 do OpenCode usados |
| [docs/security.md](docs/security.md) | Pareamento, tokens, permissões e riscos |
| [docs/development.md](docs/development.md) | Build, testes automatizados, CI e fluxo de trabalho |

## Segurança em uma linha

Automação de navegador é poderosa: revise os pedidos de permissão, mantenha a
lista de sites bloqueados e evite o modo "permitir automaticamente" em sites
sensíveis. Detalhes em [docs/security.md](docs/security.md).

## Licença

Distribuído sob a licença **MIT**. Veja [LICENSE](LICENSE) para o texto completo.
