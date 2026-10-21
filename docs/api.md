# API do OpenCode usada pela extensão

A extensão fala com a API v2 local do OpenCode. A autenticação é **Basic** com o
usuário `opencode` e o token de pareamento como senha:

```
Authorization: Basic base64("opencode:<token>")
```

Quando há um diretório padrão configurado, as requisições incluem
`?directory=<caminho>`.

## Pareamento

| Método | Caminho | Autenticação | Corpo | Resposta | Erros |
|---|---|---|---|---|---|
| `GET` | `/auth/connect/{code}` | — | header `Accept: application/json` | `{ "token": "…" }` | `401` link expirado/usado |

O código vem do link gerado por `opencode pair`, tem uso único e expira em 5
minutos.

## Modelos e agentes

| Método | Caminho | Autenticação | Corpo | Resposta | Erros |
|---|---|---|---|---|---|
| `GET` | `/api/model` | Basic | — | `{ location, data: ModelInfo[] }` | `503` |
| `GET` | `/api/model/default` | Basic | — | `{ location, data: ModelInfo \| null }` | `503` |
| `GET` | `/api/agent` | Basic | — | `{ location, data: AgentInfo[] }` | — |
| `GET` | `/api/command` | Basic | — | `{ location, data: CommandInfo[] }` | — |

A extensão filtra agentes `mode: "subagent"` e `hidden: true`.

## Sessões

| Método | Caminho | Autenticação | Corpo | Resposta | Erros |
|---|---|---|---|---|---|
| `POST` | `/api/session` | Basic | `{ model?, agent?, location? }` | `{ data: SessionInfo }` | — |
| `GET` | `/api/session` | Basic | — | `{ data: SessionInfo[] }` | — |
| `DELETE` | `/api/session/{id}` | Basic | — | `204` | `404` |
| `POST` | `/api/session/{id}/model` | Basic | `{ model: ModelRef }` | `204` | `404` |
| `POST` | `/api/session/{id}/agent` | Basic | `{ agent: string }` | `204` | `404` |
| `POST` | `/api/session/{id}/prompt` | Basic | `{ text }` | `{ data }` | `400`, `404`, `409` |
| `POST` | `/api/session/{id}/command` | Basic | `{ name, text }` | `204` | `404` |
| `POST` | `/api/session/{id}/interrupt` | Basic | — | — | `404` |
| `GET` | `/api/session/{id}/context` | Basic | — | `{ data: PublicSessionMessage[] }` | `404` |

`ModelRef` é `{ id, providerID, variant? }`.

## Geração stateless

| Método | Caminho | Autenticação | Corpo | Resposta | Erros |
|---|---|---|---|---|---|
| `POST` | `/api/experimental/generate` | Basic | `{ prompt, model? }` | `{ data: { text } }` | `400`, `503` |

Usada pelo `find` no modo `model` para ranquear elementos. Modelos gratuitos
podem recusar a chamada; nesse caso a extensão cai para a heurística.

## Stream de eventos

| Método | Caminho | Autenticação | Resposta |
|---|---|---|---|
| `GET` | `/api/event` | Basic (opcional na prática) | SSE `text/event-stream` |

Formato dos frames: `data: {json}\n\n`. A extensão reconecta automaticamente. Os
eventos consumidos estão em [events.md](events.md).

## Exemplos

```bash
BASE=http://127.0.0.1:49374
BASIC=$(printf 'opencode:%s' "$TOKEN" | base64 -w0)

# modelos
curl -s -H "Authorization: Basic $BASIC" "$BASE/api/model" | jq '.data[0]'

# criar sessão
curl -s -X POST -H "Authorization: Basic $BASIC" -H 'content-type: application/json' \
  -d '{"model":{"id":"deepseek-v4.1-flash","providerID":"opencode-go"},"agent":"build"}' \
  "$BASE/api/session"

# enviar prompt
curl -s -X POST -H "Authorization: Basic $BASIC" -H 'content-type: application/json' \
  -d '{"text":"Resuma a página atual"}' "$BASE/api/session/$SID/prompt"

# stream
curl -N -H "Authorization: Basic $BASIC" "$BASE/api/event"
```
