import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { isAbsolute, join } from "node:path"

/**
 * Ponte entre o OpenCode e a extensão OpenCode Browser.
 *
 * A extensão conecta em ws://127.0.0.1:8799. Quando o modelo chama uma tool
 * `browser_*`, este plugin envia um `tool_request` e espera o `tool_result`.
 */

const PORT = Number(process.env.OPENCODE_BROWSER_RELAY_PORT ?? 8799)
const PORT_CANDIDATES = [PORT, PORT + 1, PORT + 2, PORT + 3]
const EXPECTED_EXTENSION_ID =
  process.env.OPENCODE_BROWSER_EXTENSION_ID ?? "meapihkmghapjefepmkckpikedpimhin"
const ALLOW_ANY_EXTENSION = process.env.OPENCODE_BROWSER_ALLOW_ANY_EXTENSION === "1"
const CALL_TIMEOUT_MS = 180_000
const AGENT_ID = "opencode-browser"
const AGENT_VERSION = 1
const AGENT_MARKER = `<!-- opencode-browser-agent v${AGENT_VERSION} -->`

type ImagePayload = { name: string; mime: string; data: string }

type ToolResponse = {
  ok: boolean
  content?: string
  images?: ImagePayload[]
  error?: string
  metadata?: Record<string, unknown>
}

type Progress = (update: Record<string, unknown>) => Promise<void>

type Socket = {
  data: SocketData
  send(data: string): void
  close(code?: number, reason?: string): void
}

type Pending = {
  socket: Socket
  resolve: (value: ToolResponse) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
  progress?: Progress
}

type SocketData = {
  origin: string
  id: string
  /** Timestamp do último pong; prova de vida da extensão. */
  lastPong: number
  pingTimer?: ReturnType<typeof setInterval>
}

function expandHome(value: string): string {
  if (value === "~") return homedir()
  if (value.startsWith("~/") || value.startsWith("~\\")) {
    return join(homedir(), value.slice(2))
  }
  return value
}

function agentMarkdown(): string {
  return `---
description: Opera o navegador do usuário pela extensão OpenCode Browser.
mode: primary
permissions:
  "*": deny
  "browser_*": allow
  question: allow
  doom_loop: ask
---

${AGENT_MARKER}

Você é o agente de navegador da extensão OpenCode Browser. Seu trabalho é
operar o navegador do usuário pelas ferramentas \`browser_*\` e responder ao
pedido feito no painel.

Regras:
- Comece por \`browser_tabs_context\` e reutilize a aba que já está no grupo.
  Só use \`browser_tabs_create\` quando não houver aba adequada.
- Trabalhe apenas nas abas do grupo desta sessão; não toque em outras janelas.
- Use \`browser_batch\` para sequências de ações independentes.
- Depois de navegar, clicar ou preencher, confirme com \`browser_read_page\`,
  \`browser_get_page_text\`, \`browser_read_console_messages\` ou
  \`browser_read_network_requests\` antes de concluir.
- Prefira \`browser_find\` e refs da árvore de acessibilidade a coordenadas.
- Peça confirmação antes de ações destrutivas ou que enviem dados reais.
- Não leia, escreva ou edite arquivos; não execute comandos; não use dados da
  máquina que não estejam visíveis na página.
- Se faltar uma ferramenta para a tarefa, explique a limitação em vez de
  improvisar outro caminho.
`
}

/** Grava o agente do navegador no `.opencode/agents` do diretório da sessão. */
export function ensureAgentFile(directory?: string): string {
  const raw = directory && directory.trim() ? expandHome(directory.trim()) : WORKSPACE
  const base = isAbsolute(raw) ? raw : WORKSPACE
  const dir = join(base, ".opencode", "agents")
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `${AGENT_ID}.md`)
  const content = agentMarkdown()
  let current = ""
  try {
    current = readFileSync(file, "utf8")
  } catch {
    // arquivo ainda não existe
  }
  if (current !== content) writeFileSync(file, content, "utf8")
  return file
}

interface RelayGlobal {
  active: Socket | null
  pending: Map<string, Pending>
  server: { stop(force?: boolean): void } | null
  serverVersion: number
  port: number
  instances: number
}

/** Incrementar quando o servidor do relay mudar de forma incompatível. */
const SERVER_VERSION = 3

type Carrier = typeof globalThis & { __opencodeBrowserRelay?: Partial<RelayGlobal> }

// O OpenCode carrega o plugin várias vezes (uma por contexto/location) e cada
// instância pode ter seu próprio globalThis. `process` é compartilhado pelo
// processo, então guardamos o estado do relay nele.
const carrier = ((globalThis as unknown as { process?: Carrier }).process ?? globalThis) as Carrier

function relay(): RelayGlobal {
  const existing = carrier.__opencodeBrowserRelay
  if (existing && existing.pending instanceof Map) return existing as RelayGlobal
  const created: RelayGlobal = {
    active: existing?.active ?? null,
    pending: new Map<string, Pending>(),
    server: existing?.server ?? null,
    serverVersion: existing?.serverVersion ?? 0,
    port: existing?.port ?? PORT,
    instances: existing?.instances ?? 0,
  }
  carrier.__opencodeBrowserRelay = created
  return created
}

function log(message: string, error?: unknown): void {
  const suffix = error instanceof Error ? `: ${error.message}` : error ? `: ${String(error)}` : ""
  console.error(`[opencode-browser] ${message}${suffix}`)
}

function isAllowedOrigin(origin: string): boolean {
  if (!origin.startsWith("chrome-extension://")) return false
  if (ALLOW_ANY_EXTENSION) return true
  return origin === `chrome-extension://${EXPECTED_EXTENSION_ID}`
}

function send(socket: Socket | null, payload: unknown): boolean {
  if (!socket) return false
  try {
    socket.send(JSON.stringify(payload))
    return true
  } catch {
    return false
  }
}

function failPending(socket: Socket, reason: string): void {
  for (const [id, item] of relay().pending) {
    if (item.socket !== socket) continue
    clearTimeout(item.timer)
    relay().pending.delete(id)
    item.reject(new Error(reason))
  }
}

const TOKEN_FILE = join(tmpdir(), "opencode-browser-relay.token")

/** Pasta onde ficam as conversas criadas pela extensão. */
const WORKSPACE = join(homedir(), ".opencode-browser-extensions")

interface RelayInfo {
  token: string
  port: number
}

function readRelayInfo(): RelayInfo | null {
  try {
    const raw = readFileSync(TOKEN_FILE, "utf8").trim()
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<RelayInfo>
    if (typeof parsed.token === "string" && parsed.token && typeof parsed.port === "number") {
      return { token: parsed.token, port: parsed.port }
    }
  } catch {
    // arquivo ausente ou legado
  }
  return null
}

function writeRelayInfo(info: RelayInfo): void {
  try {
    writeFileSync(TOKEN_FILE, JSON.stringify(info), { mode: 0o600 })
  } catch {
    // sem persistência; usa o valor local
  }
}

function relayInfo(): RelayInfo {
  const existing = readRelayInfo()
  if (existing) return existing
  const created: RelayInfo = { token: crypto.randomUUID(), port: relay().port || PORT }
  writeRelayInfo(created)
  return readRelayInfo() ?? created
}

function relayToken(): string {
  return relayInfo().token
}

function publishPort(port: number): void {
  const info = relayInfo()
  writeRelayInfo({ token: info.token, port })
}

function relayHeaders(): Record<string, string> {
  return { "content-type": "application/json", "x-relay-token": relayToken() }
}

async function callToolOverHttp(
  tool: string,
  args: Record<string, unknown>,
  context: { sessionID: string; signal: AbortSignal },
): Promise<ToolResponse> {
  const id = `http_${crypto.randomUUID()}`
  const target = relayInfo().port
  const controller = new AbortController()
  const onAbort = () => {
    controller.abort()
    void fetch(`http://127.0.0.1:${target}/cancel`, {
      method: "POST",
      headers: relayHeaders(),
      body: JSON.stringify({ id }),
    }).catch(() => undefined)
  }
  context.signal.addEventListener("abort", onAbort, { once: true })
  try {
    const response = await fetch(`http://127.0.0.1:${target}/tool`, {
      method: "POST",
      headers: relayHeaders(),
      body: JSON.stringify({ id, tool, args, sessionID: context.sessionID }),
      signal: controller.signal,
    })
    const data = (await response.json().catch(() => ({}))) as ToolResponse & { error?: string }
    if (!response.ok) {
      throw new Error(data.error ?? `Relay HTTP ${response.status}.`)
    }
    return data
  } catch (error) {
    if (context.signal.aborted) throw new Error("Execução cancelada.", { cause: error })
    throw error instanceof Error ? error : new Error(String(error), { cause: error })
  } finally {
    context.signal.removeEventListener("abort", onAbort)
  }
}

async function handleHttpTool(request: Request): Promise<Response> {
  let body: { id?: string; tool?: string; args?: Record<string, unknown>; sessionID?: string }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return Response.json({ ok: false, error: "JSON inválido." }, { status: 400 })
  }
  if (typeof body.tool !== "string" || body.tool.length === 0) {
    return Response.json({ ok: false, error: "Parâmetro tool ausente." }, { status: 400 })
  }
  const socket = relay().active
  if (!socket) {
    return Response.json(
      { ok: false, error: "A extensão OpenCode Browser não está conectada." },
      { status: 503 },
    )
  }
  const id = typeof body.id === "string" ? body.id : `http_${crypto.randomUUID()}`
  try {
    const result = await new Promise<ToolResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        relay().pending.delete(id)
        send(socket, { type: "cancel", id })
        reject(new Error(`A extensão não respondeu em ${CALL_TIMEOUT_MS / 1000}s.`))
      }, CALL_TIMEOUT_MS)
      relay().pending.set(id, { socket, resolve, reject, timer })
      const sent = send(socket, {
        type: "tool_request",
        id,
        tool: body.tool as string,
        args: body.args ?? {},
        sessionID: body.sessionID,
      })
      if (!sent) {
        relay().pending.delete(id)
        clearTimeout(timer)
        reject(new Error("Falha ao enviar o pedido para a extensão."))
      }
    })
    return Response.json(result)
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}

async function handleHttpCancel(request: Request): Promise<Response> {
  let body: { id?: string }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return Response.json({ ok: true })
  }
  const id = body.id
  const item = id ? relay().pending.get(id) : undefined
  if (item && id) {
    clearTimeout(item.timer)
    relay().pending.delete(id)
    send(item.socket, { type: "cancel", id })
    item.reject(new Error("Execução cancelada."))
  }
  return Response.json({ ok: true })
}

function callTool(
  tool: string,
  args: Record<string, unknown>,
  context: { sessionID: string; signal: AbortSignal; progress: Progress },
): Promise<ToolResponse> {
  const socket = relay().active
  if (!socket) {
    return callToolOverHttp(tool, args, context)
  }
  const id = `call_${crypto.randomUUID()}`

  return new Promise<ToolResponse>((resolve, reject) => {
    const timer = setTimeout(() => {
      relay().pending.delete(id)
      send(socket, { type: "cancel", id })
      reject(new Error(`A extensão não respondeu em ${CALL_TIMEOUT_MS / 1000}s.`))
    }, CALL_TIMEOUT_MS)

    relay().pending.set(id, {
      socket,
      resolve,
      reject,
      timer,
      progress: context.progress,
    })

    const onAbort = () => {
      const item = relay().pending.get(id)
      if (!item) return
      relay().pending.delete(id)
      clearTimeout(item.timer)
      send(socket, { type: "cancel", id })
      reject(new Error("Execução cancelada."))
    }
    context.signal.addEventListener("abort", onAbort, { once: true })

    const sent = send(socket, {
      type: "tool_request",
      id,
      tool,
      args,
      sessionID: context.sessionID,
    })
    if (!sent) {
      relay().pending.delete(id)
      clearTimeout(timer)
      reject(new Error("Falha ao enviar o pedido para a extensão."))
    }
  })
}

function buildContent(result: ToolResponse) {
  const text = result.content?.trim() || "(sem saída)"
  // O OpenCode aceita bytes em base64 no campo `uri` de Tool.FileContent.
  const images = (result.images ?? []).slice(0, 3).map((image) => ({
    type: "file" as const,
    uri: image.data,
    mime: image.mime,
    name: image.name,
  }))
  if (images.length === 0) return text
  return [{ type: "text" as const, text }, ...images]
}

// ---------------------------------------------------------------------------
// Especificações das tools (JSON Schema)
// ---------------------------------------------------------------------------

const tabId = { type: "number", description: "ID da aba dentro do grupo desta sessão." }

const tools = [
  {
    name: "tabs_context",
    description:
      "Lista as abas do grupo desta sessão. Use antes de qualquer ferramenta que exija tabId. Se não houver grupo, use createIfEmpty.",
    input: {
      type: "object",
      properties: {
        createIfEmpty: { type: "boolean", description: "Cria um grupo/aba se ainda não existir." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "tabs_create",
    description: "Cria uma nova aba dentro do grupo desta sessão e devolve o tabId.",
    input: {
      type: "object",
      properties: { url: { type: "string" }, active: { type: "boolean" } },
      additionalProperties: false,
    },
  },
  {
    name: "tabs_attach",
    description:
      "Move uma aba existente (informada por tabId ou a aba ativa do navegador) para o grupo desta sessão, dando ao agente acesso ao que já está aberto. Pede permissão. A aba sai do grupo atual do usuário.",
    input: {
      type: "object",
      properties: { tabId },
      additionalProperties: false,
    },
  },
  {
    name: "tabs_close",
    description: "Fecha uma aba do grupo desta sessão.",
    input: { type: "object", properties: { tabId }, required: ["tabId"], additionalProperties: false },
  },
  {
    name: "navigate",
    description:
      "Navega para uma URL ou vai para trás/frente no histórico. Pede permissão para domínios novos.",
    input: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL absoluta ou domínio; https:// é adicionado se faltar." },
        direction: { type: "string", enum: ["back", "forward"] },
        tabId,
      },
      additionalProperties: false,
    },
  },
  {
    name: "read_page",
    description:
      "Retorna a árvore de acessibilidade da página com refs (ref_1, ref_2...). Use as refs em computer/form_input/find. Com frames=all, refs de iframes vêm prefixadas como f<frameId>_ref_N.",
    input: {
      type: "object",
      properties: {
        filter: { type: "string", enum: ["interactive", "all"] },
        depth: { type: "number" },
        ref_id: { type: "string" },
        max_chars: { type: "number" },
        include_hidden: { type: "boolean" },
        frames: { type: "string", enum: ["main", "all"] },
        tabId,
      },
      additionalProperties: false,
    },
  },
  {
    name: "find",
    description:
      "Busca heurística por elementos usando texto/role/nome. Retorna até 20 refs. Prefira read_page filter=interactive para páginas grandes.",
    input: {
      type: "object",
      properties: {
        query: { type: "string" },
        max_results: { type: "number" },
        frames: { type: "string", enum: ["main", "all"] },
        tabId,
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "get_page_text",
    description: "Extrai o texto principal da página (artigo/main/body), sem HTML. Com frames=all, concatena também o texto dos iframes.",
    input: {
      type: "object",
      properties: { max_chars: { type: "number" }, frames: { type: "string", enum: ["main", "all"] }, tabId },
      additionalProperties: false,
    },
  },
  {
    name: "form_input",
    description: "Preenche um campo identificado por ref (input, textarea, select ou contenteditable).",
    input: {
      type: "object",
      properties: { ref: { type: "string" }, value: { type: "string" }, tabId },
      required: ["ref", "value"],
      additionalProperties: false,
    },
  },
  {
    name: "computer",
    description:
      "Interage com a página via eventos confiáveis: click, type, key, scroll, hover, screenshot, zoom e wait. Use ref de read_page/find ou coordinate [x,y]. Refs de iframe (f<id>_ref_N) funcionam para click/hover/scroll/type via eventos de DOM.",
    input: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["click", "type", "key", "scroll", "hover", "screenshot", "zoom", "wait"],
        },
        ref: { type: "string" },
        coordinate: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 },
        text: { type: "string" },
        keys: { type: "string", description: "Ex.: Enter, Tab, Ctrl+A." },
        submit: { type: "boolean" },
        click_count: { type: "number" },
        button: { type: "string", enum: ["left", "right", "middle"] },
        scroll_direction: { type: "string", enum: ["up", "down", "left", "right"] },
        scroll_amount: { type: "number" },
        duration: { type: "number", description: "Segundos para action=wait (máx. 10)." },
        region: { type: "array", items: { type: "number" }, minItems: 4, maxItems: 4 },
        tabId,
      },
      required: ["action"],
      additionalProperties: false,
    },
  },
  {
    name: "javascript_tool",
    description:
      "Executa JavaScript no contexto da página. Retorna o valor da última expressão. Pede permissão e corta a saída em 50 KB.",
    input: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["javascript_exec"] },
        text: { type: "string", description: "Código JavaScript." },
        tabId,
      },
      required: ["text"],
      additionalProperties: false,
    },
  },
  {
    name: "read_console_messages",
    description:
      "Lê mensagens de console/erros da aba. O monitoramento começa quando a ferramenta é usada; recarregue a página para capturar o carregamento.",
    input: {
      type: "object",
      properties: {
        pattern: { type: "string" },
        onlyErrors: { type: "boolean" },
        limit: { type: "number" },
        clear: { type: "boolean" },
        tabId,
      },
      additionalProperties: false,
    },
  },
  {
    name: "read_network_requests",
    description:
      "Lê requisições de rede (XHR/fetch/documentos) da aba. O monitoramento começa quando a ferramenta é usada.",
    input: {
      type: "object",
      properties: {
        urlPattern: { type: "string" },
        limit: { type: "number" },
        clear: { type: "boolean" },
        tabId,
      },
      additionalProperties: false,
    },
  },
  {
    name: "resize_window",
    description: "Redimensiona a janela da aba para testar layouts responsivos.",
    input: {
      type: "object",
      properties: { width: { type: "number" }, height: { type: "number" }, tabId },
      required: ["width", "height"],
      additionalProperties: false,
    },
  },
  {
    name: "update_plan",
    description:
      "Apresenta um plano de navegação (domínios + passos) para aprovação. Os domínios aprovados ficam liberados nesta sessão.",
    input: {
      type: "object",
      properties: {
        domains: { type: "array", items: { type: "string" } },
        approach: { type: "array", items: { type: "string" } },
      },
      required: ["domains", "approach"],
      additionalProperties: false,
    },
  },
  {
    name: "upload_image",
    description:
      "Envia arquivos (bytes em base64) para um input[type=file] ou área de drag & drop identificada por ref. Pede permissão. Máximo de 3 arquivos e ~5 MB cada.",
    input: {
      type: "object",
      properties: {
        ref: { type: "string", description: "Ref do input de arquivo ou do alvo de drop." },
        files: {
          type: "array",
          minItems: 1,
          maxItems: 3,
          items: {
            type: "object",
            properties: {
              data: { type: "string", description: "Bytes do arquivo em base64." },
              name: { type: "string" },
              mimeType: { type: "string" },
            },
            required: ["data", "name"],
            additionalProperties: false,
          },
        },
        tabId,
      },
      required: ["ref", "files"],
      additionalProperties: false,
    },
  },
  {
    name: "gif_creator",
    description:
      "Grava as ações do agente como quadros (screenshot por ação) e exporta um GIF animado. Use action=start antes de navegar/interagir, action=stop ao terminar e action=export para gerar o arquivo.",
    input: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["start", "stop", "export"] },
      },
      required: ["action"],
      additionalProperties: false,
    },
  },
  {
    name: "browser_batch",
    description: "Executa até 20 ferramentas browser_* em sequência. Use para reduzir idas e voltas.",
    input: {
      type: "object",
      properties: {
        actions: {
          type: "array",
          minItems: 1,
          maxItems: 20,
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              input: { type: "object" },
            },
            required: ["name", "input"],
            additionalProperties: false,
          },
        },
      },
      required: ["actions"],
      additionalProperties: false,
    },
  },
] as const

// Não importe `@opencode/plugin` aqui: este arquivo é copiado para
// ~/.config/opencode/plugins e versões antigas do serviço não resolvem esse
// pacote. `Plugin.define` é apenas um helper de identidade; o objeto abaixo já
// é um plugin V2 válido (id + setup).
export default {
  id: "opencode.browser-relay",
  async setup(ctx) {
    try {
      mkdirSync(WORKSPACE, { recursive: true })
      ensureAgentFile(WORKSPACE)
    } catch (error) {
      log(`não foi possível criar a pasta de conversas ${WORKSPACE}`, error)
    }
    const state = relay()
    state.instances += 1
    let ownsServer = false
    if (state.server && state.serverVersion !== SERVER_VERSION) {
      try {
        state.server.stop(true)
      } catch {
        // ignore
      }
      state.server = null
      state.active = null
    }
    if (!state.server) {
      for (const candidate of PORT_CANDIDATES) {
        try {
        const server = Bun.serve<SocketData>({
        hostname: "127.0.0.1",
        port: candidate,
        fetch(request, bunServer) {
          const url = new URL(request.url)
          if (request.method === "POST" && (url.pathname === "/tool" || url.pathname === "/cancel")) {
            if ((request.headers.get("x-relay-token") ?? "") !== relayToken()) {
              return new Response("Forbidden", { status: 403 })
            }
            return url.pathname === "/cancel" ? handleHttpCancel(request) : handleHttpTool(request)
          }
          if (url.pathname === "/health") {
            return Response.json({
              connected: Boolean(relay().active),
              version: SERVER_VERSION,
              workspace: WORKSPACE,
            })
          }
          if (url.pathname !== "/" && url.pathname !== "/ws") {
            return new Response("Not found", { status: 404 })
          }
          const origin = request.headers.get("origin") ?? ""
          if (!isAllowedOrigin(origin)) {
            return new Response("Forbidden origin", { status: 403 })
          }
          const upgraded = bunServer.upgrade(request, {
            data: { origin, id: crypto.randomUUID(), lastPong: Date.now() },
          })
          if (!upgraded) return new Response("WebSocket upgrade failed", { status: 400 })
          return undefined
        },
        websocket: {
          open(socket) {
            const current = relay().active
            if (current && current !== socket) {
              try {
                current.close(1000, "Nova conexão da extensão")
              } catch {
                // ignore
              }
            }
            relay().active = socket
            socket.data.lastPong = Date.now()
            if (socket.data.pingTimer) clearInterval(socket.data.pingTimer)
            socket.data.pingTimer = setInterval(() => {
              if (Date.now() - socket.data.lastPong > 60_000) {
                try {
                  socket.close(4001, "extensão sem resposta")
                } catch {
                  // ignore
                }
                return
              }
              send(socket, { type: "ping" })
            }, 20_000)
            log(`extensão conectada (${socket.data.origin})`)
            send(socket, { type: "ready", v: 1, home: homedir(), workspace: WORKSPACE })
          },
          message(socket, raw) {
            if (typeof raw !== "string") return
            let message: Record<string, unknown>
            try {
              message = JSON.parse(raw) as Record<string, unknown>
            } catch {
              return
            }
            if (message.type === "hello") {
              if (!ALLOW_ANY_EXTENSION && message.extensionId !== EXPECTED_EXTENSION_ID) {
                socket.close(1008, "Extensão não autorizada")
                return
              }
              return
            }
            if (message.type === "ensure_agent") {
              const id = typeof message.id === "string" ? message.id : ""
              if (!id) return
              try {
                const path = ensureAgentFile(
                  typeof message.directory === "string" ? message.directory : undefined,
                )
                send(socket, { type: "ensure_agent_result", id, ok: true, path })
              } catch (error) {
                send(socket, {
                  type: "ensure_agent_result",
                  id,
                  ok: false,
                  error: error instanceof Error ? error.message : String(error),
                })
              }
              return
            }
            if (message.type === "pong") {
              socket.data.lastPong = Date.now()
              return
            }
            if (message.type === "progress" && typeof message.id === "string") {
              const item = relay().pending.get(message.id)
              if (item?.progress) {
                void item.progress({
                  phase: message.phase ?? "running",
                  detail: message.detail,
                })
              }
              return
            }
            if (message.type === "tool_result" && typeof message.id === "string") {
              const item = relay().pending.get(message.id)
              if (!item) return
              relay().pending.delete(message.id)
              clearTimeout(item.timer)
              if (message.ok === false) {
                item.reject(new Error(typeof message.error === "string" ? message.error : "A extensão retornou um erro."))
                return
              }
              item.resolve({
                ok: true,
                content: typeof message.content === "string" ? message.content : undefined,
                images: Array.isArray(message.images) ? (message.images as ImagePayload[]) : undefined,
                metadata:
                  message.metadata && typeof message.metadata === "object"
                    ? (message.metadata as Record<string, unknown>)
                    : undefined,
              })
            }
          },
          close(socket) {
            if (socket.data.pingTimer) clearInterval(socket.data.pingTimer)
            if (relay().active === socket) relay().active = null
            failPending(socket, "A extensão desconectou durante a execução.")
            log("extensão desconectada")
          },
        },
        })
        state.server = server
        state.serverVersion = SERVER_VERSION
        state.port = candidate
        ownsServer = true
        publishPort(candidate)
        log(`relay ouvindo em ws://127.0.0.1:${candidate}`)
        break
        } catch (error) {
          log(`porta ${candidate} indisponível`, error)
        }
      }
      if (!state.server) log("não foi possível abrir o relay em nenhuma porta candidata")
    }

    await ctx.tool.transform((editor) => {
      editor.namespace({
        name: "browser",
        description:
          "Controla o Chrome através da extensão OpenCode Browser (abas, acessibilidade, cliques, screenshots, console e rede).",
      })
      for (const spec of tools) {
        editor.add({
          name: spec.name,
          description: spec.description,
          input: spec.input,
          options: { namespace: "browser", codemode: false },
          execute: async (input: unknown, context: { sessionID: string; signal: AbortSignal; progress: Progress }) => {
            const args =
              input && typeof input === "object" && !Array.isArray(input)
                ? (input as Record<string, unknown>)
                : {}
            const result = await callTool(spec.name, args, {
              sessionID: context.sessionID,
              signal: context.signal,
              progress: context.progress,
            })
            return {
              content: buildContent(result),
              metadata: result.metadata,
            }
          },
        })
      }
    })

    return () => {
      const current = relay()
      current.instances = Math.max(0, (current.instances ?? 0) - 1)
      if (current.instances > 0) return
      for (const [id, item] of current.pending ?? []) {
        clearTimeout(item.timer)
        current.pending?.delete(id)
        item.reject(new Error("O plugin do OpenCode foi encerrado."))
      }
      if (ownsServer && current.server) {
        try {
          current.server.stop(true)
        } catch {
          // ignore
        }
        current.server = null
      }
      current.active = null
    }
  },
}
