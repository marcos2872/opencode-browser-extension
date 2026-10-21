# 0007 — `find` heurístico com ranking opcional por modelo

## Status

aceito

## Contexto

Buscar elementos por linguagem natural ("o botão de enviar do formulário") é
muito mais útil que exigir seletores exatos, mas fazer isso bem normalmente
depende de uma chamada de modelo — o que adiciona custo e latência a cada busca.

## Decisão

Implementar uma heurística local que pontua elementos por papel, nome, tipo e
valor, e oferecer um modo opcional (`findMode: "model"`) que envia os candidatos
ao modelo do OpenCode via `POST /api/experimental/generate` e usa os refs
escolhidos. Se a chamada falhar (modelo gratuito recusando, rede, etc.), a
heurística assume.

## Consequências

- (+) Funciona offline e sem custo por padrão.
- (+) Melhora a precisão quando o usuário aceita gastar tokens.
- (+) A resposta traz `metadata.rankedByModel` para deixar claro o que foi usado.
- (−) A heurística erra em páginas densas ou com nomes ambíguos.
- (−) O modo com modelo depende de um endpoint experimental da API.
