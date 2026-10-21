# Desenvolvimento

## Build

O projeto usa quatro configurações do Vite porque cada contexto do MV3 tem
requisitos diferentes:

| Configuração | Entrada | Formato | Saída |
|---|---|---|---|
| `vite.config.ts` | `sidepanel.html`, `options.html`, `permission.html` | ESM + HTML | páginas + `assets/*-[hash].js/css` |
| `vite.background.config.ts` | `src/background/service-worker.ts` | ESM (lib) | `assets/background.js` |
| `vite.content.config.ts` | `src/content/index.ts` | IIFE | `assets/content.js` |
| `vite.offscreen.config.ts` | `src/offscreen.ts` | IIFE | `assets/offscreen.js` |

O `dist/` é limpo pelo primeiro build e os demais usam `emptyOutDir: false`.
Arquivos estáticos (`manifest.json`, ícones, `offscreen.html`) vêm de `public/`.

## Fluxo de trabalho

1. Edite o código em `src/` ou `plugin/`.
2. `npm run verify` (typecheck + build).
3. Recarregue a extensão em `chrome://extensions`.
4. Para o plugin: `npm run install:plugin` (o OpenCode recarrega ao detectar a
   mudança; confirme com `curl http://127.0.0.1:8800/health`).

> O Chrome mantém o service worker em cache. Se o comportamento não mudar após o
> build, clique em **Recarregar** na extensão ou feche e reabra o navegador de
> teste.

## Checklist de testes manuais

| # | Passo | Resultado esperado |
|---|---|---|
| 1 | `opencode pair` + colar o link | Painel mostra "online" e a lista de modelos |
| 2 | Criar conversa e enviar um prompt | Streaming de texto e raciocínio |
| 3 | Pedir para o agente abrir uma página | Card de permissão; depois `navigate` com sucesso |
| 4 | Pedir `read_page` | Árvore com refs no resultado |
| 5 | Pedir um clique por ref | Página reage; card `ok` |
| 6 | Pedir `frames=all` numa página com iframe | Refs `f<frameId>_ref_N` |
| 7 | Pedir upload de arquivo | Nome do arquivo aparece na página |
| 8 | `gif_creator start` → ações → `export` | GIF salvo em Downloads |
| 9 | Digitar `/` no composer | Menu com os comandos do OpenCode |
| 10 | Trocar modelo e agente | Sessão passa a usar a nova escolha |
| 11 | Fechar o painel e pedir uma ação | Popup de permissão abre |
| 12 | `npm run build` + reload | Sem erros no console do service worker |

## Diagnóstico

| O que | Como |
|---|---|
| Console do service worker | `chrome://extensions` → Detalhes → "service worker" |
| Estado do relay | `curl http://127.0.0.1:8800/health` |
| Token e porta | `cat /tmp/opencode-browser-relay.token` |
| Log do OpenCode | `~/.local/share/opencode/log/opencode.log` (procure `opencode-browser`) |
| Testar tool direto | `POST /tool` com `x-relay-token` (ver [plugin.md](plugin.md)) |
| Lista de tools | Harness com `Plugin.define` fake, ou `opencode plugin list` |

## Convenções

- Código e documentação em português brasileiro; identificadores em inglês.
- Tipos compartilhados em `src/shared/`; nada de tipos duplicados nos módulos.
- Mensagens de erro voltadas ao usuário final, em português, dizendo o que fazer.
- Commits em Conventional Commits (`feat:`, `fix:`, `docs:`…).
- Sem arquivos de documentação dentro de `src/`; a documentação vive em `docs/`.

## Dependências

| Dependência | Uso |
|---|---|
| `react` / `react-dom` | UI do painel, options e permissão |
| `react-markdown` + `remark-gfm` | Renderização das respostas |
| `gifenc` | Codificação de GIF no offscreen |
| `vite`, `@vitejs/plugin-react`, `typescript` | Build e tipos |
| `@types/chrome` | Tipos das APIs do navegador |
