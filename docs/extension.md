# Como a extensão funciona

Extensão Manifest V3 com quatro contextos: **service worker** (cérebro),
**content script** (ponte com a página), **páginas de UI** (side panel, options e
permissão) e **documento offscreen** (keepalive, som e GIF).

## Estrutura de pastas

```
src/
├── background/
│   ├── service-worker.ts        # orquestrador: estado, mensagens, SSE, tools
│   ├── opencode/client.ts       # cliente da API v2 (pair, models, sessions, prompt)
│   ├── opencode/sse.ts          # parser do stream /api/event
│   ├── relay.ts                 # cliente WebSocket do plugin (descoberta de porta)
│   ├── cdp.ts                   # chrome.debugger + CDP (input, screenshot, console, rede)
│   ├── tabGroups.ts             # grupos de abas por sessão + limpeza de órfãos
│   ├── permissions.ts           # modos, allowlist, popup e timeout
│   ├── recording.ts             # gravação de quadros para GIF
│   └── tools/                   # implementação das ferramentas
│       ├── registry.ts          # despacho + browser_batch
│       ├── a11y.ts              # ponte com o content script (frames e refs)
│       ├── tabs.ts              # tabs_context/create/attach/close, navigate, resize
│       ├── page.ts              # read_page, find, get_page_text, form_input
│       ├── computer.ts          # computer, javascript_tool, console, rede
│       ├── upload.ts            # upload_image
│       ├── gif.ts               # gif_creator
│       └── plan.ts              # update_plan
├── content/
│   ├── a11y.ts                  # árvore de acessibilidade + ações de DOM
│   ├── indicator.ts             # moldura, cursor fantasma e botão Parar
│   └── index.ts                 # instala os dois
├── sidepanel/                   # chat (App, Chat, Composer, ModelPicker, SessionBar...)
├── options/                     # configurações
├── permission/                  # popup de permissão
├── components/                  # Markdown, ícones, card de permissão
├── shared/                      # types.ts, protocol.ts, storage.ts
├── styles/app.css               # tema claro/escuro, layout e scrollbars
├── offscreen.ts                 # keepalive, beep e encoder de GIF
└── types/gifenc.d.ts            # tipos do encoder
```

## Service worker

Ponto de entrada: `src/background/service-worker.ts` (build em
`assets/background.js`, `type: module`).

### Inicialização

1. Carrega a allowlist/bloqueio de sites (`permissions.init`).
2. Remove grupos de abas órfãos (`tabs.cleanup`).
3. Lê a configuração salva e, se existir, cria o cliente do OpenCode, carrega
   modelos, agentes, comandos e sessões, seleciona a sessão ativa e abre o SSE.
4. Conecta no relay do plugin (descobre a porta via `GET /health`).
5. Garante o documento offscreen (keepalive de 20 s) e registra o alarme de
   30 s; configura o side panel para abrir no clique do ícone.

### Cliente do OpenCode

`src/background/opencode/client.ts` fala com a API v2 usando
`Authorization: Basic base64("opencode:<token>")` e envia `?directory=` quando um
diretório padrão está configurado. O pareamento consome o link de uso único e
guarda `baseUrl` + `token` em `chrome.storage.local`.

### Streaming e estado da conexão

O SSE é assinado em `GET /api/event` e o estado do canal é publicado em
`AppSnapshot.connection` (`unconfigured`, `connecting`, `online`, `offline`).
`online` só é publicado depois que a resposta do stream abre (callback `onOpen`
do `subscribe`); falhas carregam a causa (`unreachable`, `timeout`,
`unauthorized`, `server_error`, `stream_closed`), que o banner do painel usa
para dizer o que fazer.

- Reconexão automática com espera exponencial de 2 s a 30 s (60 s quando o token
  é recusado) e sem republicar snapshot a cada tentativa.
- Ao voltar para `online`, modelos, agentes, comandos e sessões são recarregados
  e a sessão ativa é reidratada.
- O botão **Tentar novamente** envia `connection:reconnect`: recria o cliente a
  partir da configuração salva, limpa execuções órfãs e reinicia o stream.
- Requisições HTTP têm timeout de 15 s (o stream SSE fica isento). O alarme de
  30 s faz uma verificação leve a cada ~60 s e encerra execuções presas depois de
  5 s de queda.

Os eventos são traduzidos para o estado do chat (mensagens, raciocínio,
ferramentas, retries e erros) e publicados nas páginas por um `Port` de longa
duração. A lista completa está em [events.md](events.md).

### Execução de ferramentas

O plugin envia `tool_request` por WebSocket. O service worker monta o contexto da
execução (sessão, `AbortSignal`, permissões, grupos de abas, CDP) e chama o
registro de ferramentas. O resultado volta como `tool_result`, com texto e,
quando houver, imagens em base64. Se a gravação de GIF estiver ativa, um quadro é
capturado após cada ação.

O botão **Parar** (injetado na página) envia `browser:stop`: aborta as execuções
em andamento e interrompe a sessão no OpenCode.

### Sessões e pasta das conversas

O plugin anuncia no handshake uma pasta própria (`~/.opencode-browser-extensions`
por padrão). A extensão a usa como `location` ao criar sessões e filtra a
listagem por ela — só aparecem as conversas criadas ali. Se o usuário definir
outro caminho nas opções, ele tem precedência. Sessões sem `location` continuam
visíveis (defensivo).

Na configuração global do OpenCode (`~/.config/opencode/agents/`), o plugin
garante o agente `opencode-browser` a partir do template
`plugin/opencode-browser.agent.md`. O arquivo é atualizado por versão
(`<!-- opencode-browser-agent vN -->`): uma versão antiga é substituída com
backup `.bak-vN`; um arquivo sem marcador ou já na versão atual é preservado.
O template atual é **v4** (segurança, ambiente da extensão, abas por origem e
economia de contexto). Quando o servidor lista esse agente, as novas sessões
passam a usá-lo (`browserAgentDefault`, ligado por padrão; desligar nas opções
volta a usar o agente padrão escolhido). Ele restringe as ferramentas a
`browser_*` e `question` — o agente não lê arquivos, não executa comandos e não
acessa dados da máquina. Por ser global, ele aparece em todos os projetos do
OpenCode, não só nas conversas da extensão.

### Grupos de abas

Cada sessão do OpenCode ganha um grupo do Chrome com o título `OpenCode`, uma aba
principal e as demais abas usadas pelo agente. Ferramentas só enxergam abas do
grupo. Ao iniciar, grupos sem sessão correspondente são desfeitos (abas reais são
desagrupadas; abas em branco são fechadas).

`tabs_create` reaproveita a aba principal quando ela está **em branco** ou na
**mesma origem** (esquema + host + porta); se a URL for de outra origem, abre uma
aba nova. Assim, pedir Hugging Face e depois TabNews mantém as duas abertas.

### Offscreen

O documento offscreen (`offscreen.html` + `assets/offscreen.js`) mantém o service
worker acordado (mensagem a cada 20 s), toca o aviso sonoro (Web Audio, sem
arquivo de áudio) e codifica GIFs com o encoder `gifenc`.

## Content script

Injetado em todas as URLs em `document_start`, em todos os frames.

### Árvore de acessibilidade

Expõe `window.__opencodeA11y` com:

| Função | Retorno |
|---|---|
| `generate(opções)` | Texto da árvore com refs (`ref_1`, `ref_2`…), viewport, contagem e URL |
| `elements()` | Lista de elementos com papel, nome, tipo, valor e retângulo |
| `resolve(ref)` | Rola até o elemento e devolve o centro em coordenadas do frame |
| `setValue(ref, valor)` | Preenche input, textarea, select ou contenteditable |
| `pageText(máx)` | Texto principal (article/main/body) sem HTML |
| `clickRef(ref)` | Clique via eventos de DOM (usado em iframes e como fallback) |
| `hoverRef(ref)` | `mouseover` + `mousemove` via DOM |
| `scrollRef(ref)` | Rola até o elemento |
| `focusRef(ref)` | Foca o elemento |
| `uploadFiles(ref, arquivos)` | Injeta arquivos em `input[type=file]` ou drop zone |

As refs são estáveis por elemento (mapa fraco + contador) e valores sensíveis
(senhas e campos de cartão/autenticação) são redigidos na descrição.

### Indicador visual

- Moldura animada nas bordas, com o rótulo de status atual.
- Cursor fantasma posicionado antes de cliques.
- Botão **Parar** flutuante que envia `browser:stop`.
- Mensagens aceitas: `indicator:show`, `indicator:hide`, `indicator:status`,
  `indicator:cursor`.

## Páginas de UI

| Página | Arquivo | Papel |
|---|---|---|
| Side panel | `sidepanel.html` → `src/sidepanel/App.tsx` | Chat, modelos, agentes, comandos `/`, sessões, cards de ferramenta e permissão |
| Options | `options.html` → `src/options/App.tsx` | Conexão, modelo/agente padrão, permissões, sites, som/notificação, ferramentas |
| Permissão | `permission.html` → `src/permission/App.tsx` | Popup 560×680 aberto quando o painel está fechado |

O side panel conversa com o service worker por um `Port` (`opencode-browser-ui`)
e reconecta sozinho se o worker reiniciar. As mensagens estão em
[events.md](events.md).

## Fluxos principais

### Comandos `/`

Ao digitar `/` no composer, a extensão lista os comandos retornados por
`GET /api/command` e filtra por prefixo. Ao enviar, o texto vira
`POST /api/session/:id/command` com o nome do comando e os argumentos.

### Upload de arquivo

O agente envia bytes em base64; o content script monta um `DataTransfer` com
`File` e o injeta no input (eventos `input`/`change`) ou dispara
`dragenter`/`dragover`/`drop` na área de destino.

### GIF

`gif_creator` grava até 30 quadros (um screenshot por ação), com fila para não
perder quadros em corrida. Na exportação, o offscreen redimensiona para até
800 px, desenha o rótulo da ação e codifica com `gifenc`; o arquivo é salvo em
Downloads e devolvido como imagem no resultado.

### Iframes

`read_page`/`find`/`get_page_text` aceitam `frames: "all"`. Refs de subframes
recebem o prefixo `f<frameId>_ref_N`. `form_input` funciona em qualquer frame;
`computer` usa eventos de DOM para click/hover/scroll/type em refs de iframe.

## Limitações conhecidas

- Refs de iframes não têm coordenadas no frame principal; as ações usam eventos
  de DOM (não confiáveis) nesses casos.
- O `chrome.debugger` mostra a faixa de depuração e não anexa com o DevTools
  aberto — há fallback para eventos de DOM em click/hover.
- Páginas internas (`chrome://`, Web Store) e `about:blank` não aceitam injeção;
  navegue antes de ler.
- O service worker é mantido vivo pelo offscreen; ainda assim, em reinícios o
  SSE reconecta e o painel ressincroniza o estado.
