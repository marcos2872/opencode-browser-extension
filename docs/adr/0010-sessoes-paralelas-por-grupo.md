# 0010 — Sessões paralelas por grupo de abas

## Status

aceito

## Contexto

A extensão mantinha uma única conversa materializada: `activeSessionID`,
`messages`, `forms`, `busy` e `statusMessage` eram variáveis de módulo do
service worker e `selectSession` apagava o estado anterior. O stream SSE é único
e traz eventos de todas as sessões, mas os eventos de sessões que não estavam no
painel eram descartados. O `TabGroups` já associava cada sessão a um grupo, e o
relay já correlacionava chamadas concorrentes por `id`, mas nenhum listener de
foco existia para ligar o grupo em foco à conversa exibida.

## Decisão

1. O estado vivo de cada conversa passa a ficar em `SessionStates`
   (`src/background/sessionState.ts`), um cache com limite de quatro sessões que
   preserva a exibida e as ocupadas. Todos os eventos SSE são roteados para o
   estado da sessão que os originou; só a sessão exibida gera snapshot completo,
   as demais publicam `sessions:meta` (`busy`/`unread`).
2. `selectSession` não descarta mais o estado das outras sessões; hidrata apenas
   quando a sessão ainda não foi carregada.
3. Requisições da UI aceitam `sessionID` opcional (`prompt`, `command`,
   `interrupt`, `session:model`, `session:agent`, `tabs:attach-current`), com
   fallback para a sessão exibida.
4. `interrupt` e `toolAborts` passam a ser por sessão; o botão Parar do content
   script resolve a sessão pelo grupo da aba de origem.
5. `chrome.tabs.onActivated` e `chrome.windows.onFocusChanged` (com debounce)
   resolvem `aba → grupo → sessão` e trocam a conversa exibida quando
   `followTabGroups` está ligado. A troca de conversa nunca move o foco do
   navegador, o que evita ciclos de ativação.
6. O título do grupo passa a ser `OpenCode · <nome da sessão>`, e excluir uma
   sessão libera o grupo (fecha abas em branco e desagrupa as demais).
7. O grupo continua **lazy por padrão**: nasce quando o agente usa o navegador
   ou quando o usuário anexa uma aba. `autoGroupNewSessions` (padrão `false`)
   permite criar o grupo junto com a conversa, usando a janela do painel para
   não abrir a aba na janela errada.

## Consequências

- (+) É possível rodar várias conversas ao mesmo tempo, cada uma no seu grupo,
  e alternar entre elas apenas trocando de aba.
- (+) Sessões em segundo plano continuam streamando e sinalizam conclusão.
- (+) Permissões e "Parar" deixam de ser globais.
- (−) O cache é de leitura: se o service worker dormir, o histórico é rebuscado
  do OpenCode na próxima seleção.
- (−) `chrome.storage.session` não sobrevive ao fechamento do navegador; o
  vínculo sessão↔grupo se perde em um restart completo e `cleanup` libera os
  grupos órfãos.
- (−) O painel é global: duas janelas mostram a mesma conversa. Suporte a uma
  conversa por janela exigiria painel por aba (`sidePanel.setOptions({ tabId })`).
