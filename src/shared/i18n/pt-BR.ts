/**
 * Catálogo de mensagens em português do Brasil.
 *
 * É a fonte de verdade das chaves: `en.ts` é tipado como `Catalog`, então uma
 * tradução faltando (ou com parâmetro diferente) quebra o `tsc`. Os textos
 * daqui são os que o **usuário** lê; textos consumidos pelo modelo ficam em
 * inglês, direto no código do background.
 *
 * Mensagens estáticas são strings; as que mudam de forma são funções com um
 * único objeto de parâmetros (nunca parâmetro posicional nem opcional: o tipo
 * do argumento é inferido a partir daqui).
 */
export const pt = {
  // ---------------------------------------------------------------- genéricos
  "app.loading": "Carregando...",
  "app.loadingInline": "carregando",
  "app.retry": "Tentar novamente",
  "app.reconnect": "Reconectar",
  "app.copyCommand": "Copiar comando",
  "app.openSettings": "Abrir configurações",
  "common.close": "Fechar",
  "common.cancel": "Cancelar",
  "common.save": "Salvar",
  "common.connected": "Conectado.",
  "common.unavailable": (p: { value: string }) => `${p.value} (indisponível)`,

  // ------------------------------------------------------------- painel (App)
  "app.brand": "OpenCode",
  "app.settingsTitle": "Configurações",
  "app.status.online": "online",
  "app.status.offline": "offline",
  "app.status.connecting": "conectando",
  "app.status.unknown": "...",
  "app.status.api": (p: { status: string }) => `API: ${p.status}`,
  "app.apiTitle": (p: { status: string; detail?: string }) =>
    p.detail ? `API do OpenCode: ${p.status} — ${p.detail}` : `API do OpenCode: ${p.status}`,
  "app.offline.startServer": "OpenCode offline — inicie o servidor para enviar",
  "app.offline.connecting": "Conectando ao OpenCode…",
  "app.offline.unconfigured": "OpenCode não configurado",
  "app.toast.paired": "Conectado ao OpenCode.",
  "app.toast.groupCreated": "Nova conversa criada · grupo de abas aberto",
  "app.confirm.deleteSession":
    "Excluir esta sessão? O histórico será removido do OpenCode.",
  "app.waiting": "aguardando o OpenCode",
  "app.working": "trabalhando",
  "app.thinking": "pensando",

  // --------------------------------------------------------------- onboarding
  "onboarding.title": "Conecte o navegador ao OpenCode da sua máquina",
  "onboarding.intro.1": "A extensão usa a API local do",
  "onboarding.intro.product": "OpenCode Terminal (v2)",
  "onboarding.intro.2":
    ". O pareamento gera um token de uso único e expira em 5 minutos. Nada sai do seu computador.",
  "onboarding.step1": "No terminal, rode:",
  "onboarding.step2":
    "Copie o link exibido (o mesmo que abre a interface web do OpenCode) e cole abaixo.",
  "onboarding.step3": "Clique em conectar.",
  "onboarding.pairLabel": "Link do `opencode pair`",
  "onboarding.pairBusy": "Conectando...",
  "onboarding.pairAction": "Conectar ao OpenCode",
  "onboarding.tip":
    "Dica: você pode rodar `opencode pair` de novo a qualquer momento. O token anterior continua válido até você desconectar.",
  "onboarding.plugin.title": "Instalar o plugin de ferramentas do navegador",
  "onboarding.plugin.body":
    "O chat funciona só com a API. Para o agente controlar o Chrome, instale o plugin no OpenCode e reinicie o serviço.",
  "onboarding.plugin.connected": "Plugin conectado",
  "onboarding.plugin.reconnect": "Reconectar",

  // --------------------------------------------------------------- session bar
  "session.listTitle": "Sessões do OpenCode",
  "session.empty": "Nenhuma sessão",
  "session.busySuffix": " · executando",
  "session.unreadSuffix": " · nova resposta",
  "session.agentTitle": "Agente do OpenCode",
  "session.tabNoAddress": "Aba sem endereço",
  "session.tabNoTitle": "Aba sem título",
  "session.attach.title": (p: { count: number; error: string | null }) => {
    if (p.count > 0) {
      return `${p.count} ${p.count === 1 ? "aba conectada" : "abas conectadas"}. Mostrar abas ou conectar nova`
    }
    return p.error
      ? `${p.error}. Clique para conectar a aba atual`
      : "Conectar aba atual"
  },
  "session.attach.aria": (p: { count: number }) =>
    p.count > 0
      ? `Mostrar ${p.count} ${p.count === 1 ? "aba conectada" : "abas conectadas"}`
      : "Conectar aba atual",
  "session.attach.current": "Conectar aba atual",
  "session.attach.menu": "Abas conectadas",
  "session.attach.remove": (p: { title: string }) =>
    `Remover ${p.title || "aba"} do contexto`,
  "session.attach.add": "Conectar nova aba",
  "session.new": "Nova conversa",
  "session.newBusy": "Criando conversa…",
  "session.delete": "Excluir sessão",
  "session.fallbackLabel": (p: { id: string }) => `Sessão ${p.id}`,

  // ----------------------------------------------------------------- composer
  "composer.placeholder.busy": "O agente está trabalhando...",
  "composer.placeholder.idle": "Peça algo ao OpenCode...",
  "composer.inputLabel": "Mensagem para o agente",
  "composer.hint": "Enter envia · Shift+Enter quebra linha",
  "composer.send": "Enviar (Enter)",
  "composer.stop": "Parar",
  "composer.contextPercent": (p: { tokens: string; percent: number }) =>
    `Contexto ${p.tokens} (${p.percent}%)`,
  "composer.contextTokens": (p: { tokens: string }) => `Contexto ${p.tokens} tokens`,
  "composer.sessionCost": (p: { cost: string }) => `Sessão ${p.cost}`,
  "composer.usageHint":
    "Tokens da última requisição / janela do modelo · custo informado pelo OpenCode",
  "composer.toolsOn": "ferramentas conectadas",
  "composer.toolsOff": "ferramentas offline",
  "composer.toolsOnHint": "Plugin do navegador conectado; ferramentas disponíveis",
  "composer.toolsOffHint": "Plugin do navegador desconectado; ferramentas indisponíveis",

  // ------------------------------------------------------------------- banner
  "banner.connecting.title": "Conectando ao OpenCode…",
  "banner.connecting.detail":
    "Se o servidor ainda não estiver rodando, inicie o OpenCode no terminal com `opencode serve`.",
  "banner.unauthorized.title": "Token do OpenCode inválido ou expirado",
  "banner.unauthorized.detail":
    "Rode `opencode pair` no terminal, cole o novo link nas configurações e tente de novo.",
  "banner.timeout.title": "O OpenCode demorou demais para responder",
  "banner.timeout.detail":
    "O servidor pode estar travado. Reinicie o OpenCode e tente novamente.",
  "banner.serverError.title": "O OpenCode respondeu com erro",
  "banner.serverError.detail": "Confira o log do servidor do OpenCode e tente novamente.",
  "banner.streamClosed.title": "A conexão com o OpenCode foi encerrada",
  "banner.streamClosed.detail":
    "Tente reconectar. Se o problema continuar, reinicie o OpenCode no terminal.",
  "banner.unreachable.title": "O OpenCode não está respondendo",
  "banner.unreachable.detail":
    "Inicie o OpenCode no terminal com `opencode serve` e clique em Tentar novamente.",
  "banner.toolsOffline.title": "Ferramentas do navegador desconectadas",
  "banner.reconnectPlugin": "Reconectar plugin",

  // ----------------------------------------------------------- relay (plugin)
  "relay.connected": "Plugin conectado",
  "relay.disconnected": "Plugin desconectado",
  "relay.missing": "Plugin não encontrado — instale o plugin e reinicie o OpenCode",
  "relay.rejected": "Plugin recusou a conexão — confira o ID da extensão",
  "relay.silent": "Plugin parou de responder — reinicie o OpenCode",
  "relay.closed": "Plugin desconectado — reinicie o OpenCode para reconectar",

  // ------------------------------------------------------------- model picker
  "model.title": "Modelo do OpenCode",
  "model.empty": "Sem modelos",
  "model.noTools": " (sem tools)",
  "model.variantTitle": "Variante do modelo",

  // ------------------------------------------------------------- tools (chat)
  "tool.tabs_context": "Abas do grupo",
  "tool.tabs_create": "Nova aba",
  "tool.tabs_close": "Fechar aba",
  "tool.tabs_attach": "Anexar aba",
  "tool.navigate": "Navegar",
  "tool.read_page": "Ler página",
  "tool.find": "Buscar elemento",
  "tool.get_page_text": "Extrair texto",
  "tool.form_input": "Preencher campo",
  "tool.computer": "Interagir",
  "tool.javascript_tool": "JavaScript",
  "tool.read_console_messages": "Console",
  "tool.read_network_requests": "Rede",
  "tool.resize_window": "Redimensionar",
  "tool.update_plan": "Plano",
  "tool.browser_batch": "Lote de ações",
  "tool.batch": "Lote de ações",
  "tool.upload_image": "Enviar arquivo",
  "tool.gif_creator": "Gravar GIF",
  "tool.question": "Pergunta",
  "tool.tabRef": (p: { id: number }) => `aba ${p.id}`,
  "tool.actionsCount": (p: { count: number }) => `${p.count} ação(ões)`,
  "tool.status.ok": "ok",
  "tool.status.error": "erro",
  "tool.status.running": "rodando",
  "tool.status.waiting": "aguardando",
  "tool.params": "Parâmetros",
  "tool.result": "Resultado",
  "tool.multipleChoice": " · múltipla escolha",
  "tool.runCount": (p: { count: number }) =>
    `${p.count} ferramenta${p.count > 1 ? "s" : ""}`,
  "tool.runErrors": (p: { count: number }) => `${p.count} erro${p.count > 1 ? "s" : ""}`,
  "tool.runOpen": "ver",
  "tool.modalTitle": "Ferramentas desta execução",
  "tool.modalOnlyErrors": "Somente erros",

  // ------------------------------------------------------------ chat (vazio)
  "chat.empty.title": "Seu navegador, com os modelos do OpenCode",
  "chat.empty.body":
    "O agente roda na sua máquina e ganha um grupo de abas isolado para navegar, ler e interagir. Cada ação sensível pede sua permissão.",
  "chat.suggestion.news": "Abra o Hacker News e resuma as 5 principais notícias de hoje.",
  "chat.suggestion.form":
    "Leia a página atual, encontre o formulário de contato e preencha com dados de teste.",
  "chat.suggestion.console":
    "Investigue os erros do console e as requisições de rede desta página.",
  "chat.suggestion.price":
    "Pesquise o preço de um produto em três lojas e compare em uma tabela.",
  "chat.reasoning": "Raciocínio",

  // -------------------------------------------------------- atividade (gerúndio)
  "activity.clicking": "clicando",
  "activity.typing": "digitando",
  "activity.pressingKeys": "pressionando teclas",
  "activity.scrolling": "rolando a página",
  "activity.hovering": "passando o mouse",
  "activity.screenshot": "capturando a tela",
  "activity.zoom": "ampliando a tela",
  "activity.waiting": "aguardando",
  "activity.interacting": "interagindo com a página",
  "activity.back": "voltando uma página",
  "activity.forward": "avançando uma página",
  "activity.navigating": "navegando",
  "activity.readingPage": "lendo a página",
  "activity.readingPageAllFrames": "lendo a página (todos os frames)",
  "activity.clickingShort": "Clicando",
  "activity.capturingRegion": "Capturando região",
  "activity.scrollingShort": "Rolando",
  "activity.hoveringShort": "Passando o mouse",
  "activity.runningJs": "Executando JavaScript",
  "activity.readingText": "lendo o texto da página",
  "activity.finding": "procurando na página",
  "activity.filling": "preenchendo um campo",
  "activity.tabsContext": "verificando as abas",
  "activity.tabOpening": "abrindo uma aba",
  "activity.tabClosing": "fechando uma aba",
  "activity.tabAttaching": "conectando a aba",
  "activity.script": "executando script",
  "activity.console": "lendo o console",
  "activity.network": "verificando a rede",
  "activity.resizing": "redimensionando a janela",
  "activity.planning": "planejando os próximos passos",
  "activity.batch": "executando ações",
  "activity.uploading": "enviando um arquivo",
  "activity.recording": "gravando a tela",
  "activity.question": "aguardando sua resposta",
  "activity.working": "trabalhando",
  "activity.writing": "escrevendo a resposta",
  "activity.thinking": "pensando",
  "activity.prefix": (p: { detail: string }) => `trabalhando: ${p.detail}`,

  // --------------------------------------------------------------- permissões
  "permission.title": "Pedido de permissão",
  "permission.session": (p: { label: string }) => `Sessão: ${p.label}`,
  "permission.planIntro": "O agente quer visitar estes domínios antes de continuar.",
  "permission.domainIntro":
    "O agente quer mudar de domínio. Isso muda o que ele pode acessar.",
  "permission.actionIntro": (p: { tool: string }) => `${p.tool} · pedido de permissão`,
  "permission.screenshotAlt": "Prévia da ação",
  "permission.approvePlan": "Aprovar plano",
  "permission.allow": "Permitir",
  "permission.deny": "Recusar",
  "permission.allowAlwaysDomain": (p: { domain: string }) =>
    `Permitir sempre para ${p.domain}`,
  "permission.allowOnce": "Permitir uma vez",
  "permission.scopeLabel": "Permissões mais amplas",
  "permission.allowSession": "Permitir nesta sessão",
  "permission.allowAlways": (p: { host: string }) =>
    `Permitir sempre para ${p.host || "este site"}`,
  "permission.denyAction": "Negar",
  "permission.footnote":
    "Você pode revogar permissões em Configurações. O agente nunca deve comprar, criar contas ou burlar captchas sem sua confirmação.",
  "permission.tool.navigate": "Navegação",
  "permission.tool.computer": "Interação com a página",
  "permission.tool.form_input": "Preenchimento de formulário",
  "permission.tool.javascript_tool": "Execução de JavaScript",
  "permission.tool.tabs_close": "Fechamento de aba",
  "permission.tool.upload_image": "Envio de arquivo",
  "permission.tool.gif_creator": "Exportação de GIF",
  "permission.tool.update_plan": "Plano de navegação",
  "permission.ask.closeTab": "Fechar aba",
  "permission.ask.attachTab": "Dar acesso a esta aba ao agente",
  "permission.ask.screenshot": "Tirar screenshot",
  "permission.ask.zoom": "Capturar região ampliada",
  "permission.ask.javascript": "Executar JavaScript na página",
  "permission.ask.upload": "Enviar arquivo para a página",
  "permission.ask.exportGif": "Exportar GIF da gravação",
  "permission.ask.fillField": (p: { ref: string }) => `Preencher campo ${p.ref}`,
  "permission.ask.approvePlan": "Aprovar plano de navegação",
  "permission.ask.navigateTo": (p: { to: string }) => `Navegar para ${p.to}`,
  "permission.ask.navigateFromTo": (p: { from: string; to: string }) =>
    `Navegar de ${p.from} para ${p.to}`,
  "permission.ask.click": "Clicar na página",
  "permission.ask.type": "Digitar na página",
  "permission.ask.key": "Pressionar tecla",
  "permission.ask.scroll": "Rolar a página",
  "permission.ask.hover": "Mover o mouse",
  "permission.ask.action": (p: { action: string }) => `Ação: ${p.action}`,
  "permission.ask.tab": (p: { id: number }) => `Aba ${p.id}`,
  "permission.ask.coordinate": (p: { x: number; y: number }) => `Coordenada ${p.x}, ${p.y}`,

  // ------------------------------------------------------------------- forms
  "form.question": "Pergunta",
  "form.yes": "Sim",
  "form.otherAnswer": "Outra resposta",
  "form.submit": "Responder",
  "form.cancel": "Cancelar",

  // -------------------------------------------------- configurações (options)
  "options.title": "OpenCode Browser",
  "options.openPanel": "Abrir painel",
  "options.lead":
    "Configurações da extensão que conecta o Chrome aos modelos do OpenCode local.",
  "options.navigation": "Seções de configuração",
  "options.sessions": "Sessões e modelo",
  "options.behavior": "Comportamento",
  "options.chat": "Chat e ferramentas",
  "options.unsaved": "Há alterações não salvas",
  "options.savedStatus": "Tudo salvo",
  "options.discard": "Descartar",
  "options.saveChanges": "Salvar alterações",
  "options.saving": "Salvando…",
  "options.saveListsFailed": (p: { detail: string }) =>
    `As configurações foram salvas, mas as listas de sites não. Tente salvar novamente. ${p.detail}`,
  "options.language.title": "Idioma",
  "options.language.label": "Idioma da interface",
  "options.language.auto": "Automático (idioma do navegador)",
  "options.language.hint":
    "Vale para o painel, as configurações, o aviso na página e as notificações. Salva automaticamente; as respostas do agente seguem o idioma da sua mensagem.",
  "options.connection": "Conexão",
  "options.api": (p: { state: string }) => `API: ${p.state}`,
  "options.apiUnconfigured": "não configurada",
  "options.apiUnauthorized": "offline — token inválido ou expirado",
  "options.apiTimeout": "offline — o servidor não respondeu a tempo",
  "options.apiServerError": "offline — o servidor respondeu com erro",
  "options.apiStreamClosed": "offline — conexão encerrada",
  "options.apiUnreachable": "offline — servidor não respondeu",
  "options.tools": (p: { state: string }) => `Ferramentas: ${p.state}`,
  "options.reconnect": "Reconectar",
  "options.reconnectPlugin": "Reconectar plugin",
  "options.server": "Servidor",
  "options.token": "Token",
  "options.tokenHidden": (p: { head: string; tail: string }) =>
    `${p.head}…${p.tail} (oculto)`,
  "options.workspace.label": "Pasta das conversas do navegador",
  "options.workspace.hint":
    "As conversas criadas pela extensão ficam nesta pasta e a extensão só lista as que estiverem nela. O plugin cria a pasta e informa o caminho automaticamente (padrão:",
  "options.disconnect": "Desconectar",
  "options.confirmDisconnect": "Desconectar deste OpenCode? O token será removido.",
  "options.disconnected": "Desconectado.",
  "options.pairLabel": "Link do `opencode pair`",
  "options.pairBusy": "Conectando...",
  "options.pairAction": "Conectar",
  "options.defaultModel": "Modelo padrão",
  "options.defaultModelHint":
    "Usado ao criar novas sessões. Você pode trocar por conversa no seletor do painel.",
  "options.followGroups":
    "Mostrar no painel a conversa do grupo de abas que está em foco (cada sessão fica atrelada ao seu grupo)",
  "options.autoGroup":
    "Criar um grupo de abas ao iniciar uma nova conversa (abre uma aba em branco em segundo plano; desligado, o grupo nasce quando o agente usa o navegador)",
  "options.modelsCount": (p: { count: number }) =>
    `${p.count} modelo(s) disponível(is). Modelos sem suporte a tools continuam servindo para conversar, mas não controlam o navegador.`,
  "options.permissions": "Permissões",
  "options.permissionsHint":
    "Ações que mudam a página (clicar, digitar, navegar, executar JS) seguem o modo abaixo. Leitura de página, console e rede é liberada.",
  "options.mode.ask": "Perguntar a cada site",
  "options.mode.askHint": "Pede na primeira ação em cada domínio.",
  "options.mode.allow": "Permitir ações automaticamente",
  "options.mode.allowHint": "Não pergunta; usa a lista de bloqueio abaixo.",
  "options.mode.allowWarning":
    "As ações no site serão executadas sem pedir confirmação. Evite este modo em sites sensíveis.",
  "options.mode.deny": "Bloquear ações",
  "options.mode.denyHint": "Só leitura; nenhuma interação é executada.",
  "options.timeout": "Tempo para responder a um pedido:",
  "options.timeout.30": "30 segundos",
  "options.timeout.60": "1 minuto",
  "options.timeout.120": "2 minutos",
  "options.timeout.300": "5 minutos",
  "options.findMode": "Busca por elemento:",
  "options.findMode.heuristic": "Heurística (grátis)",
  "options.findMode.model": "Modelo do OpenCode (usa tokens)",
  "options.sound":
    "Tocar um aviso sonoro quando o agente terminar ou pedir permissão com o painel fechado",
  "options.notify":
    "Mostrar notificação do sistema quando o agente terminar com o painel fechado",
  "options.bringToFront":
    "Permitir que abas abertas ou anexadas pelo agente venham para frente (desligado, a extensão trabalha em segundo plano e não tira o foco da janela em que você está)",
  "options.toolDisplay": "Ferramentas no chat",
  "options.toolDisplay.grouped": "Agrupadas (abrem em um modal)",
  "options.toolDisplay.rows": "Linhas compactas, uma por chamada",
  "options.toolDisplay.full": "Cards completos, com parâmetros e resultado",
  "options.toolDisplay.hidden": "Ocultar tools e raciocínio (só “trabalhando”)",
  "options.toolDisplayHint":
    "No modo agrupado, uma linha resume a execução e abre a lista completa de tools; só a ferramenta em execução fica no chat. Em “Ocultar”, o raciocínio e as tools somem e só aparece o indicador de trabalho; perguntas do agente continuam visíveis.",
  "options.allowList": "Sites sempre permitidos (um por linha)",
  "options.denyList": "Sites sempre bloqueados (um por linha)",
  "options.saved": "Configurações salvas.",
  "options.browserTools": "Ferramentas do navegador",
  "options.browserToolsHint":
    "Expostas ao OpenCode pelo plugin `browser-relay` (namespace `browser`). O agente só vê abas do grupo criado para a sessão.",
  "options.security": "Segurança",
  "options.securityHint":
    "O token de pareamento fica no `chrome.storage.local` deste navegador e é enviado apenas para o servidor local do OpenCode. O plugin escuta em `ws://127.0.0.1:8799` e aceita somente a origem desta extensão. Ainda assim, trate automação de navegador como código: revise as permissões e nunca deixe o modo \"permitir automaticamente\" ligado em sites sensíveis.",
  "options.tool.tabs_context": "lista as abas do grupo",
  "options.tool.tabs_create": "cria uma aba no grupo",
  "options.tool.tabs_close": "fecha uma aba do grupo",
  "options.tool.tabs_attach": "move a aba atual para o grupo",
  "options.tool.navigate": "navega, volta e avança",
  "options.tool.read_page": "árvore de acessibilidade com refs",
  "options.tool.find": "busca elementos por texto/role",
  "options.tool.get_page_text": "extrai o texto principal",
  "options.tool.form_input": "preenche campos por ref",
  "options.tool.computer": "clique, digitação, teclas, scroll, screenshot",
  "options.tool.javascript_tool": "executa JS na página",
  "options.tool.read_console_messages": "lê console e erros",
  "options.tool.read_network_requests": "lê requisições de rede",
  "options.tool.resize_window": "redimensiona a janela",
  "options.tool.update_plan": "pede aprovação de domínios",
  "options.tool.upload_image": "envia arquivos para inputs/drop zones",
  "options.tool.gif_creator": "grava e exporta GIF das ações",
  "options.tool.browser_batch": "executa várias ações em sequência",

  // ------------------------------------------------------ indicador na página
  "indicator.defaultStatus": "OpenCode está nesta aba",
  "indicator.stop": "Parar",
  "indicator.stopAria": "Parar o agente nesta aba",

  // -------------------------------------------------------------- background
  "notify.permissionTitle": "OpenCode Browser: aprovação pendente",
  "notify.formTitle": "OpenCode Browser",
  "notify.formNeedsAnswer": (p: { title: string }) =>
    p.title
      ? `O agente precisa de uma resposta: ${p.title}`
      : "O agente precisa de uma resposta.",
  "notify.done": (p: { session: string }) => `Concluído: ${p.session}`,
  "badge.configurePairing": "OpenCode Browser: configure o pareamento",
  "badge.unread": (p: { count: number }) =>
    `OpenCode Browser: ${p.count} conversa${p.count > 1 ? "s" : ""} com novidade`,
  "background.notConfigured": "OpenCode não configurado.",
  "background.browserAgentUnavailable":
    "O agente OpenCode Browser não está disponível. Reconecte o plugin e tente novamente.",
  "background.configureFirst": "Configure o pareamento primeiro.",
  "background.invalidConfig": "Configuração inválida.",
  "background.noActiveSession": "Nenhuma sessão ativa.",
  "background.sessionNotFound": "Sessão não encontrada.",
  "background.sessionCreateFailed": "Não foi possível criar a sessão.",
  "background.unknownCommand": "Comando desconhecido.",
  "background.noActiveTab": "Nenhuma aba ativa encontrada.",
  "background.unexpected": "Erro inesperado do OpenCode.",
  "background.streamDropped":
    "A conexão com o OpenCode caiu durante a execução. A resposta pode estar incompleta.",
  "background.streamClosed": "O OpenCode encerrou o stream de eventos.",
  "background.executionFailed": "A execução falhou no OpenCode sem detalhes adicionais.",
  "background.temporaryError": "erro temporário",
  "background.retrying": (p: { attempt: string; reason: string }) =>
    `Tentando novamente${p.attempt}: ${p.reason}`,
  "background.attachCurrentTab": "Dar acesso a esta aba ao agente",
  "background.swSilent": "O service worker não respondeu.",
  "opencode.guidance.payment":
    "Confira o saldo e os limites de gastos do OpenCode Go/provedor, ou selecione outro provedor ou modelo.",
  "opencode.guidance.auth":
    "Confira as credenciais e permissões configuradas para esse provedor no OpenCode.",
  "opencode.guidance.rateLimit":
    "O provedor limitou as requisições. Aguarde um pouco ou confira a cota e os limites da conta.",
  "opencode.pairInvalid": "Link inválido. Cole o link completo exibido por `opencode pair`.",
  "opencode.pairProtocol": "O link precisa começar com http:// ou https://.",
  "opencode.pairPath": "O link não contém /auth/connect/<código>.",
  "opencode.unreachable": (p: { baseUrl: string }) =>
    `Não foi possível falar com o OpenCode em ${p.baseUrl}. Ele está rodando?`,
  "opencode.pairExpired": "Link expirado ou já usado. Rode `opencode pair` novamente.",
  "opencode.pairFailed": (p: { status: number }) => `Falha ao parear (HTTP ${p.status}).`,
  "opencode.noToken": "O servidor não devolveu um token de sessão.",
  "opencode.timeout": (p: { seconds: number }) =>
    `O OpenCode não respondeu em ${p.seconds}s. Ele ainda está rodando?`,
  "opencode.sessionNoID": "Sessão criada sem id.",
  "opencode.streamUnavailable": (p: { status: number }) =>
    `Stream de eventos indisponível (HTTP ${p.status}).`,

  // ------------------------------------------------------- relay (background)
  "relayError.noAgent": "O plugin não gravou o agente.",
  "relayError.disconnectedBeforeAgent": "O plugin desconectou antes de instalar o agente.",
  "relayError.noResponse": "O plugin parou de responder.",
  "relayError.closedCode": (p: { code: number }) => `Conexão encerrada (${p.code}).`,
  "relayError.pluginMissing": "Plugin do OpenCode não encontrado.",
  "relayError.pluginNotConnected": "Plugin do OpenCode não conectado.",
  "relayError.agentInstallSilent": "O plugin não respondeu ao instalar o agente.",
  "relayError.sendFailed": "Falha ao enviar o pedido ao plugin.",
  "relayError.closedBeforeAgent": "Conexão encerrada antes de instalar o agente.",

  // ---------------------------------------------------- chrome (background)
  "cdp.devtoolsOpen":
    "O DevTools está aberto nesta aba. Feche o DevTools e tente novamente.",
  "cdp.attachFailed": (p: { error: string }) =>
    `Não foi possível anexar o depurador: ${p.error}`,
  "cdp.jsUnknownError": "Erro desconhecido ao executar JavaScript.",
  "cdp.noImage": "O Chrome não retornou a imagem.",
  "cdp.noScreenshot": "Não foi possível capturar a imagem da aba.",
  "group.noTab":
    "Esta sessão não tem aba no navegador. Use browser_tabs_create para abrir uma página ou browser_tabs_attach para usar uma aba já aberta.",
  "group.createFailed": "Não foi possível criar a aba do grupo.",
  "group.tabNotInSession": (p: { tabId: number }) =>
    `A aba ${p.tabId} não pertence a esta sessão.`,
  "group.tabNotInGroup": (p: { tabId: number }) =>
    `A aba ${p.tabId} não pertence ao grupo desta sessão.`,
  "group.empty": "O grupo desta sessão não tem abas.",
  "group.otherWindow":
    "A aba está em outra janela. Abra uma aba nova pela sessão ou mova a aba para a janela do grupo antes de anexá-la.",
  "group.noAttachedTabs": "A sessão não tem abas anexadas.",
  "group.tabNotInConversation": "A aba não pertence ao contexto desta conversa.",
  "group.createTabFailed": "Não foi possível criar a aba.",
  "group.tabNotInGroupShort": "A aba não pertence ao grupo desta sessão.",
  "offscreen.canvasUnavailable": "Canvas indisponível.",
} // `as const` casaria os literais do pt com o en; sem ele, só a forma é comparada.

export type Catalog = typeof pt
export type MessageKey = keyof Catalog
