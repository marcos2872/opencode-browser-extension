# 0003 — Plugin local com relay WebSocket e fallback HTTP

## Status

aceito

## Contexto

O agente precisa enxergar as ferramentas do navegador. As opções eram: um
servidor MCP em processo separado com host de mensagens nativas, ou um plugin
carregado pelo próprio OpenCode conversando com a extensão. Extensões não podem
abrir portas de escuta, então alguém precisa hospedar o servidor.

## Decisão

Criar o plugin `browser-relay`, carregado pelo OpenCode, que sobe um servidor em
`127.0.0.1` (portas 8799–8802), aceita somente a origem da extensão e registra as
18 ferramentas no namespace `browser`. Como o OpenCode carrega o plugin várias
vezes com estados isolados, o dono do servidor publica token e porta em um
arquivo temporário, e as demais instâncias executam via `POST /tool` autenticado
por `x-relay-token`.

## Consequências

- (+) Sem processo extra nem host nativo: o plugin vive no OpenCode.
- (+) As ferramentas aparecem nativamente ao modelo, com `codemode: false`.
- (+) O fallback HTTP torna o relay resiliente a reloads e a múltiplas instâncias.
- (+) A extensão descobre a porta ativa via `GET /health`.
- (−) Exige instalar/atualizar o plugin (`npm run install:plugin`).
- (−) Um arquivo temporário guarda token/porta (modo `0600`).
- (−) Servidores antigos podem ficar presos numa porta após reload; a descoberta
  de porta cobre esse caso até o próximo restart do OpenCode.
