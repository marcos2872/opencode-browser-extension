# Erros

## Erros de pareamento e conexão

| Mensagem | Causa | Resolução |
|---|---|---|
| `Link inválido. Cole o link completo exibido por opencode pair.` | Texto sem URL válida | Copie o link completo |
| `O link não contém /auth/connect/<código>.` | URL de outra rota | Rode `opencode pair` de novo |
| `Link expirado ou já usado. Rode opencode pair novamente.` | Código consumido ou fora dos 5 min | Gere um novo link |
| `O servidor não devolveu um token de sessão.` | Resposta inesperada | Verifique a versão do OpenCode |
| `Não foi possível falar com o OpenCode em <url>. Ele está rodando?` | Servidor parado ou porta errada | `opencode service status` e repareie |
| `OpenCode não configurado.` | Nenhum pareamento feito | Conclua o onboarding |

## Erros do relay

| Mensagem | Causa | Resolução |
|---|---|---|
| `A extensão OpenCode Browser não está conectada.` | Nenhum socket ativo | Abra o side panel e verifique o status do plugin |
| `A extensão não respondeu em 180s.` | Ferramenta travada ou extensão suspensa | Verifique a página e tente de novo |
| `Execução cancelada.` | Botão Parar ou cancelamento do OpenCode | Esperado |
| `Relay HTTP 403.` | Token do arquivo não confere | Apague `/tmp/opencode-browser-relay.token` e recarregue o plugin |
| `Relay HTTP 503.` | Servidor respondeu sem socket da extensão | Reconecte o painel |
| `não foi possível abrir o relay em nenhuma porta candidata` | 8799–8802 ocupadas | Libere uma porta ou reinicie o OpenCode |

## Erros de página e ferramentas

| Mensagem | Causa | Resolução |
|---|---|---|
| `A aba está em "about:blank". Use navigate...` | Aba em branco | Navegue primeiro |
| `Não foi possível preparar a página... chrome:// ...` | Página interna ou Web Store | Use páginas http(s) |
| `A ref <x> está dentro de um iframe e não tem coordenadas...` | Coordenada pedida para ref de iframe | Use `ref` em click/type/form_input |
| `Ref <x> não encontrada.` | Ref expirada após navegação | Rode `read_page` de novo |
| `A aba <id> não pertence ao grupo desta sessão.` | Aba fora do grupo | `tabs_context` ou `tabs_attach` |
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
| `409` | Conflito | Prompt concorrente na sessão |
| `500` | Erro interno | Falha inesperada do relay |
| `503` | Indisponível | Extensão desconectada ou recurso do OpenCode desligado |
