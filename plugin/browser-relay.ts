import {
  chmodSync,
  copyFileSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { timingSafeEqual } from "node:crypto"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * Ponte entre o OpenCode e a extensão OpenCode Browser.
 *
 * A extensão conecta em ws://127.0.0.1:8799. Quando o modelo chama uma tool
 * `browser_*`, este plugin envia um `tool_request` e espera o `tool_result`.
 *
 * Variáveis de ambiente:
 * - OPENCODE_BROWSER_RELAY_PORT        porta base (padrão 8799)
 * - OPENCODE_BROWSER_EXTENSION_ID      id da extensão autorizada
 * - OPENCODE_BROWSER_ALLOW_ANY_EXTENSION=1  aceita qualquer chrome-extension://
 * - OPENCODE_BROWSER_REQUIRE_HELLO=0   desliga a exigência de `hello` (padrão: exige)
 * - OPENCODE_BROWSER_WS_SECRET         segredo opcional que o `hello` deve conter
 */

const PORT = Number(process.env.OPENCODE_BROWSER_RELAY_PORT ?? 8799)
const PORT_CANDIDATES = [PORT, PORT + 1, PORT + 2, PORT + 3]
const EXPECTED_EXTENSION_ID =
  process.env.OPENCODE_BROWSER_EXTENSION_ID ?? "meapihkmghapjefepmkckpikedpimhin"
const ALLOW_ANY_EXTENSION = process.env.OPENCODE_BROWSER_ALLOW_ANY_EXTENSION === "1"
const REQUIRE_HELLO = process.env.OPENCODE_BROWSER_REQUIRE_HELLO !== "0"
const WS_SECRET = process.env.OPENCODE_BROWSER_WS_SECRET ?? ""
const CALL_TIMEOUT_MS = 180_000
const HELLO_TIMEOUT_MS = 5_000
/**
 * O service worker (MV3) da extensão pode dormir e reconectar. Em vez de falhar
 * na hora, as chamadas esperam um pouco pela reconexão.
 */
const EXTENSION_GRACE_MS = 8_000
const MAX_HTTP_BODY = 1_000_000
const MAX_WS_PAYLOAD = 24 * 1024 * 1024
const MAX_IMAGE_BASE64 = 8 * 1024 * 1024
const IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"])
const AGENT_ID = "opencode-browser"

/** Caminho do template do agente ao lado deste arquivo (robusto no Vitest). */
function agentTemplatePath(): string {
  const url = import.meta.url
  if (url.startsWith("file:")) {
    return join(fileURLToPath(new URL(".", url)), "opencode-browser.agent.md")
  }
  // Vitest transforma o módulo em uma URL que não é `file:`.
  return join(process.cwd(), "plugin", "opencode-browser.agent.md")
}

type ImagePayload = { name: string; mime: string; data: string }

type ToolResponse = {
  ok: boolean
  content?: string
  images?: ImagePayload[]
  error?: string
  metadata?: Record<string, unknown>
}

type Progress = (update: Record<string, unknown>) => Promise<void>

type SocketData = {
  origin: string
  id: string
  /** Timestamp do último pong; prova de vida da extensão. */
  lastPong: number
  /** Só sockets autenticados (hello válido) podem virar o `active`. */
  authed: boolean
  pingTimer?: ReturnType<typeof setInterval>
  helloTimer?: ReturnType<typeof setTimeout>
}

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function expandHome(value: string): string {
  if (value === "~") return homedir()
  if (value.startsWith("~/") || value.startsWith("~\\")) {
    return join(homedir(), value.slice(2))
  }
  return value
}

/** Configuração do OpenCode: respeita XDG_CONFIG_HOME como o resto do plugin. */
function opencodeConfigHome(): string {
  const xdg = process.env.XDG_CONFIG_HOME?.trim()
  return xdg ? expandHome(xdg) : join(homedir(), ".config")
}

// ---------------------------------------------------------------------------
// Arquivo do agente (com atualização por versão)
// ---------------------------------------------------------------------------

const AGENT_MARKER = /<!--\s*opencode-browser-agent v(\d+)\s*-->/

function markerVersion(text: string): number | null {
  const match = AGENT_MARKER.exec(text)
  return match ? Number(match[1]) : null
}

function agentMarkdown(): string {
  const template = agentTemplatePath()
  try {
    return readFileSync(template, "utf8")
  } catch {
    throw new Error(
      `Template do agente não encontrado em ${template}. Rode \`npm run install:plugin\`.`,
    )
  }
}

/**
 * Garante o agente do navegador na configuração global do OpenCode
 * (`~/.config/opencode/agents`, ou `$XDG_CONFIG_HOME/opencode/agents`).
 *
 * - Não existe: cria a partir do template.
 * - Existe e tem o marcador `opencode-browser-agent vN` com N menor que o do
 *   template: faz backup (`.bak-vN`) e atualiza.
 * - Existe sem marcador (o usuário o removeu) ou com versão igual/maior: o
 *   arquivo é do usuário e não é tocado.
 *
 * Exportada para os testes. O loader de plugins usa o `export default`; o
 * arquivo é copiado sozinho para `~/.config/opencode/plugins`, então a função
 * precisa viver neste módulo.
 */
export function ensureAgentFile(configHome = opencodeConfigHome()): string {
  const file = join(configHome, "opencode", "agents", `${AGENT_ID}.md`)
  let current: string | null = null
  try {
    current = readFileSync(file, "utf8")
  } catch {
    // ainda não existe
  }

  if (current === null) {
    const template = agentMarkdown()
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, template, "utf8")
    return file
  }

  const have = markerVersion(current)
  if (have === null) return file
  let template: string
  try {
    template = agentMarkdown()
  } catch {
    return file
  }
  const want = markerVersion(template)
  if (want !== null && have < want) {
    const backup = `${file}.bak-v${have}`
    copyFileSync(file, backup)
    writeFileSync(file, template, "utf8")
    log(`agente atualizado de v${have} para v${want} (backup: ${backup})`)
  }
  return file
}

// ---------------------------------------------------------------------------
// Estado compartilhado do relay
// ---------------------------------------------------------------------------

interface RelayGlobal {
  active: Socket | null
  pending: Map<string, Pending>
  server: { stop(force?: boolean): void } | null
  serverVersion: number
  port: number
  instances: number
  /** Token do servidor que roda NESTE processo. */
  token?: string
  /** Porta de um relay que roda em OUTRO processo (modo cliente HTTP). */
  remotePort?: number
  starting?: Promise<void>
  /** Chamadas aguardando a extensão (re)conectar. */
  waiters: Array<() => void>
}

/** Incrementar quando o servidor do relay mudar de forma incompatível. */
const SERVER_VERSION = 6

type Carrier = typeof globalThis & { __opencodeBrowserRelay?: Partial<RelayGlobal> }

// O OpenCode carrega o plugin várias vezes (uma por contexto/location) e cada
// instância pode ter seu próprio globalThis. `process` é compartilhado pelo
// processo, então guardamos o estado do relay nele.
const carrier = ((globalThis as unknown as { process?: Carrier }).process ?? globalThis) as Carrier

function relay(): RelayGlobal {
  const existing = carrier.__opencodeBrowserRelay
  if (existing && existing.pending instanceof Map) {
    existing.waiters ??= []
    return existing as RelayGlobal
  }
  const created: RelayGlobal = {
    active: existing?.active ?? null,
    pending: new Map<string, Pending>(),
    server: existing?.server ?? null,
    serverVersion: existing?.serverVersion ?? 0,
    port: existing?.port ?? PORT,
    instances: existing?.instances ?? 0,
    token: existing?.token,
    remotePort: existing?.remotePort,
    starting: existing?.starting,
    waiters: existing?.waiters ?? [],
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

/** Defesa contra DNS rebinding: só aceita Host loopback com a porta do servidor. */
function isAllowedHost(request: Request, port: number): boolean {
  const host = (request.headers.get("host") ?? "").toLowerCase()
  return host === `127.0.0.1:${port}` || host === `localhost:${port}` || host === `[::1]:${port}`
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

function cancelPending(id: string, reason: string): void {
  const item = relay().pending.get(id)
  if (!item) return
  relay().pending.delete(id)
  clearTimeout(item.timer)
  send(item.socket, { type: "cancel", id })
  item.reject(new Error(reason))
}

/** Pasta onde ficam as conversas criadas pela extensão. */
const WORKSPACE = join(homedir(), ".opencode-browser-extensions")

// ---------------------------------------------------------------------------
// Token/porta do relay (arquivo privado, só do usuário atual)
// ---------------------------------------------------------------------------

interface RelayInfo {
  token: string
  port: number
}

/**
 * Pasta privada para o token. Evita `/tmp` com nome previsível, onde outro
 * usuário da máquina poderia plantar um arquivo com token/porta falsos.
 */
function relayDir(): string {
  const runtime = process.env.XDG_RUNTIME_DIR?.trim()
  if (runtime) return join(runtime, "opencode-browser")
  const cache = process.env.XDG_CACHE_HOME?.trim()
  return join(cache ? expandHome(cache) : join(homedir(), ".cache"), "opencode-browser")
}

function relayFile(): string {
  return join(relayDir(), "relay.json")
}

/** Arquivo/pasta regular (não symlink), do usuário atual e sem acesso a grupo/outros. */
function isTrusted(path: string): boolean {
  if (process.platform === "win32") return true
  try {
    const stat = lstatSync(path)
    if (!stat.isFile() && !stat.isDirectory()) return false
    const uid = process.getuid?.()
    if (uid !== undefined && stat.uid !== uid) return false
    return (stat.mode & 0o077) === 0
  } catch {
    return false
  }
}

function readRelayInfo(): RelayInfo | null {
  try {
    if (!isTrusted(relayDir()) || !isTrusted(relayFile())) return null
    const parsed = JSON.parse(readFileSync(relayFile(), "utf8")) as Partial<RelayInfo>
    if (typeof parsed.token === "string" && parsed.token && typeof parsed.port === "number") {
      return { token: parsed.token, port: parsed.port }
    }
  } catch {
    // arquivo ausente ou inválido
  }
  return null
}

function writeRelayInfo(info: RelayInfo): boolean {
  const dir = relayDir()
  try {
    mkdirSync(dir, { recursive: true, mode: 0o700 })
    try {
      chmodSync(dir, 0o700)
    } catch {
      // se não somos donos, isTrusted() recusa abaixo
    }
    if (!isTrusted(dir)) {
      log(`pasta ${dir} não é confiável (dono/permissões); token não gravado`)
      return false
    }
    // Escrita atômica: arquivo temporário exclusivo + rename.
    const tmp = join(dir, `relay.${process.pid}.${crypto.randomUUID()}.tmp`)
    try {
      writeFileSync(tmp, JSON.stringify(info), { mode: 0o600, flag: "wx" })
      renameSync(tmp, relayFile())
    } catch (error) {
      rmSync(tmp, { force: true })
      throw error
    }
    return true
  } catch (error) {
    log("não foi possível gravar o token do relay", error)
    return false
  }
}

function removeRelayInfoIfOwned(token: string | undefined): void {
  if (!token) return
  const info = readRelayInfo()
  if (info?.token === token) rmSync(relayFile(), { force: true })
}

function tokenMatches(provided: string): boolean {
  const expected = relay().token
  if (!expected || !provided) return false
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

// ---------------------------------------------------------------------------
// Imagens
// ---------------------------------------------------------------------------

/** Pasta onde as capturas do agente ficam: `~/.cache/opencode-browser/capturas` (ou em `$XDG_CACHE_HOME`). */
export function captureDir(): string {
  const base = process.env.XDG_CACHE_HOME || join(homedir(), ".cache")
  return join(base, "opencode-browser", "capturas")
}

const IMAGE_EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" }

/**
 * Grava as imagens da resposta em disco e devolve os caminhos.
 *
 * A extensão entrega a captura em base64 e ela só existiria dentro da conversa; o agente que precisa montar um HTML
 * com a tela embutida (mapa de requisitos, guia do usuário) precisa do arquivo. Falha de escrita não derruba a tool: o
 * texto da resposta apenas sai sem o caminho.
 */
export function saveImages(images: ImagePayload[]): string[] {
  if (images.length === 0) return []
  const carimbo = new Date().toISOString().replace(/[-:]/g, "").replace(/\..*$/, "").replace("T", "-")
  const caminhos: string[] = []
  try {
    mkdirSync(captureDir(), { recursive: true, mode: 0o700 })
    images.forEach((image, index) => {
      const extensao = IMAGE_EXT[image.mime] ?? "bin"
      const caminho = join(captureDir(), `captura-${carimbo}-${index + 1}.${extensao}`)
      writeFileSync(caminho, Buffer.from(image.data, "base64"), { mode: 0o600 })
      caminhos.push(caminho)
    })
  } catch (error) {
    log("não foi possível gravar a captura em disco", error)
  }
  return caminhos
}

function sanitizeImages(value: unknown): { images?: ImagePayload[]; dropped: number } {
  if (!Array.isArray(value)) return { dropped: 0 }
  const images: ImagePayload[] = []
  for (const item of value) {
    if (!isRecord(item)) continue
    const { name, mime, data } = item
    if (typeof data !== "string" || typeof mime !== "string") continue
    if (!IMAGE_MIMES.has(mime) || data.length > MAX_IMAGE_BASE64) continue
    images.push({ name: typeof name === "string" ? name : "imagem", mime, data })
    if (images.length >= 3) break
  }
  return { images: images.length ? images : undefined, dropped: Math.max(0, value.length - images.length) }
}

function buildContent(result: ToolResponse) {
  const text = result.content?.trim() || "(no output)"
  // As capturas também vão para o disco, e o caminho volta no texto: o agente precisa do arquivo para montar páginas
  // que embutem a tela (mapa de requisitos, guias), não só da imagem na conversa.
  const arquivos = saveImages(result.images ?? [])
  const resposta = arquivos.length ? `${text}\nArquivo: ${arquivos.join(" ")}` : text
  // O OpenCode aceita bytes em base64 no campo `uri` de Tool.FileContent.
  const images = (result.images ?? []).slice(0, 3).map((image) => ({
    type: "file" as const,
    uri: image.data,
    mime: image.mime,
    name: image.name,
  }))
  if (images.length === 0) return resposta
  return [{ type: "text" as const, text: resposta }, ...images]
}

// ---------------------------------------------------------------------------
// Despacho de chamadas para a extensão
// ---------------------------------------------------------------------------

/**
 * `browser_batch`: remove o prefixo `browser_` dos nomes internos, já que as
 * demais tools chegam à extensão sem prefixo. É idempotente.
 */
function normalizeArgs(tool: string, args: Record<string, unknown>): Record<string, unknown> {
  if (tool !== "browser_batch" || !Array.isArray(args.actions)) return args
  return {
    ...args,
    actions: args.actions.map((action) => {
      if (isRecord(action) && typeof action.name === "string") {
        return { ...action, name: action.name.replace(/^browser_/, "") }
      }
      return action
    }),
  }
}

function dispatch(
  socket: Socket,
  id: string,
  tool: string,
  args: Record<string, unknown>,
  sessionID: string | undefined,
  progress?: Progress,
): Promise<ToolResponse> {
  return new Promise<ToolResponse>((resolve, reject) => {
    const timer = setTimeout(() => {
      relay().pending.delete(id)
      send(socket, { type: "cancel", id })
      reject(new Error(`A extensão não respondeu em ${CALL_TIMEOUT_MS / 1000}s.`))
    }, CALL_TIMEOUT_MS)

    relay().pending.set(id, { socket, resolve, reject, timer, progress })

    const sent = send(socket, {
      type: "tool_request",
      id,
      tool,
      args: normalizeArgs(tool, args),
      sessionID,
    })
    if (!sent) {
      relay().pending.delete(id)
      clearTimeout(timer)
      reject(new Error("Failed to send the request to the extension."))
    }
  })
}

function waitForActive(ms: number): Promise<Socket | null> {
  const state = relay()
  if (state.active) return Promise.resolve(state.active)
  return new Promise<Socket | null>((resolve) => {
    const wake = () => {
      clearTimeout(timer)
      resolve(relay().active)
    }
    const timer = setTimeout(() => {
      const list = relay().waiters
      const index = list.indexOf(wake)
      if (index >= 0) list.splice(index, 1)
      resolve(null)
    }, ms)
    state.waiters.push(wake)
  })
}

const NOT_CONNECTED =
  "The OpenCode Browser extension is not connected. Check that Chrome is open with the extension active and try again."

async function callToolOverHttp(
  tool: string,
  args: Record<string, unknown>,
  context: { sessionID: string; signal: AbortSignal },
): Promise<ToolResponse> {
  const info = readRelayInfo()
  if (!info) {
    throw new Error("OpenCode Browser relay not found. Restart OpenCode.")
  }
  const headers = { "content-type": "application/json", "x-relay-token": info.token }
  const base = `http://127.0.0.1:${info.port}`
  const id = `http_${crypto.randomUUID()}`
  const controller = new AbortController()
  const onAbort = () => {
    controller.abort()
    void fetch(`${base}/cancel`, {
      method: "POST",
      headers,
      body: JSON.stringify({ id }),
    }).catch(() => undefined)
  }
  context.signal.addEventListener("abort", onAbort, { once: true })
  try {
    const response = await fetch(`${base}/tool`, {
      method: "POST",
      headers,
      body: JSON.stringify({ id, tool, args, sessionID: context.sessionID }),
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(CALL_TIMEOUT_MS + 5_000)]),
    })
    const data = (await response.json().catch(() => ({}))) as ToolResponse
    if (!response.ok) {
      throw new Error(data.error ?? `Relay HTTP ${response.status}.`)
    }
    return data
  } catch (error) {
    if (context.signal.aborted) throw new Error("Run cancelled.", { cause: error })
    if (error instanceof TypeError) {
      // Falha de rede: o relay do outro processo pode ter morrido. Reavalia
      // (pode assumir a porta) e pede para tentar de novo.
      relay().remotePort = undefined
      void ensureServer()
      throw new Error(
        "OpenCode Browser relay unavailable. Wait for the extension to reconnect and try again.",
        { cause: error },
      )
    }
    throw error instanceof Error ? error : new Error(String(error), { cause: error })
  } finally {
    context.signal.removeEventListener("abort", onAbort)
  }
}

async function handleHttpTool(request: Request): Promise<Response> {
  const length = Number(request.headers.get("content-length") ?? 0)
  if (length > MAX_HTTP_BODY) {
    return Response.json({ ok: false, error: "Corpo grande demais." }, { status: 413 })
  }
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON." }, { status: 400 })
  }
  if (!isRecord(body) || typeof body.tool !== "string" || !KNOWN_TOOLS.has(body.tool)) {
    return Response.json({ ok: false, error: "Parâmetro tool ausente ou desconhecido." }, { status: 400 })
  }
  if (body.args !== undefined && !isRecord(body.args)) {
    return Response.json({ ok: false, error: "Invalid args parameter." }, { status: 400 })
  }
  const socket = relay().active ?? (await waitForActive(EXTENSION_GRACE_MS))
  if (!socket) {
    return Response.json({ ok: false, error: NOT_CONNECTED }, { status: 503 })
  }
  const id =
    typeof body.id === "string" && body.id.length > 0 && body.id.length <= 100
      ? body.id
      : `http_${crypto.randomUUID()}`
  if (relay().pending.has(id)) {
    return Response.json({ ok: false, error: "call id already in use." }, { status: 409 })
  }
  try {
    const result = await dispatch(
      socket,
      id,
      body.tool,
      (body.args as Record<string, unknown> | undefined) ?? {},
      typeof body.sessionID === "string" ? body.sessionID : undefined,
    )
    return Response.json(result)
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}

async function handleHttpCancel(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as unknown
    if (isRecord(body) && typeof body.id === "string") {
      cancelPending(body.id, "Run cancelled.")
    }
  } catch {
    // corpo inválido: nada a cancelar
  }
  return Response.json({ ok: true })
}

async function callTool(
  tool: string,
  args: Record<string, unknown>,
  context: { sessionID: string; signal: AbortSignal; progress: Progress },
): Promise<ToolResponse> {
  let socket = relay().active
  // Este processo é o dono do relay: a extensão só pode estar reconectando.
  if (!socket && relay().server) {
    socket = await waitForActive(EXTENSION_GRACE_MS)
    if (!socket) throw new Error(NOT_CONNECTED)
  }
  if (!socket) {
    return callToolOverHttp(tool, args, context)
  }
  const id = `call_${crypto.randomUUID()}`
  const onAbort = () => cancelPending(id, "Run cancelled.")
  const promise = dispatch(socket, id, tool, args, context.sessionID, context.progress)
  if (context.signal.aborted) onAbort()
  else context.signal.addEventListener("abort", onAbort, { once: true })
  return promise.finally(() => context.signal.removeEventListener("abort", onAbort))
}

// ---------------------------------------------------------------------------
// Especificações das tools (JSON Schema)
// ---------------------------------------------------------------------------

type ToolSpec = {
  /** Nome exposto ao modelo (vira `browser_<name>` pelo namespace). */
  name: string
  /** Nome enviado à extensão, se diferente de `name` (compatibilidade). */
  wire?: string
  description: string
  input: Record<string, unknown>
}

const tabId = { type: "number", description: "Tab ID inside this session's group." }

const tools: ToolSpec[] = [
  {
    name: "tabs_context",
    description:
      "Lists the tabs in this session's group. Use it before any tool that requires a tabId. If there is no group yet, use createIfEmpty.",
    input: {
      type: "object",
      properties: {
        createIfEmpty: { type: "boolean", description: "Creates a group/tab if it does not exist yet." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "tabs_create",
    description:
      "Opens a URL in this session's group and returns the tabId. With the same origin (or a blank main tab) it reuses the main tab; with a different origin it opens a new tab.",
    input: {
      type: "object",
      properties: { url: { type: "string" }, active: { type: "boolean" } },
      additionalProperties: false,
    },
  },
  {
    name: "tabs_attach",
    description:
      "Moves an existing tab (given by tabId or the browser's active tab) into this session's group, giving the agent access to what is already open. Asks for permission. The tab leaves the user's current group.",
    input: {
      type: "object",
      properties: { tabId },
      additionalProperties: false,
    },
  },
  {
    // `browser.tabs.close` é uma operação do plugin nativo do OpenCode
    // (`opencode.browser`) e vira `browser_tabs_close`. Como o catálogo nativo
    // é negado por padrão, o nome era removido e a nossa tool sumia junto.
    // Expomos `tabs_close_tab` e mantemos `tabs_close` no protocolo.
    name: "tabs_close_tab",
    wire: "tabs_close",
    description: "Closes a tab in this session's group.",
    input: { type: "object", properties: { tabId }, required: ["tabId"], additionalProperties: false },
  },
  {
    name: "navigate",
    description:
      "Navigates to a URL or goes back/forward in history. Asks for permission on new domains.",
    input: {
      type: "object",
      properties: {
        url: { type: "string", description: "Absolute URL or domain; https:// is added when missing." },
        direction: { type: "string", enum: ["back", "forward"] },
        tabId,
      },
      additionalProperties: false,
    },
  },
  {
    name: "read_page",
    description:
      "Returns the page accessibility tree with refs (ref_1, ref_2...). Use the refs in computer/form_input/find. With frames=all, iframe refs are prefixed as f<frameId>_ref_N. On large pages use filter=interactive and max_chars.",
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
      "Heuristic element search using text/role/name. Returns up to 20 refs. Prefer read_page filter=interactive for large pages.",
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
    description:
      "Extracts the page main text (article/main/body) without HTML. With frames=all, also concatenates the iframe texts.",
    input: {
      type: "object",
      properties: { max_chars: { type: "number" }, frames: { type: "string", enum: ["main", "all"] }, tabId },
      additionalProperties: false,
    },
  },
  {
    name: "form_input",
    description: "Fills a field identified by ref (input, textarea, select or contenteditable).",
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
      "Interacts with the page through trusted events: click, type, key, scroll, hover, screenshot, zoom and wait. Use a ref from read_page/find or coordinate [x,y]. Screenshots are also written to disk and the file path comes back in the result (use it to build pages that embed the screen). Iframe refs (f<id>_ref_N) work for click/hover/scroll/type via DOM events.",
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
        keys: {
          type: "string",
          description:
            'E.g. Enter, Tab, Ctrl+A. Pass layout-dependent symbols literally (e.g. "!"); do not infer them from chords like Shift+1.',
        },
        submit: { type: "boolean" },
        click_count: { type: "number" },
        button: { type: "string", enum: ["left", "right", "middle"] },
        scroll_direction: { type: "string", enum: ["up", "down", "left", "right"] },
        scroll_amount: { type: "number" },
        duration: { type: "number", description: "Seconds for action=wait (max 10)." },
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
      "Runs JavaScript in the page context. Returns the value of the last expression. Last resort, only to READ data the other tools cannot reach: never read cookies/storage/tokens nor make requests to other domains. Asks for permission and truncates the output at 50 KB.",
    input: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["javascript_exec"] },
        text: { type: "string", description: "JavaScript code." },
        tabId,
      },
      required: ["text"],
      additionalProperties: false,
    },
  },
  {
    name: "read_console_messages",
    description:
      "Reads the tab console messages/errors. Monitoring starts when the tool is used; reload the page to capture the loading phase.",
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
      "Reads the tab network requests (XHR/fetch/documents). Monitoring starts when the tool is used.",
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
    description: "Resizes the tab window to test responsive layouts.",
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
      "Presents a browsing plan (domains + steps) for approval. Approved domains are allowed for this session.",
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
      "Uploads files (base64 bytes) to an input[type=file] or drag & drop area identified by ref. Asks for permission. At most 3 files, ~5 MB each.",
    input: {
      type: "object",
      properties: {
        ref: { type: "string", description: "Ref of the file input or drop target." },
        files: {
          type: "array",
          minItems: 1,
          maxItems: 3,
          items: {
            type: "object",
            properties: {
              data: { type: "string", description: "File bytes in base64." },
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
      "Records the agent actions as frames (one screenshot per action) and exports an animated GIF. Use action=start before navigating/interacting, action=stop when finished and action=export to generate the file.",
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
    // Exposta como `batch` (vira `browser_batch` pelo namespace, sem duplicar o
    // prefixo). Na extensão o nome do protocolo continua sendo `browser_batch`.
    name: "batch",
    wire: "browser_batch",
    description:
      "Runs up to 20 independent browser actions in sequence to reduce round trips. Each item is {name, input}, with the name of a browser tool (e.g. read_page); code tools (read, glob, grep) do not belong in this batch. Do not use it when an action depends on the previous result.",
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
]

/** Nomes aceitos pelo relay no protocolo com a extensão (inclusive via HTTP). */
const KNOWN_TOOLS = new Set(tools.map((tool) => tool.wire ?? tool.name))

// ---------------------------------------------------------------------------
// Servidor (WebSocket da extensão + HTTP entre processos)
// ---------------------------------------------------------------------------

/** Marca o socket como autenticado e o torna a conexão ativa. */
function activate(socket: Socket): void {
  const state = relay()
  socket.data.authed = true
  if (socket.data.helloTimer) {
    clearTimeout(socket.data.helloTimer)
    socket.data.helloTimer = undefined
  }
  const current = state.active
  if (current && current !== socket) {
    try {
      current.close(1000, "New extension connection")
    } catch {
      // ignore
    }
  }
  state.active = socket
  log(`extensão conectada (${socket.data.origin})`)
  send(socket, { type: "ready", v: 1, home: homedir(), workspace: WORKSPACE })
  for (const wake of state.waiters.splice(0)) wake()
}

function startServer(port: number): { stop(force?: boolean): void } {
  return Bun.serve<SocketData>({
    hostname: "127.0.0.1",
    port,
    fetch(request, bunServer) {
      if (!isAllowedHost(request, port)) {
        return new Response("Forbidden host", { status: 403 })
      }
      const url = new URL(request.url)
      if (request.method === "POST" && (url.pathname === "/tool" || url.pathname === "/cancel")) {
        if (!tokenMatches(request.headers.get("x-relay-token") ?? "")) {
          return new Response("Forbidden", { status: 403 })
        }
        return url.pathname === "/cancel" ? handleHttpCancel(request) : handleHttpTool(request)
      }
      if (url.pathname === "/health") {
        // Sem caminhos locais: só o necessário para detectar um relay existente.
        return Response.json({ connected: Boolean(relay().active), version: SERVER_VERSION })
      }
      if (url.pathname !== "/" && url.pathname !== "/ws") {
        return new Response("Not found", { status: 404 })
      }
      const origin = request.headers.get("origin") ?? ""
      if (!isAllowedOrigin(origin)) {
        return new Response("Forbidden origin", { status: 403 })
      }
      const upgraded = bunServer.upgrade(request, {
        data: { origin, id: crypto.randomUUID(), lastPong: Date.now(), authed: false },
      })
      if (!upgraded) return new Response("WebSocket upgrade failed", { status: 400 })
      return undefined
    },
    websocket: {
      maxPayloadLength: MAX_WS_PAYLOAD,
      open(socket) {
        socket.data.lastPong = Date.now()
        if (socket.data.pingTimer) clearInterval(socket.data.pingTimer)
        socket.data.pingTimer = setInterval(() => {
          if (Date.now() - socket.data.lastPong > 60_000) {
            try {
              socket.close(4001, "extension not responding")
            } catch {
              // ignore
            }
            return
          }
          send(socket, { type: "ping" })
        }, 20_000)

        if (REQUIRE_HELLO) {
          // Não vira `active` (nem recebe `ready`) até um `hello` válido.
          socket.data.helloTimer = setTimeout(() => {
            if (!socket.data.authed) {
              try {
                socket.close(1008, "hello ausente")
              } catch {
                // ignore
              }
            }
          }, HELLO_TIMEOUT_MS)
        } else {
          activate(socket)
        }
      },
      message(socket, raw) {
        if (typeof raw !== "string") return
        let message: Record<string, unknown>
        try {
          const parsed = JSON.parse(raw) as unknown
          if (!isRecord(parsed)) return
          message = parsed
        } catch {
          return
        }

        if (message.type === "hello") {
          const idOk = ALLOW_ANY_EXTENSION || message.extensionId === EXPECTED_EXTENSION_ID
          const secretOk = !WS_SECRET || message.secret === WS_SECRET
          if (!idOk || !secretOk) {
            socket.close(1008, "Extension not authorized")
            return
          }
          if (!socket.data.authed) activate(socket)
          return
        }
        if (message.type === "pong") {
          socket.data.lastPong = Date.now()
          return
        }
        // Nada além de hello/pong é aceito de sockets não autenticados.
        if (!socket.data.authed) return

        if (message.type === "ensure_agent") {
          const id = typeof message.id === "string" ? message.id : ""
          if (!id) return
          try {
            const path = ensureAgentFile()
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
        if (message.type === "progress" && typeof message.id === "string") {
          const item = relay().pending.get(message.id)
          if (item && item.socket === socket && item.progress) {
            void item.progress({
              phase: message.phase ?? "running",
              detail: message.detail,
            })
          }
          return
        }
        if (message.type === "tool_result" && typeof message.id === "string") {
          const item = relay().pending.get(message.id)
          // Só o socket que recebeu o pedido pode respondê-lo.
          if (!item || item.socket !== socket) return
          relay().pending.delete(message.id)
          clearTimeout(item.timer)
          if (message.ok === false) {
            item.reject(
              new Error(typeof message.error === "string" ? message.error : "The extension returned an error."),
            )
            return
          }
          const { images, dropped } = sanitizeImages(message.images)
          let content = typeof message.content === "string" ? message.content : undefined
          if (dropped > 0) {
            const note = `(${dropped} imagem(ns) descartada(s): tipo não permitido ou tamanho acima do limite)`
            content = content ? `${content}\n${note}` : note
          }
          item.resolve({
            ok: true,
            content,
            images,
            metadata: isRecord(message.metadata) ? message.metadata : undefined,
          })
        }
      },
      close(socket) {
        if (socket.data.pingTimer) clearInterval(socket.data.pingTimer)
        if (socket.data.helloTimer) clearTimeout(socket.data.helloTimer)
        if (relay().active === socket) relay().active = null
        failPending(socket, "The extension disconnected during the run.")
        if (socket.data.authed) log("extensão desconectada")
      },
    },
  })
}

/** Há um relay do OpenCode Browser respondendo nessa porta (outro processo)? */
async function probeRelay(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(1_000),
    })
    if (!response.ok) return false
    const data = (await response.json()) as unknown
    return isRecord(data) && typeof data.version === "number" && typeof data.connected === "boolean"
  } catch {
    return false
  }
}

async function doEnsureServer(): Promise<void> {
  const state = relay()
  if (state.server && state.serverVersion !== SERVER_VERSION) {
    try {
      state.server.stop(true)
    } catch {
      // ignore
    }
    removeRelayInfoIfOwned(state.token)
    state.server = null
    state.active = null
    state.token = undefined
  }
  if (state.server) return
  if (state.remotePort && (await probeRelay(state.remotePort))) return
  state.remotePort = undefined

  for (const candidate of PORT_CANDIDATES) {
    try {
      const server = startServer(candidate)
      state.server = server
      state.serverVersion = SERVER_VERSION
      state.port = candidate
      state.token = crypto.randomUUID()
      writeRelayInfo({ token: state.token, port: candidate })
      log(`relay ouvindo em ws://127.0.0.1:${candidate}`)
      return
    } catch (error) {
      // Porta ocupada por OUTRO processo do OpenCode? Então este processo vira
      // cliente HTTP dele em vez de subir um segundo relay em outra porta.
      if (await probeRelay(candidate)) {
        state.remotePort = candidate
        log(`reutilizando relay existente em 127.0.0.1:${candidate}`)
        return
      }
      log(`porta ${candidate} indisponível`, error)
    }
  }
  log("não foi possível abrir o relay em nenhuma porta candidata")
}

/** Serializa a inicialização para que várias instâncias não disputem portas. */
function ensureServer(): Promise<void> {
  const state = relay()
  state.starting ??= doEnsureServer().finally(() => {
    relay().starting = undefined
  })
  return state.starting
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

// Não importe `@opencode/plugin` aqui: este arquivo é copiado para
// ~/.config/opencode/plugins e versões antigas do serviço não resolvem esse
// pacote. Tipos locais abaixo aproximam a API usada (confira com a versão do v2
// que você usa). `Plugin.define` é apenas um helper de identidade; o objeto
// exportado já é um plugin V2 válido (id + setup).
type ToolContext = { sessionID: string; signal: AbortSignal; progress: Progress }

type ToolEditor = {
  namespace(spec: { name: string; description: string }): void
  add(spec: {
    name: string
    description: string
    input: Record<string, unknown>
    options: { namespace: string; codemode: boolean }
    execute(
      input: unknown,
      context: ToolContext,
    ): Promise<{ content: ReturnType<typeof buildContent>; metadata?: Record<string, unknown> }>
  }): void
}

type PluginContext = {
  tool: { transform(fn: (editor: ToolEditor) => void | Promise<void>): Promise<unknown> }
}

export default {
  id: "opencode.browser-relay",
  async setup(ctx: PluginContext) {
    try {
      mkdirSync(WORKSPACE, { recursive: true, mode: 0o700 })
    } catch (error) {
      log(`não foi possível criar a pasta de conversas ${WORKSPACE}`, error)
    }
    try {
      ensureAgentFile()
    } catch (error) {
      log("não foi possível preparar o arquivo do agente", error)
    }

    relay().instances += 1
    await ensureServer()

    await ctx.tool.transform((editor) => {
      editor.namespace({
        name: "browser",
        description:
          "Controls Chrome through the OpenCode Browser extension (tabs, accessibility, clicks, screenshots, console and network).",
      })
      for (const spec of tools) {
        const wireName = spec.wire ?? spec.name
        editor.add({
          name: spec.name,
          description: spec.description,
          input: spec.input,
          options: { namespace: "browser", codemode: false },
          execute: async (input, context) => {
            const args = isRecord(input) ? input : {}
            const result = await callTool(wireName, args, {
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
      current.instances = Math.max(0, current.instances - 1)
      if (current.instances > 0) return
      for (const [id, item] of current.pending) {
        clearTimeout(item.timer)
        current.pending.delete(id)
        item.reject(new Error("O plugin do OpenCode foi encerrado."))
      }
      // A última instância a sair para o servidor, mesmo que outra o tenha criado.
      if (current.server) {
        try {
          current.server.stop(true)
        } catch {
          // ignore
        }
        removeRelayInfoIfOwned(current.token)
        current.server = null
        current.token = undefined
      }
      current.remotePort = undefined
      current.active = null
      for (const wake of current.waiters.splice(0)) wake()
    }
  },
}
