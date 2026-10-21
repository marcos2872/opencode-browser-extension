# 0004 — Permissões por ação e domínio com popup dedicado

## Status

aceito

## Contexto

Um agente que clica, digita e executa JavaScript em páginas reais tem poder
destrutivo e é alvo de injeção de prompt. Aprovar tudo de uma vez seria
irresponsável; pedir confirmação a cada ação tornaria o uso inviável.

## Decisão

Modelar permissões em três eixos:

1. **Modo:** `ask` (padrão), `allow` e `deny`.
2. **Abrangência:** uma vez, nesta sessão ou sempre (allowlist persistente), além
   de uma lista de bloqueio.
3. **Leitura x ação:** ferramentas de leitura executam direto; ações que mudam a
   página pedem confirmação.

Quando o painel está aberto, o pedido aparece como card no próprio chat; quando
está fechado, abre um popup dedicado (`permission.html`) que fecha ao responder.
Um timeout (padrão 60 s, configurável) nega automaticamente.

## Consequências

- (+) O usuário controla o que o agente faz, domínio a domínio.
- (+) O popup permite usar o agente com o painel fechado.
- (+) Planos de navegação podem liberar domínios em lote (`update_plan`).
- (−) Aprovar cada domínio novo adiciona atrito na primeira visita.
- (−) Um pedido ignorado expira como negado, exigindo nova tentativa.
