# Configurações

## Preferências do usuário

Persistidas em `chrome.storage.local` (`opencode.config`) e editáveis no painel
ou na página de opções.

| Variável | Descrição | Tipo | Padrão | Obrigatório | Onde se usa |
|---|---|---|---|---|---|
| `baseUrl` | Origem do servidor local | string | — | Sim | Cliente da API |
| `token` | Token de pareamento | string | — | Sim | Header Basic |
| `directory` | Pasta das conversas da extensão (location das sessões) | string | anunciada pelo plugin (`~/.opencode-browser-extensions`) | Não | `?directory=` e `session.create` |
| `defaultModel` | Modelo padrão | ModelRef | modelo padrão do servidor | Não | Criação de sessão |
| `defaultAgent` | Agente padrão | string | `build` | Não | Criação de sessão |
| `permissionMode` | Modo de permissão | `ask` \| `allow` \| `deny` | `ask` | Sim | Permissions |
| `permissionTimeoutMs` | Timeout do prompt | number | `60000` | Não | Permissions |
| `findMode` | Ranking do `find` | `heuristic` \| `model` | `heuristic` | Não | `tools/page.ts` |
| `soundEnabled` | Aviso sonoro | boolean | `true` | Não | Offscreen |
| `notifyEnabled` | Notificação do sistema | boolean | `true` | Não | `chrome.notifications` |
| `toolDisplay` | Como as tools aparecem no chat (`grouped`, `rows`, `full`) | string | `grouped` | Não | `sidepanel/Chat` |
| `browserAgentDefault` | Usa o agente `opencode-browser` nas novas sessões | boolean | `true` | Não | `service-worker` |

### Modos de permissão

| Modo | Comportamento |
|---|---|
| `ask` | Pede na primeira ação de cada domínio (recomendado) |
| `allow` | Executa sem perguntar, respeitando a lista de bloqueio |
| `deny` | Bloqueia ações; apenas ferramentas de leitura executam |

## Pasta das conversas

Por padrão, o plugin anuncia e cria a pasta `~/.opencode-browser-extensions`
(equivalente em cada sistema, veja [plugin.md](plugin.md)). A extensão usa essa
pasta como `location` das sessões e filtra a listagem por ela: só aparecem as
conversas criadas ali. O campo "Pasta das conversas do navegador" nas opções
permite trocar o caminho; um valor definido pelo usuário não é sobrescrito pelo
anúncio do plugin.

## Listas de sites

| Chave | Descrição |
|---|---|
| `permissions.allow` | Hosts sempre permitidos (uma linha por host nas options) |
| `permissions.deny` | Hosts sempre bloqueados |

## Variáveis de ambiente do plugin

| Variável | Descrição | Tipo | Padrão | Obrigatório | Onde se usa |
|---|---|---|---|---|---|
| `OPENCODE_BROWSER_RELAY_PORT` | Porta inicial do relay | number | `8799` | Não | `plugin/browser-relay.ts` |
| `OPENCODE_BROWSER_EXTENSION_ID` | ID de extensão aceito na origem | string | ID fixo do manifest | Não | Validação de origem |
| `OPENCODE_BROWSER_ALLOW_ANY_EXTENSION` | Libera qualquer extensão | `0` \| `1` | `0` | Não | Validação de origem |

## Arquivo temporário do relay

| Caminho | Conteúdo | Permissão |
|---|---|---|
| `/tmp/opencode-browser-relay.token` | `{"token":"…","port":8800}` | `0600` |

## Manifest da extensão

| Chave | Valor | Motivo |
|---|---|---|
| `manifest_version` | `3` | Obrigatório para novas extensões |
| `minimum_chrome_version` | `116` | APIs de side panel e offscreen usadas |
| `key` | chave pública | Garante ID fixo entre recarregamentos |
| `side_panel.default_path` | `sidepanel.html` | Painel lateral |
| `options_page` | `options.html` | Configurações |
| `background.type` | `module` | Service worker com ES modules |
| `commands.toggle-side-panel` | `Ctrl+Shift+O` | Atalho do painel |

### Permissões

| Permissão | Motivo |
|---|---|
| `sidePanel` | Abrir o painel no clique do ícone |
| `storage` | Configuração, listas e mapa de grupos |
| `tabs` / `tabGroups` | Listar, agrupar, criar e fechar abas |
| `scripting` | Injetar o content script e executar funções na página |
| `debugger` | Eventos confiáveis, screenshots, console e rede |
| `activeTab` | Acesso à aba ativa quando o usuário anexa |
| `alarms` | Keepalive do service worker |
| `offscreen` | Documento oculto para keepalive, som e GIF |
| `notifications` | Aviso do sistema quando o painel está fechado |
| `downloads` | Salvar o GIF exportado |
| `host_permissions: <all_urls>` | Ler/interagir com páginas e falar com o servidor local |

### Content scripts

| Correspondência | Momento | Frames | Arquivo |
|---|---|---|---|
| `<all_urls>` | `document_start` | todos | `assets/content.js` |
