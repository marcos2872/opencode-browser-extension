# 0002 — Pareamento por link de uso único com Basic auth

## Status

aceito

## Contexto

A extensão precisa de credenciais para falar com a API v2 do OpenCode local. Ler
arquivos de configuração do OpenCode exigiria um host de mensagens nativas
instalado no sistema; pedir a senha do serviço manualmente teria péssima
experiência e um segredo de longa duração.

## Decisão

Reutilizar o fluxo de pareamento do OpenCode: o usuário roda `opencode pair` e
cola o link no painel. A extensão troca o código de uso único (validade de 5
minutos) por um token de sessão via `GET /auth/connect/{code}` com
`Accept: application/json` e passa a autenticar com
`Authorization: Basic base64("opencode:<token>")`.

## Consequências

- (+) Nenhum host nativo para instalar; nenhum arquivo do sistema é lido.
- (+) O link já carrega a porta atual do serviço, tolerando mudanças de porta.
- (+) O token pode ser revogado trocando o pareamento.
- (−) O usuário precisa copiar um link a cada nova conexão.
- (−) O token fica no `chrome.storage.local`; o modelo de ameaça assume a conta
  do usuário como confiável (ver [security.md](../security.md)).
