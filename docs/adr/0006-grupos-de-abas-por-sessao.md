# 0006 — Grupos de abas por sessão

## Status

aceito

## Contexto

Um agente que abre e fecha abas livremente bagunça o navegador do usuário, e
ferramentas que enxergam todas as abas podem agir em contextos errados (inclusive
bancos e e-mails abertos por acaso).

## Decisão

Cada sessão do OpenCode ganha um grupo de abas do Chrome com o título `OpenCode`,
uma aba principal e as demais abas criadas pelo agente. As ferramentas resolvem a
aba alvo apenas dentro do grupo; abas fora dele precisam ser anexadas
explicitamente (`tabs_attach`, com permissão). Na inicialização, grupos sem
sessão correspondente são desfeitos.

## Consequências

- (+) Isolamento claro: o agente só toca no que está no grupo.
- (+) O usuário vê visualmente onde o agente está trabalhando.
- (+) Fechar o grupo encerra o contexto daquela sessão.
- (−) O usuário precisa anexar manualmente a aba que já estava aberta.
- (−) Anexar move a aba do grupo original do usuário.
- (−) Anexar aba de outra janela é recusado (ver ADR 0009): `chrome.tabs.group`
      moveria a aba para a janela do grupo.
