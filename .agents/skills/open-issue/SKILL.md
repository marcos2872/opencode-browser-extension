---
name: open-issue
description: Padroniza a abertura de issues de bug, melhoria, funcionalidade, tarefa ou documentação neste projeto, verificando duplicatas e labels antes de publicar.
---

# Abrir issue

Use este fluxo quando o usuário pedir para registrar um bug, uma melhoria, uma
funcionalidade, uma tarefa ou uma pendência de documentação no GitHub.

## Regras

- Escreva títulos e descrições em português brasileiro, objetivos e verificáveis.
- Não invente comportamento esperado, passos de reprodução, impacto ou dados de
  ambiente. Pergunte o que estiver faltando.
- Não inclua tokens, senhas, informações pessoais ou logs com segredos.
- Verifique labels existentes; nunca invente ou crie labels automaticamente.
- Não publique uma issue sem apresentar o título, o corpo e as labels propostas
  e receber confirmação explícita do usuário.

## Fluxo

1. Confirme o repositório e verifique a autenticação com `gh auth status`. Se a
   CLI não estiver autenticada, pare e peça ao usuário para autenticar.
2. Classifique a solicitação como **bug**, **melhoria/funcionalidade**,
   **tarefa** ou **documentação**. Se não estiver claro, pergunte antes de
   redigir.
3. Busque issues abertas e fechadas potencialmente duplicadas usando termos
   específicos do problema. Por exemplo:

   ```bash
   gh issue list --repo marcos2872/opencode-browser-extension \
     --state all --search "<termos principais>"
   ```

   Se encontrar uma issue semelhante, mostre número e URL e pergunte se deve
   comentar nela em vez de abrir outra.
4. Leia as labels disponíveis com:

   ```bash
   gh label list --repo marcos2872/opencode-browser-extension
   ```

   Proponha somente labels que existam no repositório. Se não houver uma label
   apropriada, deixe a lista vazia.
5. Redija o corpo conforme o tipo:

   **Bug**

   ```markdown
   ## Problema
   <o que aconteceu>

   ## Como reproduzir
   1. ...

   ## Resultado esperado
   <comportamento esperado>

   ## Ambiente
   <versões relevantes e sistema operacional>
   ```

   **Melhoria ou funcionalidade**

   ```markdown
   ## Problema ou necessidade
   <quem precisa e por quê>

   ## Proposta
   <resultado desejado, sem impor uma solução técnica sem necessidade>

   ## Critérios de aceite
   - [ ] <resultado verificável>
   ```

   **Tarefa ou documentação**

   ```markdown
   ## Objetivo
   <resultado verificável>

   ## Escopo
   - <entrega>

   ## Critérios de aceite
   - [ ] <condição de conclusão>
   ```

6. Apresente título, tipo, labels e corpo completos. Aguarde confirmação
   explícita antes de executar qualquer comando de criação.
7. Após confirmação, crie a issue com `gh issue create --repo
   marcos2872/opencode-browser-extension --title "..." --body-file <arquivo>`;
   passe `--label` apenas para labels existentes e aprovadas pelo usuário.
8. Confirme a criação e informe número, título e URL retornados pelo GitHub.
