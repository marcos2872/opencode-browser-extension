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
| Token compartilhado | `/tmp/opencode-browser-relay.token` com modo `0600`; exigido no header `x-relay-token` do fallback HTTP |
| Timeout | Chamadas expiram em 180 s; prompts de permissão em até 5 min (configurável) |
| Cancelamento | `/cancel` e a mensagem `cancel` abortam execuções pendentes |

O ID fixo vem da `key` no manifest. Para trocar, ajuste
`OPENCODE_BROWSER_EXTENSION_ID` no plugin; liberar qualquer extensão
(`OPENCODE_BROWSER_ALLOW_ANY_EXTENSION=1`) enfraquece a proteção e não é
recomendado.

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
JavaScript, enviam arquivos ou exportam GIF pedem confirmação.

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
| Injeção de prompt em páginas | Mantenha `ask`; nunca use `allow` em sites sensíveis |
| Screenshots de conteúdo privado | Evite usar em saúde, bancos e similares |
| Faixa de depuração do Chrome | Esperado com `chrome.debugger`; feche o DevTools ao usar |
| Permissões amplas (`<all_urls>`, `debugger`) | Instale apenas builds que você mesmo compilou |
| Arquivo de token em `/tmp` | É `0600`; outros usuários do sistema não leem |
| Prompt de permissão ignorado | Timeout nega automaticamente (padrão 60 s) |

## Modelo de ameaça

Assume-se que o OpenCode local e os processos do mesmo usuário são confiáveis.
O relay protege contra páginas web e outras extensões, não contra um processo
local malicioso que já tenha acesso à conta do usuário.
