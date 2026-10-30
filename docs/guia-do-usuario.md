# Guia do usuário — OpenCode Browser

Este guia percorre **todas as funcionalidades** da extensão, na ordem em que você
vai encontrar cada uma: instalar, conectar, conversar, deixar o agente mexer no
navegador, aprovar permissões, rodar várias conversas ao mesmo tempo e ajustar as
configurações.

O OpenCode Browser é um painel lateral do Chrome que conversa com o **OpenCode
Terminal** rodando na sua máquina. O agente lê páginas, clica, preenche
formulários e navega dentro de um grupo de abas isolado por conversa — e cada
ação que muda algo pede a sua permissão (ou não, conforme o modo escolhido).

**Nada sai do seu computador**: a extensão fala com `127.0.0.1`, e o plugin que
dá as ferramentas ao agente só escuta em loopback.

---

## 1. O que você precisa

| Item | Versão mínima | Observação |
|---|---|---|
| Chrome ou Chromium | 116 | A extensão usa o painel lateral (side panel) |
| Node.js | 20 | Usado só para gerar o build e instalar o plugin |
| npm | vem com o Node | — |
| OpenCode Terminal | v2 | É quem roda os modelos e as conversas |

Os modelos são os mesmos que você já usa no OpenCode: se o seu OpenCode
funciona no terminal, a extensão funciona.

---

## 2. Instalar a extensão

### 2.1 Pelo script (recomendado)

Na pasta do projeto:

```bash
./scripts/install.sh        # Linux e macOS
```

```powershell
.\scripts\install.ps1       # Windows (PowerShell 5.1+)
```


O script, nesta ordem:

1. confere se existem **Node.js 20+**, **npm** e **OpenCode v2+** (para com uma
   mensagem clara se faltar algum);
2. instala as dependências (`npm install`);
3. gera o build da extensão (`npm run build`) em `dist/`;
4. copia o plugin e o template do agente para a pasta de plugins do OpenCode
   (`npm run install:plugin`);
5. reinicia o serviço do OpenCode (`opencode service restart`);
6. espera o plugin responder em `http://127.0.0.1:8799/health`.

Se o passo 6 falhar, o próprio script avisa: abra o painel da extensão e
verifique.

> O `install.sh` reinicia o serviço do OpenCode. Se você estiver usando o
> OpenCode em um terminal, a sessão atual cai por alguns segundos e reconecta —
> não é erro.

### 2.2 Manual

```bash
npm install
npm run build
npm run install:plugin
opencode service restart
```

Depois, no Chrome:

1. abra `chrome://extensions`;
2. ligue o **modo desenvolvedor** (canto superior direito);
3. clique em **Carregar sem compactação** e escolha a pasta **`dist/`** do
   projeto (não a raiz);
4. o ícone do OpenCode Browser aparece na barra.

### 2.3 Depois de atualizar o código

O Chrome mantém o service worker em cache. Sempre que você rodar
`npm run build` de novo:

1. abra `chrome://extensions`;
2. clique em **Recarregar** no cartão da extensão.

Sem esse passo, o comportamento antigo continua no ar mesmo com o código novo.

---

## 3. Conectar a extensão ao OpenCode (pareamento)

1. Abra o painel: clique no ícone da extensão, ou use o atalho
   **Ctrl+Shift+O** (**Command+Shift+O** no macOS).
2. Na primeira vez aparece a tela **“Conecte o navegador ao OpenCode da sua
   máquina”**.
3. No terminal, rode:

   ```bash
   opencode pair
   ```

4. Copie o link exibido (é o mesmo que abre a interface web do OpenCode) e cole
   no campo **“Link do `opencode pair`”**.
5. Clique em **“Conectar ao OpenCode”**. Ao terminar aparece o aviso
   **“Conectado ao OpenCode.”**

O link é de uso único e **expira em 5 minutos**. Se expirar, rode `opencode pair`
de novo. O token anterior continua válido até você desconectar.

### Se o pareamento falhar

| Mensagem | O que fazer |
|---|---|
| “Link inválido. Cole o link completo exibido por `opencode pair`.” | Copie o link inteiro, sem cortar o código final |
| “O link precisa começar com http:// ou https://.” | Você colou só o código; cole a URL completa |
| “O link não contém /auth/connect/<código>.” | Não é um link de pareamento |
| “Não foi possível falar com o OpenCode em … Ele está rodando?” | O servidor não está no ar: rode `opencode serve` |
| “Link expirado ou já usado. Rode `opencode pair` novamente.” | Gere um link novo |
| “O servidor não devolveu um token de sessão.” | Versão do OpenCode incompatível: atualize para a v2 |

---

## 4. Instalar o plugin de ferramentas

O chat funciona só com a API — para o agente **controlar o Chrome**, ele precisa
do plugin:

```bash
npm run install:plugin
opencode service restart
```

O comando copia, para a pasta de plugins do OpenCode:

- `browser-relay.ts` — o servidor que expõe as ferramentas do navegador;
- `opencode-browser.agent.md` — o template do agente `opencode-browser`.

e cria a pasta padrão das conversas do navegador
(`~/.opencode-browser-extensions`).

Confira se está tudo certo:

```bash
curl http://127.0.0.1:8799/health
```

No painel, o rodapé do composer mostra **“ferramentas conectadas”** quando o
plugin está ativo.

### Se o plugin não conectar

| Status | Significado | O que fazer |
|---|---|---|
| “Plugin conectado” | Tudo certo | — |
| “Plugin não encontrado — instale o plugin e reinicie o OpenCode” | O plugin não foi carregado | `npm run install:plugin` + `opencode service restart` |
| “Plugin recusou a conexão — confira o ID da extensão” | A extensão não é a esperada | Recarregue a extensão ou ajuste `OPENCODE_BROWSER_EXTENSION_ID` |
| “Plugin parou de responder — reinicie o OpenCode” | O plugin travou ou o worker dormiu | Reinicie o OpenCode |
| “Plugin desconectado — reinicie o OpenCode para reconectar” | O socket caiu | Reinicie o OpenCode ou use **Reconectar plugin** nas configurações |

> Mantenha **uma única** cópia do plugin na pasta de plugins. Duas cópias
> registram o mesmo plugin e uma delas falha.

---

## 5. Conhecer a tela

O painel tem cinco regiões:

| Região | O que tem |
|---|---|
| **Cabeçalho** | Marca “OpenCode”, título da conversa, ponto de status da API (online/offline/conectando) e o botão **Configurações** |
| **Barra de conversas** | Seletor de conversas, seletor de agente, botão de abas, **+** (nova conversa) e excluir |
| **Chat** | Mensagens, raciocínio do modelo, cards de ferramentas e pedidos de permissão |
| **Composer** | Campo de texto, menu de comandos `/`, botão Enviar/Parar e o rodapé com contexto e custo |
| **Avisos** | Banner de conexão, faixa de status, cards de permissão e avisos temporários (toasts) |

### Atalhos

| Tecla | Onde | Efeito |
|---|---|---|
| **Enter** | Composer | Envia a mensagem |
| **Shift+Enter** | Composer | Quebra a linha sem enviar |
| **Enter** | Card de permissão | “Permitir uma vez” |
| **Esc** | Card de permissão | Nega o pedido e fecha o card |
| **Esc** | Modal de ferramentas | Fecha o modal |
| **Ctrl+Shift+O** / **Cmd+Shift+O** | Em qualquer aba | Abre o painel |

> O composer não tem atalho de “parar”: para interromper, use o botão **Parar**
> (o mesmo ícone aparece na página, dentro do indicador do agente).

---

## 6. Sua primeira conversa

1. Digite no campo **“Peça algo ao OpenCode...”** e pressione **Enter**.
2. A resposta aparece em streaming; enquanto o agente trabalha, o campo mostra
   **“O agente está trabalhando...”**.
3. Quando ele usa uma ferramenta, surgem os cards (veja a seção 7).
4. Se ele precisar de permissão, o card aparece sobre o painel (seção 10).

A tela vazia traz quatro sugestões prontas:

- “Abra o Hacker News e resuma as 5 principais notícias de hoje.”
- “Leia a página atual, encontre o formulário de contato e preencha com dados de teste.”
- “Investigue os erros do console e as requisições de rede desta página.”
- “Pesquise o preço de um produto em três lojas e compare em uma tabela.”

### Comandos com barra

Digite `/` (sem espaço depois) para abrir o menu de comandos. A lista vem do seu
OpenCode e mostra até 6 sugestões; escolher uma completa o campo com `/nome `.
Depois de escolher, escreva o resto e envie — por exemplo `/review corrija o
diff`.

Se você enviar `/nome` e mais nada, o comando roda sem argumentos.

### Rascunho por conversa

O texto que você digitou fica guardado **por conversa**. Trocar de conversa e
voltar não apaga o que estava escrito. Se você digitar antes de existir
conversa nenhuma, o texto acompanha a conversa que for criada.

### Contexto e custo

O rodapé do composer mostra, quando disponível:

- **“Contexto 1.234 (12%)”** — tokens da última requisição e quanto isso ocupa da
  janela do modelo;
- **“Sessão US$ 0,0000”** — custo informado pelo OpenCode.

Sem esses dados, o rodapé mostra a dica “Enter envia · Shift+Enter quebra linha”.

### Parar uma execução

Com o botão **Parar** no composer você interrompe **a conversa exibida**. Cada
conversa tem seu próprio botão: parar uma não afeta as outras.

---

## 7. O que o agente consegue fazer no navegador

O agente recebe 18 ferramentas. Algumas são só de leitura e **nunca** pedem
permissão; as outras mudam algo e passam pela sua aprovação (conforme o modo).

| Ferramenta | O que faz | Permissão |
|---|---|---|
| `browser_tabs_context` | Lista as abas do grupo da conversa | Leitura |
| `browser_tabs_create` | Abre uma URL no grupo (em segundo plano) | Leitura |
| `browser_tabs_attach` | Traz uma aba já aberta para o grupo | Pede |
| `browser_tabs_close_tab` | Fecha uma aba do grupo | Pede |
| `browser_navigate` | Navega, volta ou avança no histórico | Pede |
| `browser_read_page` | Lê a página e devolve os elementos com referências | Leitura |
| `browser_find` | Procura elementos por texto, papel ou nome | Leitura |
| `browser_get_page_text` | Extrai o texto principal, sem HTML | Leitura |
| `browser_form_input` | Preenche um campo | Pede |
| `browser_computer` | Clica, digita, pressiona teclas, rola, passa o mouse, tira screenshot, dá zoom, espera | Pede |
| `browser_javascript_tool` | Executa JavaScript na página | Pede |
| `browser_read_console_messages` | Lê o console e os erros da aba | Leitura |
| `browser_read_network_requests` | Lê as requisições de rede da aba | Leitura |
| `browser_resize_window` | Redimensiona a janela para testar layout | Sem pedido |
| `browser_update_plan` | Mostra domínios e passos para você aprovar antes | Card de plano |
| `browser_upload_image` | Envia arquivos para um campo de arquivo ou área de arrastar | Pede |
| `browser_gif_creator` | Grava quadros das ações e exporta um GIF | Exportar pede |
| `browser_batch` | Executa várias ferramentas em sequência (até 20) | Cada ação pede a sua |

### Cards de ferramenta

Cada chamada aparece no chat com um rótulo em português — “Navegar”, “Ler
página”, “Clicar na página”, “Preencher campo”, “Console”, “Rede” — e um status:
**ok**, **erro** ou **rodando**.

Você escolhe quanto detalhe quer ver em **Configurações → Ferramentas no chat**:

| Modo | Como fica |
|---|---|
| **Agrupadas (abrem em um modal)** (padrão) | Uma linha-resumo por execução (“4 ferramentas · ver”); o detalhe abre no modal “Ferramentas desta execução” |
| **Linhas compactas, uma por chamada** | Uma linha por ferramenta, com o erro resumido na própria linha |
| **Cards completos, com parâmetros e resultado** | Tudo aberto no chat, incluindo o JSON de entrada e a saída |
| **Ocultar tools e raciocínio (só “trabalhando”)** | O chat mostra só a atividade (“trabalhando: lendo a página”) |

No modo agrupado, o modal tem filtro **“Somente erros”** e fecha com **Esc** ou
clicando fora.

Screenshots aparecem como imagem dentro do card (até 3 por vez) e também são
salvas em disco: o caminho do arquivo vem na resposta do agente.

---

## 8. Abas e grupos: onde o agente trabalha

Cada conversa tem o seu **grupo de abas**, com título **“OpenCode · nome da
conversa”** e uma cor própria. É o espaço de trabalho daquele agente — ele não
mexe nas suas outras abas.

### Abas em segundo plano

Por padrão a extensão **não rouba o foco**: abas criadas ou anexadas pelo agente
nascem em segundo plano, e a janela em que você está trabalhando continua onde
está. Se você preferir ver as abas surgindo, ligue **“Permitir que abas abertas
ou anexadas pelo agente venham para frente”** nas configurações.

Na página em que o agente está agindo aparece uma moldura laranja com o aviso
**“OpenCode está nesta aba”**, um **Parar** e um cursor animado mostrando onde
ele clica.

### Conectar uma aba sua ao agente

- **Conectar aba atual** (ícone de link na barra de conversas): traz a aba ativa
  para o grupo da conversa.
- Com abas conectadas, o mesmo botão abre a lista: **“Conectar nova aba”** e, em
  cada aba, **“Remover … do contexto”**.

Remover uma aba do contexto **não fecha** a aba: apenas a tira do grupo, e ela
volta a ser uma aba normal sua.

> Abas de **outra janela** não podem ser anexadas. A extensão responde: “A aba
> está em outra janela. Abra uma aba nova pela sessão ou mova a aba para a janela
> do grupo antes de anexá-la.”

### O grupo nasce quando é preciso

Se a opção de criar grupo ao iniciar conversa estiver desligada (padrão), o grupo
aparece no primeiro uso do navegador pelo agente — ou quando você conecta uma
aba. É o fluxo mais econômico: nenhuma aba em branco acumulada.

---

## 9. Várias conversas ao mesmo tempo

Este é o ponto forte da extensão: cada conversa corre sozinha, no seu grupo de
abas, e você alterna entre elas sem parar nada.

### Criar uma conversa

Clique em **+** (Nova conversa). O botão **funciona mesmo com a conversa atual
executando** — ele só fica bloqueado durante a própria criação, para não criar
duas conversas com um clique duplo.

A conversa nova nasce vazia, com o modelo (e o agente) selecionados, e já fica
em foco no painel.

### Trocar de conversa

Use o seletor **“Sessões do OpenCode”**. Cada item mostra o nome da conversa e um
sufixo:

- **“ · executando”** — aquela conversa está rodando;
- **“ · nova resposta”** — chegou algo novo enquanto você estava em outra.

Escolher a conversa limpa o aviso de novidade.

### Seguir o grupo de abas em foco

Com **“Mostrar no painel a conversa do grupo de abas que está em foco”** ligado
(padrão), basta clicar em uma aba de um grupo: o painel troca para a conversa
daquele grupo. A troca tem uma pequena espera (150 ms) para não piscar quando
você passa por várias abas.

Criar ou selecionar uma conversa manualmente cancela essa troca automática — o
painel não vai “voltar sozinho” para outra conversa logo depois do seu clique.

### Criar o grupo junto com a conversa (opcional)

Ligando **“Criar um grupo de abas ao iniciar uma nova conversa”**, o **+** já
abre uma aba em branco (em segundo plano, na janela do painel) e o grupo com o
nome da conversa. É útil quando você quer ver a “âncora” de cada conversa na
barra de abas desde o começo; o custo é uma aba em branco por conversa.

Desligado (padrão), o grupo nasce no primeiro uso do navegador ou no anexo de uma
aba.

### Excluir uma conversa

Use a lixeira (**Excluir sessão**). A confirmação diz: “Excluir esta sessão? O
histórico será removido do OpenCode.”

Ao excluir:

- o histórico sai do OpenCode;
- o grupo é liberado: as abas em branco são fechadas e as páginas reais são
  apenas **desagrupadas** (nada seu é fechado);
- se era a conversa exibida, a mais recente passa a ser mostrada.

### Limites

- O painel mantém estado detalhado de até **4 conversas**. As demais continuam
  existindo no OpenCode e recarregam quando você as abre.
- O vínculo conversa↔grupo fica na sessão do navegador: **fechar o Chrome
  completamente** desfaz o vínculo (as abas continuam lá, sem dono).
- O painel é uma visão só: duas janelas abertas mostram a mesma conversa.

---

## 10. Permissões

### Modos

Em **Configurações → Permissões**:

| Modo | Comportamento |
|---|---|
| **Perguntar a cada site** | Pede na primeira ação em cada domínio |
| **Permitir ações automaticamente (recomendado)** (*padrão*) | Não pergunta; respeita a lista de bloqueio |
| **Bloquear ações** | Só leitura; nenhuma interação é executada |

### O que nunca pede permissão

Leitura e coisas de bastidor: listar abas, abrir aba, ler a página, buscar
elemento, extrair texto, ler console, ler rede, redimensionar janela e gravar
quadros do GIF. Também não pedem: iniciar e parar a gravação de GIF.

### O card de permissão

Quando uma ação precisa de aprovação, o card aparece **sobre o painel** e mostra:

- o host em destaque, com um ponto de alerta;
- o que será feito (“Navegar de a.com para b.com”, “Clicar na página”,
  “Preencher campo ref_3”, “Executar JavaScript na página”…);
- detalhes: título da aba, URL de destino, valor que será digitado (até 2.000
  caracteres), nomes dos arquivos;
- uma prévia (screenshot) quando existir;
- o nome da conversa, se o pedido for de **outra** conversa (“Sessão: …”).

As opções:

| Botão | Efeito |
|---|---|
| **Permitir uma vez** (Enter) | Só esta ação |
| **Permitir nesta sessão** | Libera o host enquanto essa conversa existir (guardado só em memória) |
| **Permitir sempre para exemplo.com** | Grava o host na lista de permitidos |
| **Negar** (Esc) | Recusa a ação |

Pedidos de navegação entre domínios e de plano têm botões próprios:
**Permitir** / **Permitir sempre para …** / **Recusar** e **Aprovar plano** /
**Recusar**.

O rodapé do card lembra: “Você pode revogar permissões em Configurações. O agente
nunca deve comprar, criar contas ou burlar captchas sem sua confirmação.”

### Tempo para responder

O padrão é **60 segundos**. Se você não responder, a ação é **negada**. O tempo
pode ser mudado em Configurações (30 s, 1 min, 2 min, 5 min).

### Com o painel fechado

O pedido vira **notificação do sistema** (“OpenCode Browser: aprovação
pendente”) e toca um aviso sonoro. Clicar na notificação abre o painel já com o
pedido na tela.

### Várias conversas pedindo ao mesmo tempo

Os pedidos entram numa **fila**: o da conversa que você está vendo aparece
primeiro; ao responder, o próximo entra — com o nome da conversa de origem.
Nada é perdido nem expira escondido, e ao reabrir o painel todos os pendentes
reaparecem.

> Enquanto um card está aberto ele cobre o painel, inclusive se for de outra
> conversa. Para liberar rápido, use **Esc** (nega) ou responda.

### Listas de permitidos e bloqueados

Em **Configurações → Permissões**:

- **Sites sempre permitidos (um por linha)**
- **Sites sempre bloqueados (um por linha)**

O bloqueio é avaliado **antes** de tudo: se o host está na lista de bloqueados,
nem o modo “permitir automaticamente” libera.

**O formato é só o host, minúsculo, exatamente como aparece na barra de
endereços** — sem `https://`, sem caminho, sem porta e sem curinga:

| Entrada | Funciona? | Por quê |
|---|---|---|
| `github.com` | Sim | É o host |
| `docs.github.com` | Sim | Subdomínio é outro host (precisa de linha própria) |
| `localhost` | Sim | Host sem porta |
| `https://github.com` | Não | O esquema não faz parte do host |
| `github.com/repo` | Não | Caminho não faz parte do host |
| `*.github.com` | Não | Não existe curinga |
| `GitHub.com` | Não | A comparação diferencia maiúsculas |

Cada linha é comparada por igualdade. Digitar `https://…` não dá erro na tela,
mas **não tem efeito** — vale a pena conferir depois de salvar.

---

## 11. Quando o agente faz uma pergunta

Além de permissões, o agente pode pedir uma **resposta** sua — uma escolha, um
número, um sim/não. Isso aparece como um card no chat, com o título da pergunta e
o status “aguardando”.

Os campos possíveis são: texto livre, número, sim/não, escolha única, múltipla
escolha (com a opção “Outra resposta”) e link externo. Campos obrigatórios
precisam ser preenchidos para liberar o botão.

- **Responder** — envia sua resposta e o agente continua;
- **Cancelar** — encerra a pergunta sem resposta (sem confirmação).

Com o painel fechado, chega uma notificação: “O agente precisa de uma resposta:
…”.

---

## 12. Configurações

Abra pelo botão **Configurações** no cabeçalho do painel.

### Conexão

| Campo / botão | Para que serve |
|---|---|
| **Link do `opencode pair`** + **Conectar** | Aparece só quando não há pareamento; cola o link e conecta |
| **Servidor** | Mostra o endereço, só leitura |
| **Token** | Mostra os primeiros e últimos caracteres, só leitura |
| **Abrir painel** | Abre o painel lateral na janela atual |
| **Reconectar** | Reconecta à API do OpenCode |
| **Reconectar plugin** | Reconecta ao plugin das ferramentas |
| **Desconectar** | Remove o token (pede confirmação) |

Duas linhas de status: **API:** (online, conectando, não configurada ou o motivo
do offline) e **Ferramentas:** (estado do plugin).

### Conversas e modelo

| Campo | Padrão | Efeito |
|---|---|---|
| **Pasta das conversas do navegador** | `~/.opencode-browser-extensions` | Só lista conversas dessa pasta |
| **Modelo padrão** (+ variante) | modelo padrão do servidor | Modelo das novas conversas; modelos sem ferramentas aparecem como “(sem tools)” |
| **Agente padrão** | `build` | Usado quando o agente do navegador está desligado |
| **Usar o agente `opencode-browser` nas novas sessões** | ligado | Novas conversas nascem no agente que sabe usar o navegador |
| **Mostrar no painel a conversa do grupo de abas que está em foco** | ligado | O painel segue o grupo da aba em foco |
| **Criar um grupo de abas ao iniciar uma nova conversa** | desligado | O **+** já cria grupo e aba em branco |
| **Permitir que abas abertas ou anexadas pelo agente venham para frente** | desligado | Ligado, a extensão passa a ativar abas |

### Permissões

| Campo | Padrão | Efeito |
|---|---|---|
| Modo (perguntar / permitir / bloquear) | permitir | Ver seção 10 |
| **Tempo para responder a um pedido** | 1 minuto | Depois disso, a ação é negada |
| **Busca por elemento** | Heurística (grátis) | A opção “Modelo do OpenCode” usa tokens no `find` |
| Sites sempre permitidos / bloqueados | vazio | Listas de host, uma por linha |

### Avisos e exibição

| Campo | Padrão | Efeito |
|---|---|---|
| **Tocar um aviso sonoro quando o agente terminar ou pedir permissão com o painel fechado** | ligado | Bipe curto |
| **Mostrar notificação do sistema quando o agente terminar com o painel fechado** | ligado | Notificação do Chrome |
| **Ferramentas no chat** | Agrupadas | Agrupadas, linhas compactas, cards completos ou ocultar |

Os botões **Salvar** (modelo/agente) e **Salvar permissões** gravam as
alterações; o aviso **“Permissões salvas.”** confirma.

---

## 13. Avisos e sinais

| Sinal | O que significa |
|---|---|
| **Badge “!”** no ícone | Falta configurar o pareamento |
| **Badge com número** | Quantas conversas têm novidade (no máximo 9) |
| **Ponto verde/vermelho/âmbar** no cabeçalho | API online, offline ou conectando |
| **Banner de conexão** | Explica a falha e oferece **Tentar novamente**, **Reconectar** ou **Abrir configurações** |
| **Faixa de status** abaixo do chat | Tentativas de reconexão e mensagens do backend |
| **Moldura laranja na página** | O agente está agindo naquela aba; tem botão **Parar** |
| **“ferramentas conectadas” / “ferramentas offline”** | Estado do plugin no rodapé do composer |
| **Som + notificação** | Algo aconteceu com o painel fechado (fim de execução, permissão, pergunta) |
| **Aviso temporário no rodapé** | Confirmação ou erro de uma ação sua |

---

## 14. Problemas comuns

| Sintoma | Causa provável | O que fazer |
|---|---|---|
| Painel diz que o OpenCode não está respondendo | Servidor parado | Rode `opencode serve` e clique em **Tentar novamente** |
| “Token do OpenCode inválido ou expirado” | Token revogado ou trocado | `opencode pair` e cole o link novo nas configurações |
| “O OpenCode demorou demais para responder” | Servidor travado | Reinicie o OpenCode |
| Ferramentas offline | Plugin não instalado ou serviço antigo em memória | `npm run install:plugin` + `opencode service restart` |
| “Plugin recusou a conexão” | ID da extensão diferente do esperado | Recarregue a extensão; se persistir, ajuste `OPENCODE_BROWSER_EXTENSION_ID` |
| O agente não acha `browser_tabs_close` | Nome reservado por outro plugin | Use `browser_tabs_close_tab` e reagende as ferramentas |
| Mudança no código não aparece | Service worker em cache | **Recarregar** em `chrome://extensions` |
| “Não foi possível preparar a página…” | Página `chrome://`, Chrome Web Store ou aba em branco | Abra uma página normal e tente de novo |
| “O DevTools está aberto nesta aba…” | DevTools interfere na automação | Feche o DevTools daquela aba |
| “A ref … está dentro de um iframe…” | Ação por coordenadas em elemento de iframe | Peça a ação por referência (clicar/preencher) |
| “Ref … não encontrada” | A página mudou depois da leitura | Peça ao agente para ler a página de novo |
| “Só é possível anexar abas http(s).” | Aba interna do navegador | Use uma página comum |
| “A aba está em outra janela…” | Grupo pertence a outra janela | Abra uma aba pela conversa ou mova a aba de janela |
| “O arquivo … excede o limite de ~5 MB.” | Upload grande demais | Reduza o arquivo |
| “Nenhum quadro gravado…” | GIF sem `start` | Peça para iniciar a gravação antes |
| “Falha ao gerar o GIF (offscreen indisponível).” | Documento offscreen não subiu | Recarregue a extensão |
| Erro `403` nas ferramentas | Token do relay desatualizado | Apague `~/.cache/opencode-browser/relay.json` (ou em `$XDG_RUNTIME_DIR/opencode-browser/`) e reinicie o OpenCode |

---

## 15. Limites e privacidade

- **Tudo local**: a extensão fala com `127.0.0.1`; o plugin escuta apenas em
  loopback (portas 8799–8802) e exige um “hello” da extensão antes de atender.
- **O painel é uma visão só**: duas janelas abertas mostram a mesma conversa.
- **Vínculo conversa↔grupo** não sobrevive a fechar o Chrome por completo.
- **Até 4 conversas** com estado detalhado em memória ao mesmo tempo.
- **Uma resposta em streaming por vez**, mas várias conversas podem executar em
  paralelo.
- **Grupo automático** cria uma aba em branco por conversa; grupos de conversas
  apagadas fora da extensão só são liberados no próximo início do navegador.
- **O card de permissão é modal**: enquanto houver um pedido aberto, o painel
  fica coberto — responda (ou use **Esc**) para continuar.

---

## 16. Referência rápida

### Caminhos

| O quê | Onde |
|---|---|
| Build da extensão | `dist/` (é a pasta a carregar no Chrome) |
| Plugin e agente | `~/.config/opencode/plugins/` |
| Conversas do navegador | `~/.opencode-browser-extensions` |
| Capturas do agente | `~/.cache/opencode-browser/capturas/` |
| Token e porta do relay | `$XDG_RUNTIME_DIR/opencode-browser/relay.json` ou `~/.cache/opencode-browser/relay.json` |

### Comandos úteis

```bash
npm run build              # gera dist/
npm run install:plugin     # copia plugin e agente
opencode service restart   # recarrega plugin e agente
opencode pair              # gera o link de pareamento
curl http://127.0.0.1:8799/health
```

### Pedidos que funcionam bem

- “Abra example.com e me diga o título da página.”
- “Leia a página atual e liste os links do menu.”
- “Preencha o formulário de contato com dados de teste e me mostre um print antes de enviar.”
- “Investigue por que o botão Salvar não responde: veja o console e a rede.”
- “Pesquise o preço deste produto em três lojas e monte uma tabela.”
- “Grave um GIF mostrando o passo a passo do login.”
