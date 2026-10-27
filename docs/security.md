# Segurança

## Autenticação com o OpenCode

| Esquema | Detalhes | Onde se aplica |
|---|---|---|
| Pareamento por link | `opencode pair` gera um código de uso único com validade de 5 minutos; a extensão troca por um token de sessão | `GET /auth/connect/{code}` |
| Basic auth | `Authorization: Basic base64("opencode:<token>")` em todas as chamadas | API v2 local |

O token fica apenas em `chrome.storage.local` do navegador e nunca é enviado a
outro host que não seja o `baseUrl` configurado (loopback por padrão).

## Isolamento do relay

| Proteção | Implementação |
|---|---|
| Escuta local | O servidor do plugin sobe em `127.0.0.1` (nunca `0.0.0.0`) |
| Origem | O upgrade WebSocket só é aceito de `chrome-extension://<ID fixo>` |
| Handshake | O socket só vira ativo depois de um `hello` válido; socket não autenticado não recebe `ready` nem responde `tool_result` |
| Token compartilhado | `$XDG_RUNTIME_DIR/opencode-browser/relay.json` ou `~/.cache/opencode-browser/relay.json` (pasta `0700`, arquivo `0600`); exigido no header `x-relay-token` do fallback HTTP |
| Host | `/health`, `/tool` e `/cancel` recusam `Host` que não seja loopback na porta do servidor (DNS rebinding) |
| Timeout | Chamadas expiram em 180 s; prompts de permissão em até 5 min (configurável) |
| Cancelamento | `/cancel` e a mensagem `cancel` abortam execuções pendentes |

O ID fixo vem da `key` no manifest. Para trocar, ajuste
`OPENCODE_BROWSER_EXTENSION_ID` no plugin; liberar qualquer extensão
(`OPENCODE_BROWSER_ALLOW_ANY_EXTENSION=1`) enfraquece a proteção e não é
recomendado. O `hello` também aceita um segredo opcional
(`OPENCODE_BROWSER_WS_SECRET`), mas a extensão atual não o envia: use apenas com
uma extensão adaptada. O token do fallback HTTP fica em pasta privada, com
checagem de dono e permissões; um processo de outro usuário não consegue lê-lo
nem plantar um arquivo falso em `/tmp`.

## Permissões de ação

| Modo | Comportamento |
|---|---|
| `ask` | Pede na primeira ação de cada domínio |
| `allow` | Executa sem perguntar, respeitando a lista de bloqueio |
| `deny` | Bloqueia ações; apenas leitura |

| Decisão | Abrangência |
|---|---|
| Permitir uma vez | Só aquela execução |
| Permitir nesta sessão | Allowlist em memória até o navegador fechar |
| Permitir sempre | Allowlist persistente (`permissions.allow`) |
| Negar / timeout | Execução recusada |

Ferramentas de leitura (`tabs_context`, `read_page`, `find`, `get_page_text`,
`read_console_messages`, `read_network_requests`, `tabs_create`) executam sem
prompt. Ações que mudam a página, navegam, fecham/aneixam abas, executam
JavaScript, enviam arquivos ou exportam GIF pedem confirmação. O fechamento de
aba aparece como `browser_tabs_close_tab` no modelo e chega ao service worker
como `tabs_close`.

O `update_plan` mostra domínios e passos antes de qualquer navegação; domínios
aprovados entram na allowlist da sessão.

## Isolamento de abas

- Cada sessão do OpenCode tem um grupo de abas próprio (`OpenCode`).
- As ferramentas só enxergam abas desse grupo.
- Anexar uma aba existente exige confirmação e remove a aba do grupo atual do
  usuário.

## Privacidade e dados

| Dado | Destino |
|---|---|
| Conversa e prompts | Servidor local do OpenCode (e provedor de modelo configurado por ele) |
| Token de pareamento | `chrome.storage.local` + header Basic para o loopback |
| Screenshots e GIF | Resultado de ferramenta; o GIF é salvo em Downloads |
| Console/rede | Buffers em memória por aba, limpos ao trocar de domínio |
| Configuração e listas | `chrome.storage.local` |

Nada é enviado para servidores externos da extensão: não há telemetria.

## Redação de dados sensíveis

A árvore de acessibilidade omite valores de campos de senha, `hidden` e
`autocomplete` de cartão/autenticação (`current-password`, `cc-number`,
`one-time-code` etc.), exibindo `[value redacted]`.

## Riscos e recomendações

| Risco | Recomendação |
|---|---|
| Injeção de prompt em páginas | Mantenha `ask`; o prompt do agente trata conteúdo de página como dado, nunca instrução |
| Screenshots de conteúdo privado | Evite usar em saúde, bancos e similares |
| Faixa de depuração do Chrome | Esperado com `chrome.debugger`; feche o DevTools ao usar |
| Permissões amplas (`<all_urls>`, `debugger`) | Instale apenas builds que você mesmo compilou |
| Arquivo de token | Fica em pasta privada (`0700`) com arquivo `0600`; o relay confere dono e permissões |
| Prompt de permissão ignorado | Timeout nega automaticamente (padrão 60 s) |

## Modelo de ameaça

Assume-se que o OpenCode local e os processos do mesmo usuário são confiáveis.
O relay protege contra páginas web, outras extensões e processos de outros
usuários (token privado + `Host`/`Origin` + `hello`). Um processo local rodando
como o mesmo usuário ainda pode ler o token e se passar pela extensão; para
separar esse caso seria preciso um segredo compartilhado no `hello`
(`OPENCODE_BROWSER_WS_SECRET`) e uma extensão que o envie.
