---
name: open-pr
description: Padroniza a abertura de Pull Requests de contribuição neste projeto por fork, revisando o diff e as verificações antes de preparar título e descrição em português.
---

# Abrir Pull Request

Use este fluxo quando o usuário pedir para abrir, preparar ou revisar uma PR de
contribuição para este repositório.

## Regras

- A branch base deste projeto é `main` e exige PR antes do merge.
- Contribuições externas usam o fluxo de fork: `origin` aponta para o fork e
  `upstream` para `marcos2872/opencode-browser-extension`.
- Não crie fork, não configure remotes e não faça `git push` automaticamente.
  Se a branch ainda não estiver publicada no fork, explique e peça autorização
  explícita antes de sugerir ou executar o push.
- Nunca faça force-push.
- Não abra PR sem apresentar título e corpo completos e receber confirmação
  explícita do usuário.
- Não invente resultados de testes. Indique os checks que foram executados e os
  que ficaram pendentes.
- Nunca inclua segredos, tokens, dados pessoais ou conteúdo sensível na PR.

## Fluxo

1. Confirme que `gh` está instalado e autenticado com `gh auth status`. Se não
   estiver, pare e peça ao usuário para autenticar.
2. Confira branch, estado do working tree e remotes com `git status --short
   --branch` e `git remote -v`. Não altere arquivos nem remotes como parte deste
   fluxo.
3. Confirme o fork (`origin`) e o repositório original (`upstream`). Se não
   houver um fork remoto ou o repositório original não puder ser identificado,
   pergunte ao usuário; não presuma nem crie um fork.
4. Atualize somente a referência remota com `git fetch upstream main`. Se o
   fetch falhar, pare e peça ao usuário para conferir o remote. Recuse criar uma
   PR a partir de `main`; confirme que a branch de contribuição tem commits
   sobre `upstream/main` e revise o diff com `git diff upstream/main...HEAD`.
5. Se o working tree tiver alterações não commitadas, deixe claro que elas não
   fazem parte dos commits da PR. Não as inclua nem faça commit sem pedido.
6. Confira se já existe uma PR para o mesmo head/base antes de propor outra:

   ```bash
   gh pr list --repo marcos2872/opencode-browser-extension \
     --head "<dono-do-fork>:<branch>" --base main --state open
   ```

   Se houver PR existente, mostre a URL e pergunte se o usuário quer atualizá-la
   ou apenas revisar a descrição.
7. Prepare o título em português, curto e específico, preferencialmente no
   formato Conventional Commits (`feat(escopo): ...`, `fix(escopo): ...` ou
   `docs(escopo): ...`). Use este corpo:

   ```markdown
   ## Resumo
   <resultado e motivação>

   ## Mudanças
   - <mudança principal>

   ## Validação
   - <comandos executados e resultados>

   ## Observações
   - <limitações, riscos ou dependências; omita se não houver>
   ```

8. Apresente título, base (`main`), head (`dono-do-fork:branch`), estado de
   rascunho e corpo completo. Aguarde confirmação explícita.
9. Somente após confirmação, crie a PR no repositório original. Use
   `gh pr create --repo marcos2872/opencode-browser-extension --base main
   --head "<dono-do-fork>:<branch>" --title "..." --body-file <arquivo>`.
   Acrescente `--draft` apenas se o usuário pedir uma PR em rascunho. Se a
   branch não estiver publicada, não tente deixar `gh` fazer push por conta
   própria.
10. Confirme a criação e informe número, título e URL retornados pelo GitHub.
