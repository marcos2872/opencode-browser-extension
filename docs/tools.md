# Ferramentas `browser_*`

As 18 ferramentas são registradas pelo plugin no namespace `browser` e aparecem
para o modelo como `browser_<nome>`. Todas operam apenas nas abas do grupo da
sessão e, exceto as de leitura, pedem permissão conforme o
[modelo de segurança](security.md).

## Leitura

### `browser_tabs_context`

Lista as abas do grupo da sessão.

| Parâmetro | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `createIfEmpty` | boolean | Não | Cria grupo/aba se ainda não existir |

Retorna `tabGroupId`, `currentTabId`, `availableTabs` e `tabCount`.

### `browser_read_page`

Árvore de acessibilidade com refs (`ref_1`, `ref_2`…).

| Parâmetro | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `filter` | `interactive` \| `all` | Não | Só elementos interativos ou todos |
| `depth` | number | Não | Profundidade máxima (padrão 12) |
| `ref_id` | string | Não | Foca a partir de uma ref existente |
| `max_chars` | number | Não | Limite de caracteres (padrão 50 000) |
| `include_hidden` | boolean | Não | Inclui elementos invisíveis |
| `frames` | `main` \| `all` | Não | Agrega iframes com prefixo `f<frameId>_ref_N` |
| `tabId` | number | Não | Aba alvo (padrão: principal do grupo) |

### `browser_find`

Busca elementos por texto/papel/nome.

| Parâmetro | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `query` | string | Sim | Termo de busca |
| `max_results` | number | Não | Máximo de resultados (padrão 20) |
| `frames` | `main` \| `all` | Não | Busca também em iframes |
| `tabId` | number | Não | Aba alvo |

Com `findMode: "model"` nas configurações, o ranking dos candidatos é feito pelo
modelo do OpenCode via geração stateless; sem isso (ou em caso de falha), usa a
heurística local.

### `browser_get_page_text`

Extrai o texto principal da página.

| Parâmetro | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `max_chars` | number | Não | Limite (padrão 50 000) |
| `frames` | `main` \| `all` | Não | Concatena também o texto dos iframes |
| `tabId` | number | Não | Aba alvo |

### `browser_read_console_messages`

| Parâmetro | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `pattern` | string | Não | Filtro por substring |
| `onlyErrors` | boolean | Não | Somente erros/exceções |
| `limit` | number | Não | Máximo de mensagens (padrão 100) |
| `clear` | boolean | Não | Limpa o buffer após ler |
| `tabId` | number | Não | Aba alvo |

O monitoramento começa quando a ferramenta é usada; recarregue a página para
capturar mensagens do carregamento.

### `browser_read_network_requests`

| Parâmetro | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `urlPattern` | string | Não | Filtro por substring na URL |
| `limit` | number | Não | Máximo de requisições (padrão 100) |
| `clear` | boolean | Não | Limpa o buffer após ler |
| `tabId` | number | Não | Aba alvo |

O buffer é limpo ao trocar de domínio.

## Abas e navegação

### `browser_tabs_create`

| Parâmetro | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `url` | string | Não | URL inicial (padrão `about:blank`) |
| `active` | boolean | Não | Abre em primeiro plano (padrão true) |

### `browser_tabs_attach`

Move uma aba existente para o grupo da sessão.

| Parâmetro | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `tabId` | number | Não | Aba alvo (padrão: aba ativa do navegador) |

Pede permissão e remove a aba do grupo atual do usuário, se houver.

### `browser_tabs_close`

| Parâmetro | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `tabId` | number | Sim | Aba do grupo a fechar |

### `browser_navigate`

| Parâmetro | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `url` | string | Não | URL ou domínio (`https://` é adicionado se faltar) |
| `direction` | `back` \| `forward` | Não | Navegação no histórico |
| `tabId` | number | Não | Aba alvo |

Pede permissão para domínios novos (card de transição quando muda de host).

### `browser_resize_window`

| Parâmetro | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `width` | number | Sim | Largura em pixels |
| `height` | number | Sim | Altura em pixels |
| `tabId` | number | Não | Aba alvo |

## Interação

### `browser_computer`

| Parâmetro | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `action` | `click` \| `type` \| `key` \| `scroll` \| `hover` \| `screenshot` \| `zoom` \| `wait` | Sim | Ação |
| `ref` | string | Não | Ref de `read_page`/`find` |
| `coordinate` | [number, number] | Não | Coordenada no viewport |
| `text` | string | Não | Texto para `type` |
| `keys` | string | Não | Combinação para `key` (ex.: `Ctrl+A`) |
| `submit` | boolean | Não | Pressiona Enter após digitar |
| `click_count` | number | Não | 1–3 cliques |
| `button` | `left` \| `right` \| `middle` | Não | Botão do mouse |
| `scroll_direction` | `up` \| `down` \| `left` \| `right` | Não | Direção do scroll |
| `scroll_amount` | number | Não | Pixels (padrão 600) |
| `duration` | number | Não | Segundos para `wait` (máx. 10) |
| `region` | [number, number, number, number] | Não | Região para `zoom` |
| `tabId` | number | Não | Aba alvo |

Cliques e digitação usam eventos confiáveis via CDP. Refs de iframe usam eventos
de DOM. Com o DevTools aberto, click/hover caem para eventos de DOM quando há
ref.

### `browser_form_input`

| Parâmetro | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `ref` | string | Sim | Campo (input, textarea, select, contenteditable) |
| `value` | string | Sim | Valor |
| `tabId` | number | Não | Aba alvo |

### `browser_javascript_tool`

| Parâmetro | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `text` | string | Sim | Código JavaScript |
| `action` | `javascript_exec` | Não | Compatibilidade |
| `tabId` | number | Não | Aba alvo |

Executa no contexto da página com timeout de 10 s e saída limitada a 50 KB.

### `browser_upload_image`

| Parâmetro | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `ref` | string | Sim | Input de arquivo ou área de drop |
| `files` | `[{ data, name, mimeType? }]` | Sim | Até 3 arquivos, base64, ~5 MB cada |
| `tabId` | number | Não | Aba alvo |

## Planejamento e lote

### `browser_update_plan`

| Parâmetro | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `domains` | string[] | Sim | Domínios que serão visitados |
| `approach` | string[] | Sim | Passos de alto nível |

Mostra um card de aprovação. Domínios aprovados entram na allowlist da sessão.

### `browser_browser_batch`

| Parâmetro | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `actions` | `[{ name, input }]` | Sim | Até 20 ações em sequência |

Executa ferramentas uma a uma, com permissões normais, e devolve o resultado de
cada item.

### `browser_gif_creator`

| Parâmetro | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `action` | `start` \| `stop` \| `export` | Sim | Fase da gravação |

`start` inicia a gravação (até 30 quadros, um por ação), `stop` encerra e
`export` gera o GIF (até 800 px, 600 ms por quadro), salva em Downloads e
devolve a imagem.

## Permissões por ferramenta

| Categoria | Ferramentas | Comportamento |
|---|---|---|
| Leitura (sem prompt) | `tabs_context`, `tabs_create`, `read_page`, `get_page_text`, `find`, `read_console_messages`, `read_network_requests` | Executam direto |
| Ação (com prompt) | `navigate`, `computer`, `form_input`, `javascript_tool`, `tabs_close`, `tabs_attach`, `upload_image`, `gif_creator` (export) | Prompt uma vez / nesta sessão / sempre / negar |
| Planejamento | `update_plan` | Card de plano com domínios e passos |
| Lote | `browser_batch` | Cada sub-ação segue sua própria regra |
