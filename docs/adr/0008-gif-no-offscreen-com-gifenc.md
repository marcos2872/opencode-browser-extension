# 0008 — GIF codificado no offscreen com `gifenc`

## Status

aceito

## Contexto

Gravar as ações do agente como GIF ajuda a demonstrar e revisar o que aconteceu.
Codificar GIF no service worker não é possível (sem canvas) e adicionar um
worker dedicado aumentaria a complexidade.

## Decisão

Capturar um screenshot após cada ação enquanto a gravação estiver ativa (fila com
limite de 30 quadros) e codificar no **documento offscreen**, que já existe para
keepalive e som. O offscreen decodifica os PNGs, redimensiona para até 800 px,
desenha o rótulo da ação e usa `gifenc` (quantize + applyPalette) para gerar o
arquivo, salvo via `chrome.downloads`.

## Consequências

- (+) Reaproveita um documento já existente; nenhum worker novo.
- (+) GIF leve (paleta por quadro) e com contexto visual da ação.
- (+) O resultado também volta como imagem para o card da ferramenta.
- (−) Screenshots após cada ação adicionam latência durante a gravação.
- (−) Limite de 30 quadros e 800 px mantém memória e tamanho sob controle.
- (−) GIFs de páginas longas ficam com texto pequeno.
