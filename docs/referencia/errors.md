# Erros

## Estado de conexão no painel

Quando a configuração existe mas o servidor do OpenCode não está respondendo, o
side panel mostra um banner persistente com a causa e o próximo passo:

| Texto | Causa (`connection.failure`) | Ação do banner |
|---|---|---|
| `O OpenCode não está respondendo` | `unreachable` | Iniciar `opencode serve` e clicar em **Tentar novamente** |
| `O OpenCode demorou demais para responder` | `timeout` | Reiniciar o OpenCode e **Tentar novamente** |
| `Token do OpenCode inválido ou expirado` | `unauthorized` | Rodar `opencode pair` e abrir as configurações |
| `O OpenCode respondeu com erro` | `server_error` | Conferir o log do servidor e **Tentar novamente** |
| `A conexão com o OpenCode foi encerrada` | `stream_closed` | **Reconectar**; se persistir, reiniciar o OpenCode |
| `Conectando ao OpenCode…` | `connecting` | Nenhuma; aguardar a tentativa em andamento |

O botão **Tentar novamente** envia `connection:reconnect`. Enquanto o backend não
está `online`, o campo de mensagem fica bloqueado com o motivo no placeholder —
o texto digitado não é perdido.

O rodapé do campo mostra o estado do plugin (`ferramentas conectadas` /
`ferramentas offline`). O estado do plugin é independente do estado da API: o
chat funciona sem ele, mas as ferramentas do navegador não.

## Erros de pareamento e conexão

| Mensagem | Causa | Resolução |
|---|---|---|
| `Link inválido. Cole o link completo exibido por opencode pair.` | Texto sem URL válida | Copie o link completo |
| `O link não contém /auth/connect/<código>.` | URL de outra rota | Rode `opencode pair` de novo |
| `Link expirado ou já usado. Rode opencode pair novamente.` | Código consumido ou fora dos 5 min | Gere um novo link |
| `O servidor não devolveu um token de sessão.` | Resposta inesperada | Verifique a versão do OpenCode |
| `Não foi possível falar com o OpenCode em <url>. Ele está rodando?` | Servidor parado ou porta errada | Inicie `opencode serve` e use **Tentar novamente** no banner |
| `OpenCode não configurado.` | Nenhum pareamento feito | Conclua o onboarding |

## Erros do relay

| Mensagem | Causa | Resolução |
|---|---|---|
| `A extensão OpenCode Browser não está conectada.` | Nenhum socket ativo | Abra o side panel e verifique o status do plugin |
| `A extensão não respondeu em 180s.` | Ferramenta travada ou extensão suspensa | Verifique a página e tente de novo |
| `Execução cancelada.` | Botão Parar ou cancelamento do OpenCode | Esperado |
| `Relay HTTP 403.` | Token do arquivo não confere | Apague `~/.cache/opencode-browser/relay.json` (ou `$XDG_RUNTIME_DIR/opencode-browser/relay.json`) e reinicie o OpenCode |
| `Relay HTTP 503.` | Servidor respondeu sem socket da extensão, mesmo após a espera de 8 s | Reconecte o painel |
| `não foi possível abrir o relay em nenhuma porta candidata` | 8799–8802 ocupadas e nenhuma responde como relay | Libere uma porta ou reinicie o OpenCode |

### Ferramenta de fechar aba indisponível

Se o agente disser que `browser_tabs_close` não existe, o plugin/agente está
desatualizado ou colidiu com o browser nativo do OpenCode. Rode
`npm run install:plugin` + `opencode service restart` e use o nome atual
`browser_tabs_close_tab` (a extensão continua recebendo `tabs_close`).

## Erros de página e ferramentas

| Mensagem | Causa | Resolução |
|---|---|---|
| `A aba está em "about:blank". Use navigate...` | Aba em branco | Navegue primeiro |
| `Não foi possível preparar a página... chrome:// ...` | Página interna ou Web Store | Use páginas http(s) |
| `A ref <x> está dentro de um iframe e não tem coordenadas...` | Coordenada pedida para ref de iframe | Use `ref` em click/type/form_input |
| `Ref <x> não encontrada.` | Ref expirada após navegação | Rode `read_page` de novo |
| `A aba <id> não pertence ao grupo desta sessão.` | Aba fora do grupo | `tabs_context` ou `tabs_attach` |
| `A aba está em outra janela...` | `tabs_attach` de aba em janela diferente da do grupo | Abra uma aba pela sessão ou mova a aba para a janela do grupo |
| `Só é possível anexar abas http(s).` | Aba interna | Use uma aba comum |
| `O arquivo <nome> excede o limite de ~5 MB.` | Base64 grande | Reduza o arquivo |
| `Nenhum quadro gravado...` | `gif_creator export` sem `start` | Inicie a gravação antes |
| `Falha ao gerar o GIF (offscreen indisponível).` | Offscreen não subiu | Recarregue a extensão |
| `O DevTools está aberto nesta aba...` | `chrome.debugger` ocupado | Feche o DevTools |

## Erros de sessão

| Mensagem | Causa | Resolução |
|---|---|---|
| `Sessão criada sem id.` | Resposta inesperada | Verifique a versão do OpenCode |
| `Nenhuma sessão ativa.` | Ação sem sessão selecionada | Crie ou selecione uma conversa |
| `Não foi possível criar a sessão.` | Falha na API | Veja o backend/status |
| `Tente novamente (tentativa N): ...` | Retry do provedor | Aguarde ou troque o modelo |

## Códigos HTTP

| Status | Significado | Quando ocorre |
|---|---|---|
| `401` | Não autorizado | Token inválido/expirado na API do OpenCode |
| `403` | Proibido | Origem/token inválidos no relay |
| `404` | Não encontrado | Rota/tool inexistente ou sessão removida |
| `409` | Conflito | Prompt concorrente na sessão ou `id` de chamada do relay já em uso |
| `500` | Erro interno | Falha inesperada do relay |
| `503` | Indisponível | Extensão desconectada ou recurso do OpenCode desligado |
