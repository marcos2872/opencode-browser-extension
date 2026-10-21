# 0005 — CDP para input e screenshot com fallback para eventos de DOM

## Status

aceito

## Contexto

Muitos sites ignoram eventos sintéticos (`element.click()`, `dispatchEvent`) por
não serem confiáveis. Screenshots, console e rede também exigem um canal mais
profundo que `chrome.scripting`. Por outro lado, o `chrome.debugger` mostra uma
faixa de aviso e não anexa com o DevTools aberto.

## Decisão

Usar `chrome.debugger` + CDP para o que precisa de confiança ou de dados
profundos:

| Recurso | Comando CDP |
|---|---|
| Cliques e digitação | `Input.dispatchMouseEvent`, `Input.dispatchKeyEvent`, `Input.insertText` |
| Screenshots | `Page.captureScreenshot` |
| JavaScript | `Runtime.evaluate` |
| Console | `Runtime.consoleAPICalled`, `Runtime.exceptionThrown` |
| Rede | `Network.requestWillBeSent`, `Network.responseReceived` |

Para leitura e preenchimento de formulários, usar `chrome.scripting` com a API do
content script. Se o CDP não conseguir anexar (DevTools aberto) e houver uma
`ref`, click/hover caem para eventos de DOM; refs de iframes usam DOM por padrão.

## Consequências

- (+) Eventos confiáveis funcionam em sites exigentes.
- (+) Console/rede e screenshots com uma única dependência.
- (+) Degradação graciosa quando o DevTools está aberto.
- (−) Faixa "esta extensão está depurando este navegador" durante o uso.
- (−) Conflito conhecido com o DevTools na mesma aba.
- (−) Ações em iframes via DOM não são confiáveis para todos os sites.
