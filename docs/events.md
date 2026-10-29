# Eventos e mensagens

## Eventos SSE do OpenCode

Assinados em `GET /api/event` e traduzidos para o estado do chat.

| Evento                        | Dados usados                                                         | Efeito na extensão                                          |
| ----------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------- |
| `server.connected`            | —                                                                    | Marca o backend como online                                 |
| `session.created`             | `sessionID`, `title`, `slug`, `model`                                | Adiciona a sessão à lista                                   |
| `session.renamed`             | `sessionID`, `title`                                                 | Atualiza o título                                           |
| `session.step.started`        | `sessionID`                                                          | `busy = true`, limpa aviso                                  |
| `session.execution.started`   | `sessionID`                                                          | `busy = true`                                               |
| `session.text.started`        | `assistantMessageID`                                                 | Cria a mensagem do assistente                               |
| `session.text.delta`          | `delta`                                                              | Acrescenta texto (streaming)                                |
| `session.text.ended`          | `text`                                                               | Consolida o texto final e encerra o streaming da mensagem   |
| `message.updated`             | `info.id`, `info.sessionID`, `info.role`, `info.tokens`, `info.cost` | Atualiza tokens e custo da resposta do assistente           |
| `session.usage.updated`       | `messageID?`, `usage` ou `tokens`/`cost`                             | Atualiza o usage publicado durante a execução               |
| `session.reasoning.delta`     | `delta`                                                              | Acrescenta raciocínio                                       |
| `session.reasoning.ended`     | `text`                                                               | Consolida o raciocínio                                      |
| `session.tool.input.started`  | `id`, `name`                                                         | Registra o nome da chamada                                  |
| `session.tool.called`         | `id`, `input`                                                        | Cria o card da ferramenta                                   |
| `session.tool.progress`       | `id`, `metadata`                                                     | Atualiza metadados do card                                  |
| `session.tool.success`        | `id`, `content`, `metadata`                                          | Card como `ok` com resultado                                |
| `session.tool.failed`         | `id`, `error`                                                        | Card como `error`                                           |
| `session.step.ended`          | `finish`                                                             | Encerra o streaming do passo; `busy` só cai fora de `tool-calls` |
| `session.execution.succeeded` | —                                                                    | `busy = false`; som/notificação se o painel estiver fechado |
| `session.execution.failed`    | `error` ou `message`                                                 | Encerra a execução e mostra o erro na resposta              |
| `session.retry.scheduled`     | `attempt`, `message`                                                 | Mostra aviso "tentando novamente"                           |
| `session.status`              | `status.type`                                                        | `idle` encerra o estado ocupado                             |
| `session.error`               | `error`                                                              | Encerra a execução e mostra o erro na resposta              |

Demais eventos (`session.inbox.*`,
`session.instructions.updated`, `project.updated`, etc.) são ignorados.

## Protocolo do relay (extensão ↔ plugin)

Detalhes de implementação em [plugin.md](plugin.md).

| Direção           | Mensagem       | Campos                                                   |
| ----------------- | -------------- | -------------------------------------------------------- |
| extensão → plugin | `hello`        | `v`, `extensionId`, `secret?`                            |
| extensão → plugin | `tool_result`  | `id`, `ok`, `content?`, `images?`, `error?`, `metadata?` |
| extensão → plugin | `progress`     | `id`, `phase`, `detail?`                                 |
| extensão → plugin | `pong`         | —                                                        |
| extensão → plugin | `ensure_agent` | `id`                                                     |
| plugin → extensão | `ready`        | `v`, `home`, `workspace` (só depois do `hello`)          |
| plugin → extensão | `tool_request` | `id`, `tool`, `args`, `sessionID?`                       |
| plugin → extensão | `cancel`       | `id`                                                     |
| plugin → extensão | `ping`         | —                                                        |
| plugin → extensão | `ensure_agent_result` | `id`, `ok`, `path?`, `error?`                     |

## Mensagens internas (páginas ↔ service worker)

Enviadas com `chrome.runtime.sendMessage` (páginas → SW) e por um `Port`
chamado `opencode-browser-ui` (SW → páginas).

### Pedidos (`UiRequest`)

| Mensagem              | Campos                  | Descrição                             |
| --------------------- | ----------------------- | ------------------------------------- |
| `state:get`           | —                       | Devolve o snapshot completo           |
| `pair`                | `link`                  | Consome o link e salva a configuração |
| `unpair`              | —                       | Remove token e zera o estado          |
| `models:refresh`      | —                       | Recarrega o catálogo                  |
| `sessions:list`       | —                       | Recarrega as sessões                  |
| `session:new`         | `model?`, `agent?`      | Cria sessão                           |
| `session:select`      | `id`                    | Seleciona e hidrata                   |
| `session:delete`      | `id`                    | Remove a sessão                       |
| `session:model`       | `model`                 | Troca o modelo da sessão              |
| `session:agent`       | `agent`                 | Troca o agente da sessão              |
| `tabs:attach-current` | —                       | Anexa a aba ativa ao grupo (recusa aba de outra janela) |
| `tabs:list`           | `sessionID`             | Lista abas no contexto da sessão      |
| `tabs:detach`         | `sessionID`, `tabID`    | Remove a aba do contexto sem fechá-la |
| `prompt`              | `text`                  | Envia mensagem                        |
| `command`             | `name`, `text`          | Executa comando `/`                   |
| `interrupt`           | —                       | Interrompe a execução                 |
| `settings:update`     | `patch`                 | Atualiza a configuração               |
| `open:options`        | —                       | Abre as configurações                 |
| `open:sidepanel`      | —                       | Reservado                             |
| `permission:respond`  | `requestId`, `decision` | Responde um pedido                    |
| `relay:reconnect`     | —                       | Reconecta ao plugin                   |

### Eventos (`UiEvent`)

| Mensagem              | Campos      | Descrição                           |
| --------------------- | ----------- | ----------------------------------- |
| `snapshot`            | `snapshot`  | Estado completo (throttle de 60 ms) |
| `relay`               | `relay`     | Estado do plugin                    |
| `permission`          | `request`   | Novo pedido de permissão            |
| `permission:resolved` | `requestId` | Pedido respondido/expirado          |
| `event`               | `event`     | Reservado (não usado hoje)          |

### Mensagens diretas do service worker

| Mensagem             | Destino        | Descrição                                            |
| -------------------- | -------------- | ---------------------------------------------------- |
| `SW_KEEPALIVE`       | service worker | Offscreen mantém o worker acordado                   |
| `browser:stop`       | service worker | Botão Parar na página                                |
| `permission:respond` | service worker | Resposta do modal do painel                          |
| `PLAY_NOTIFICATION`  | offscreen      | Toca o aviso sonoro                                  |
| `ENCODE_GIF`         | offscreen      | Codifica quadros; responde `{ data }` ou `{ error }` |

## Content script

| Mensagem           | Direção     | Campos         | Efeito                                 |
| ------------------ | ----------- | -------------- | -------------------------------------- |
| `indicator:show`   | SW → página | —              | Monta moldura e botão Parar            |
| `indicator:hide`   | SW → página | —              | Remove o indicador                     |
| `indicator:status` | SW → página | `text`, `busy` | Atualiza rótulo e animação             |
| `indicator:cursor` | SW → página | `x`, `y`       | Move o cursor fantasma                 |
| `browser:stop`     | página → SW | —              | Aborta execuções e interrompe a sessão |

## Alarmes

| Alarme      | Período | Ação                                                                     |
| ----------- | ------- | ------------------------------------------------------------------------ |
| `keepalive` | 30 s    | Garante o offscreen, reconecta o relay e reabre o SSE se estiver offline |
