# 0009 — Ações do agente não roubam o foco do usuário

## Status

aceito

## Contexto

Criar o grupo da sessão, abrir abas e anexar abas usava `active: true` em
`chrome.tabs.create`/`tabs.update`, e o popup de permissão abria com
`focused: true`. O efeito era a extensão trocar a aba ativa — e, às vezes, trazer
a janela do Chrome para frente — enquanto o usuário trabalhava em outra aba ou em
outro aplicativo, inclusive quando o agente era acionado pelo plugin/CLI.

## Decisão

- Nenhuma ação do agente ativa abas ou janelas por padrão. `ensure()`, `addTab()`
  e `createTab()` criam e reaproveitam abas em segundo plano.
- Toda ativação passa por `background/focus.ts → activateTab()`, que consulta
  `bringTabsToFront` (padrão `false`) e loga o motivo.
- Para agir sem ativar, o CDP ativa `Emulation.setFocusEmulationEnabled` por
  documento (reaplicado após navegação) antes de enviar `Input.*`.
- O pedido de permissão vira um modal dentro do side panel. Sem UI, som +
  notificação avisam; o clique (gesto) abre o painel, que recebe o pedido pendente
  e mostra o modal. O popup `permission.html` foi removido.
- Anexar aba de outra janela é recusado, porque `chrome.tabs.group` move a aba
  para a janela do grupo.
- `cleanup()` nunca fecha a aba ativa; ela é apenas desagrupada.

## Consequências

- (+) O usuário não é interrompido por troca de aba/janela durante a execução.
- (+) O comportamento é previsível e configurável (`bringTabsToFront`).
- (−) Abas criadas pelo agente ficam em segundo plano até o usuário abrir o grupo.
- (−) `screenshot`/`gif_creator` dependem de aba renderizada: grupos colapsados
  são expandidos antes da captura e há fallback para `fromSurface: false`.
- (−) Anexar abas entre janelas exige ação manual do usuário.
