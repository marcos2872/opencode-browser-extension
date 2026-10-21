import { Cdp } from "./cdp"
import { OpencodeClient, OpencodeError } from "./opencode/client"
import { Permissions } from "./permissions"
import { Recording } from "./recording"
import { RelayClient } from "./relay"
import { TabGroups } from "./tabGroups"
import { computerTools } from "./tools/computer"
import { gifTools } from "./tools/gif"
import { pageTools } from "./tools/page"
import { planTools } from "./tools/plan"
import { uploadTools } from "./tools/upload"
import { ToolRegistry } from "./tools/registry"
import { tabsTools } from "./tools/tabs"
import type { ToolContext } from "./tools/types"
import { getConfig, setConfig } from "../shared/storage"
import {
  PORT_NAME,
  RELAY_URL,
  type RelayInbound,
  type UiEvent,
  type UiRequest,
  type UiResponse,
} from "../shared/protocol"
import type {
  AgentInfo,
  AppSnapshot,
  CommandInfo,
  ChatMessage,
  ImagePayload,
  ModelInfo,
  ModelRef,
  OpencodeConfig,
  RelayState,
  SessionInfo,
  ToolCallView,
} from "../shared/types"

const ACTIVE_SESSION_KEY = "ui.activeSession"
const cdp = new Cdp()
const tabs = new TabGroups()
const recording = new Recording(cdp)
const registry = new ToolRegistry([tabsTools, pageTools, computerTools, planTools, uploadTools, gifTools(recording)])
const ports = new Set<chrome.runtime.Port>()
const toolAborts = new Map<string, AbortController>()
const toolNames = new Map<string, string>()
const toolImages = new Map<string, ImagePayload[]>()

let config: OpencodeConfig | null = null
let client: OpencodeClient | null = null
let models: ModelInfo[] = []
let sessions: SessionInfo[] = []
let activeSessionID: string | null = null
let messages: ChatMessage[] = []
let busy = false
let backend: AppSnapshot["backend"] = "unknown"
let defaultModel: ModelRef | null = null
let agents: AgentInfo[] = []
let commands: CommandInfo[] = []
let relayState: RelayState = { connected: false, url: RELAY_URL }
let statusMessage: string | null = null
let sseAbort: AbortController | null = null
let broadcastTimer: ReturnType<typeof setTimeout> | null = null
let hydrateToken = 0

function playSound(): void {
  if (config?.soundEnabled === false) return
  void chrome.runtime.sendMessage({ type: "PLAY_NOTIFICATION" }).catch(() => undefined)
}

const permissions = new Permissions(
  () => config?.permissionMode ?? "ask",
  () => config?.permissionTimeoutMs ?? 60_000,
  () => ports.size > 0,
  (request) => broadcast({ type: "permission", request }),
  (requestId) => broadcast({ type: "permission:resolved", requestId }),
  () => playSound(),
)

const relay = new RelayClient({
  onTool: (request) => {
    void executeRelayTool(request)
  },
  onCancel: (id) => {
    toolAborts.get(id)?.abort()
  },
  onState: (state) => {
    relayState = state
    broadcast({ type: "relay", relay: state })
  },
})

function snapshot(): AppSnapshot {
  return {
    config,
    models,
    sessions,
    activeSessionID,
    messages,
    relay: relayState,
    busy,
    backend,
    defaultModel,
    agents,
    commands,
    statusMessage,
  }
}

function broadcast(message: UiEvent): void {
  for (const port of ports) {
    try {
      port.postMessage(message)
    } catch {
      ports.delete(port)
    }
  }
}

function scheduleBroadcast(): void {
  if (broadcastTimer) return
  broadcastTimer = setTimeout(() => {
    broadcastTimer = null
    broadcast({ type: "snapshot", snapshot: snapshot() })
  }, 60)
}

function broadcastNow(): void {
  if (broadcastTimer) {
    clearTimeout(broadcastTimer)
    broadcastTimer = null
  }
  broadcast({ type: "snapshot", snapshot: snapshot() })
}

function errorMessage(error: unknown): string {
  if (error instanceof OpencodeError) return error.message
  if (error instanceof Error) return error.message
  return String(error)
}

async function handleUi(request: UiRequest): Promise<UiResponse> {
  switch (request.type) {
    case "state:get":
      return { ok: true, snapshot: snapshot() }
    case "pair":
      await pair(request.link)
      return { ok: true, snapshot: snapshot() }
    case "unpair":
      await unpair()
      return { ok: true, snapshot: snapshot() }
    case "models:refresh":
      await refreshModels()
      return { ok: true, snapshot: snapshot(), models }
    case "sessions:list":
      await refreshSessions()
      return { ok: true, snapshot: snapshot(), sessions }
    case "session:new":
      await createSession(request.model, request.agent)
      return { ok: true, snapshot: snapshot() }
    case "session:select":
      await selectSession(request.id)
      return { ok: true, snapshot: snapshot() }
    case "session:delete":
      await deleteSession(request.id)
      return { ok: true, snapshot: snapshot() }
    case "session:model":
      await switchModel(request.model)
      return { ok: true, snapshot: snapshot() }
    case "session:agent":
      await switchAgent(request.agent)
      return { ok: true, snapshot: snapshot() }
    case "tabs:attach-current": {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
      if (!tab?.id) throw new Error("Nenhuma aba ativa encontrada.")
      const sessionID = activeSessionID ?? "default"
      const allowed = await permissions.check(
        {
          kind: "action",
          tool: "tabs_attach",
          title: "Dar acesso a esta aba ao agente",
          detail: tab.title,
          url: tab.url,
        },
        sessionID,
      )
      if (!allowed) return { ok: true, snapshot: snapshot() }
      await tabs.addTab(sessionID, tab.id)
      return { ok: true, snapshot: snapshot() }
    }
    case "prompt":
      await sendPrompt(request.text)
      return { ok: true, snapshot: snapshot() }
    case "command":
      await runCommand(request.name, request.text)
      return { ok: true, snapshot: snapshot() }
    case "interrupt":
      await interrupt()
      return { ok: true, snapshot: snapshot() }
    case "settings:update":
      await updateSettings(request.patch)
      return { ok: true, snapshot: snapshot() }
    case "open:options":
      await chrome.runtime.openOptionsPage()
      return { ok: true }
    case "relay:reconnect":
      relay.reconnect()
      return { ok: true }
    default:
      return { ok: false, error: "Comando desconhecido." }
  }
}

async function pair(link: string): Promise<void> {
  const previous = config
  const { baseUrl, token } = await OpencodeClient.pair(link)
  config = {
    baseUrl,
    token,
    directory: previous?.directory,
    defaultModel: previous?.defaultModel,
    permissionMode: previous?.permissionMode ?? "ask",
  }
  await setConfig(config)
  client = new OpencodeClient(config.baseUrl, config.token, config.directory)
  await permissions.init()
  await refreshModels()
  await refreshAgents().catch(() => undefined)
  await refreshCommands().catch(() => undefined)
  await refreshSessions()
  if (!activeSessionID && sessions[0]) {
    await selectSession(sessions[0].id)
  }
  startSse()
  await updateBadge()
  broadcastNow()
}

async function unpair(): Promise<void> {
  sseAbort?.abort()
  sseAbort = null
  await setConfig(null)
  config = null
  client = null
  models = []
  sessions = []
  activeSessionID = null
  messages = []
  busy = false
  backend = "unknown"
  defaultModel = null
  agents = []
  commands = []
  statusMessage = null
  await chrome.storage.local.remove(ACTIVE_SESSION_KEY)
  await updateBadge()
  broadcastNow()
}

async function updateSettings(patch: Partial<OpencodeConfig>): Promise<void> {
  if (!config) throw new Error("Configure o pareamento primeiro.")
  const next: OpencodeConfig = { ...config, ...patch }
  if (!next.baseUrl || !next.token) throw new Error("Configuração inválida.")
  const connectionChanged = next.baseUrl !== config.baseUrl || next.token !== config.token
  config = next
  await setConfig(config)
  if (connectionChanged) {
    client = new OpencodeClient(config.baseUrl, config.token, config.directory)
    startSse()
    await refreshModels().catch(() => undefined)
  }
  broadcastNow()
}

async function refreshModels(): Promise<void> {
  if (!client) throw new Error("OpenCode não configurado.")
  models = (await client.listModels()).sort((a, b) => {
    if (a.providerID !== b.providerID) return a.providerID.localeCompare(b.providerID)
    return (a.name ?? a.id).localeCompare(b.name ?? b.id)
  })
  defaultModel = (await client.defaultModel().catch(() => null)) ?? defaultModel
  const preferred = config?.defaultModel
  if (preferred && !models.some((model) => model.id === preferred.id && model.providerID === preferred.providerID)) {
    config = { ...config!, defaultModel: undefined }
    await setConfig(config)
  }
  if (!config?.defaultModel && defaultModel) {
    config = { ...config!, defaultModel }
    await setConfig(config)
  }
  backend = "online"
  broadcastNow()
}

async function refreshCommands(): Promise<void> {
  if (!client) return
  commands = (await client.listCommands()).sort((a, b) => a.name.localeCompare(b.name))
  broadcastNow()
}

async function refreshAgents(): Promise<void> {
  if (!client) return
  agents = (await client.listAgents()).sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id))
  if (config?.defaultAgent && !agents.some((agent) => agent.id === config?.defaultAgent)) {
    config = { ...config, defaultAgent: undefined }
    await setConfig(config)
  }
  if (!config?.defaultAgent && agents.some((agent) => agent.id === "build")) {
    config = { ...config!, defaultAgent: "build" }
    await setConfig(config)
  }
  broadcastNow()
}

async function refreshSessions(): Promise<void> {
  if (!client) throw new Error("OpenCode não configurado.")
  sessions = (await client.listSessions()).sort((a, b) => (b.time?.updated ?? 0) - (a.time?.updated ?? 0))
  if (activeSessionID && !sessions.some((session) => session.id === activeSessionID)) {
    activeSessionID = null
    messages = []
  }
  broadcastNow()
}

function pickModel(explicit?: ModelRef): ModelRef | undefined {
  if (explicit) return explicit
  if (config?.defaultModel) return config.defaultModel
  if (defaultModel) return defaultModel
  return models.find((model) => model.capabilities?.tools !== false)
    ? {
        id: models.find((model) => model.capabilities?.tools !== false)!.id,
        providerID: models.find((model) => model.capabilities?.tools !== false)!.providerID,
      }
    : undefined
}

async function createSession(model?: ModelRef, agent?: string): Promise<void> {
  if (!client) throw new Error("OpenCode não configurado.")
  const chosen = pickModel(model)
  const chosenAgent = agent ?? config?.defaultAgent ?? agents.find((item) => item.id === "build")?.id
  const session = await client.createSession(chosen, chosenAgent)
  sessions = [session, ...sessions.filter((item) => item.id !== session.id)]
  activeSessionID = session.id
  messages = []
  busy = false
  await chrome.storage.local.set({ [ACTIVE_SESSION_KEY]: session.id })
  broadcastNow()
}

async function selectSession(id: string): Promise<void> {
  activeSessionID = id
  messages = []
  busy = false
  await chrome.storage.local.set({ [ACTIVE_SESSION_KEY]: id })
  broadcastNow()
  void hydrate(id)
}

async function hydrate(id: string): Promise<void> {
  if (!client) return
  const token = ++hydrateToken
  try {
    const raw = await client.context(id)
    if (token !== hydrateToken || activeSessionID !== id) return
    messages = mapContext(raw)
    busy = messages.some((message) => message.kind === "assistant" && message.streaming)
    broadcastNow()
  } catch {
    // The session may have been deleted; keep the current view.
  }
}

function mapContext(raw: unknown[]): ChatMessage[] {
  const output: ChatMessage[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const message = item as Record<string, unknown>
    const id = typeof message.id === "string" ? message.id : crypto.randomUUID()
    const time =
      message.time && typeof message.time === "object" && typeof (message.time as { created?: unknown }).created === "number"
        ? ((message.time as { created: number }).created as number)
        : Date.now()
    if (message.type === "user" && typeof message.text === "string") {
      output.push({ kind: "user", id, text: message.text, time })
      continue
    }
    if (message.type !== "assistant") continue
    const content = Array.isArray(message.content) ? message.content : []
    const textParts: string[] = []
    const reasoningParts: string[] = []
    const tools: ToolCallView[] = []
    for (const part of content) {
      if (!part || typeof part !== "object") continue
      const value = part as Record<string, unknown>
      if (value.type === "text" && typeof value.text === "string") textParts.push(value.text)
      if (value.type === "reasoning" && typeof value.text === "string") reasoningParts.push(value.text)
      if (value.type === "tool") {
        const state = (value.state ?? {}) as Record<string, unknown>
        const status = state.status === "error" ? "error" : state.status === "completed" ? "ok" : "running"
        const parts = Array.isArray(state.content) ? state.content : []
        const text = parts
          .map((entry) => {
            const partValue = entry as Record<string, unknown>
            return partValue.type === "text" && typeof partValue.text === "string" ? partValue.text : ""
          })
          .filter(Boolean)
          .join("\n")
        tools.push({
          id: typeof value.id === "string" ? value.id : crypto.randomUUID(),
          name: typeof value.name === "string" ? value.name : "tool",
          input: state.input,
          status,
          output: text || undefined,
          images: toolImages.get(typeof value.id === "string" ? value.id : ""),
        })
      }
    }
    output.push({
      kind: "assistant",
      id,
      text: textParts.join("\n\n"),
      reasoning: reasoningParts.join("\n\n"),
      tools,
      time,
      streaming: false,
    })
  }
  return output
}

async function deleteSession(id: string): Promise<void> {
  if (!client) return
  await client.deleteSession(id)
  sessions = sessions.filter((session) => session.id !== id)
  if (activeSessionID === id) {
    activeSessionID = sessions[0]?.id ?? null
    messages = []
    if (activeSessionID) await selectSession(activeSessionID)
  }
  broadcastNow()
}

async function switchModel(model: ModelRef): Promise<void> {
  if (!client || !activeSessionID) throw new Error("Nenhuma sessão ativa.")
  await client.switchModel(activeSessionID, model)
  const session = sessions.find((item) => item.id === activeSessionID)
  if (session) session.model = model
  broadcastNow()
}

async function runCommand(name: string, text: string): Promise<void> {
  if (!client) throw new Error("OpenCode não configurado.")
  if (!activeSessionID) await createSession()
  if (!activeSessionID) throw new Error("Não foi possível criar a sessão.")
  const sessionID = activeSessionID
  messages.push({
    kind: "user",
    id: `local_${crypto.randomUUID()}`,
    text: `/${name}${text ? ` ${text}` : ""}`,
    time: Date.now(),
  })
  busy = true
  backend = "online"
  statusMessage = null
  broadcastNow()
  try {
    await client.runCommand(sessionID, name, text)
  } catch (error) {
    busy = false
    messages.push({
      kind: "assistant",
      id: `local_error_${crypto.randomUUID()}`,
      text: "",
      reasoning: "",
      tools: [],
      time: Date.now(),
      streaming: false,
      error: errorMessage(error),
    })
    broadcastNow()
  }
}

async function switchAgent(agent: string): Promise<void> {
  if (!client) throw new Error("OpenCode não configurado.")
  if (activeSessionID) {
    await client.switchAgent(activeSessionID, agent)
    const session = sessions.find((item) => item.id === activeSessionID)
    if (session) session.agent = agent
  } else {
    config = { ...config!, defaultAgent: agent }
    await setConfig(config)
  }
  broadcastNow()
}

async function sendPrompt(text: string): Promise<void> {
  if (!client) throw new Error("OpenCode não configurado.")
  const trimmed = text.trim()
  if (!trimmed) return
  if (!activeSessionID) {
    await createSession()
  }
  if (!activeSessionID) throw new Error("Não foi possível criar a sessão.")
  const sessionID = activeSessionID
  messages.push({ kind: "user", id: `local_${crypto.randomUUID()}`, text: trimmed, time: Date.now() })
  busy = true
  backend = "online"
  statusMessage = null
  broadcastNow()
  try {
    await client.prompt(sessionID, trimmed)
  } catch (error) {
    busy = false
    messages.push({
      kind: "assistant",
      id: `local_error_${crypto.randomUUID()}`,
      text: "",
      reasoning: "",
      tools: [],
      time: Date.now(),
      streaming: false,
      error: errorMessage(error),
    })
    broadcastNow()
  }
}

async function interrupt(): Promise<void> {
  for (const controller of toolAborts.values()) controller.abort()
  toolAborts.clear()
  if (client && activeSessionID) {
    await client.interrupt(activeSessionID).catch(() => undefined)
  }
  busy = false
  for (const message of messages) {
    if (message.kind === "assistant") message.streaming = false
  }
  broadcastNow()
}

function startSse(): void {
  sseAbort?.abort()
  sseAbort = null
  if (!client) return
  const controller = new AbortController()
  sseAbort = controller
  const activeClient = client

  void (async () => {
    while (!controller.signal.aborted) {
      try {
        backend = "online"
        broadcastNow()
        console.log("[sse] conectando", config?.baseUrl)
        await activeClient.subscribe(onOpencodeEvent, controller.signal)
        console.log("[sse] stream encerrado")
      } catch (error) {
        if (controller.signal.aborted) return
        console.error("[sse] erro", error)
        backend = "offline"
        broadcastNow()
        if (error instanceof OpencodeError && error.status === 401) {
          await sleep(10_000)
        } else {
          await sleep(2_000)
        }
      }
    }
  })()
}

function onOpencodeEvent(event: { type: string; data?: Record<string, unknown> }): void {
  const data = event.data ?? {}
  const sessionID = typeof data.sessionID === "string" ? data.sessionID : undefined
  console.log("[sse] evento", event.type, sessionID ?? "", "active=", activeSessionID ?? "")

  if (event.type === "session.created" && sessionID) {
    const title = typeof data.title === "string" ? data.title : undefined
    if (!sessions.some((session) => session.id === sessionID)) {
      sessions = [
        {
          id: sessionID,
          title,
          slug: typeof data.slug === "string" ? data.slug : undefined,
          model: data.model as ModelRef | undefined,
          time: { created: Date.now(), updated: Date.now() },
        },
        ...sessions,
      ]
      scheduleBroadcast()
    }
  }

  if (event.type === "session.renamed" && sessionID) {
    const session = sessions.find((item) => item.id === sessionID)
    if (session && typeof data.title === "string") {
      session.title = data.title
      session.time = { ...session.time, updated: Date.now() }
      scheduleBroadcast()
    }
  }

  if (!sessionID || sessionID !== activeSessionID) return

  const assistantID =
    typeof data.assistantMessageID === "string" ? data.assistantMessageID : undefined

  switch (event.type) {
    case "session.step.started":
    case "session.execution.started":
      busy = true
      statusMessage = null
      scheduleBroadcast()
      break
    case "session.text.started":
      if (assistantID) ensureAssistant(assistantID).streaming = true
      scheduleBroadcast()
      break
    case "session.text.delta": {
      if (!assistantID || typeof data.delta !== "string") break
      const message = ensureAssistant(assistantID)
      message.text += data.delta
      message.streaming = true
      statusMessage = null
      scheduleBroadcast()
      break
    }
    case "session.text.ended": {
      if (!assistantID) break
      const message = ensureAssistant(assistantID)
      if (typeof data.text === "string") {
        message.text = message.text && !data.text.startsWith(message.text) ? `${message.text}\n\n${data.text}` : data.text
      }
      scheduleBroadcast()
      break
    }
    case "session.reasoning.delta": {
      if (!assistantID || typeof data.delta !== "string") break
      const message = ensureAssistant(assistantID)
      message.reasoning += data.delta
      scheduleBroadcast()
      break
    }
    case "session.reasoning.ended": {
      if (!assistantID) break
      const message = ensureAssistant(assistantID)
      if (typeof data.text === "string") message.reasoning = data.text
      scheduleBroadcast()
      break
    }
    case "session.tool.input.started": {
      if (typeof data.id === "string" && typeof data.name === "string") {
        toolNames.set(data.id, data.name)
      }
      break
    }
    case "session.tool.called": {
      if (!assistantID || typeof data.id !== "string") break
      const message = ensureAssistant(assistantID)
      const id = data.id
      const existing = message.tools.find((tool) => tool.id === id)
      if (existing) {
        existing.input = data.input
      } else {
        message.tools.push({
          id,
          name: toolNames.get(id) ?? "tool",
          input: data.input,
          status: "running",
          images: toolImages.get(id),
        })
      }
      scheduleBroadcast()
      break
    }
    case "session.tool.progress": {
      if (typeof data.id !== "string") break
      const tool = findTool(data.id)
      if (tool) {
        tool.metadata = data.metadata as Record<string, unknown>
        scheduleBroadcast()
      }
      break
    }
    case "session.tool.success": {
      if (typeof data.id !== "string") break
      const tool = ensureTool(data.id, assistantID)
      if (tool) {
        tool.status = "ok"
        tool.output = contentText(data.content)
        tool.metadata = data.metadata as Record<string, unknown>
        tool.images = toolImages.get(data.id) ?? tool.images
        scheduleBroadcast()
      }
      break
    }
    case "session.tool.failed": {
      if (typeof data.id !== "string") break
      const tool = ensureTool(data.id, assistantID)
      if (tool) {
        tool.status = "error"
        tool.output = errorText(data.error) ?? contentText(data.content)
        scheduleBroadcast()
      }
      break
    }
    case "session.retry.scheduled": {
      busy = true
      const attempt = typeof data.attempt === "number" ? data.attempt : undefined
      const reason = typeof data.message === "string" ? data.message : "erro temporário"
      statusMessage = `Tentando novamente${attempt ? ` (tentativa ${attempt})` : ""}: ${reason}`
      scheduleBroadcast()
      break
    }
    case "session.execution.succeeded":
    case "session.execution.failed":
      busy = false
      statusMessage = null
      for (const message of messages) {
        if (message.kind === "assistant") message.streaming = false
      }
      if (ports.size === 0) {
        playSound()
        if (config?.notifyEnabled !== false) {
          const title = sessions.find((item) => item.id === activeSessionID)?.title ?? "Tarefa"
          void chrome.notifications
            .create(`oc-${Date.now()}`, {
              type: "basic",
              iconUrl: chrome.runtime.getURL("icons/icon-128.png"),
              title: "OpenCode Browser",
              message: `Concluído: ${title}`.slice(0, 180),
            })
            .catch(() => undefined)
        }
      }
      scheduleBroadcast()
      break
    case "session.step.ended":
      if (data.finish !== "tool-calls") {
        busy = false
        for (const message of messages) {
          if (message.kind === "assistant") message.streaming = false
        }
      }
      scheduleBroadcast()
      break
    case "session.status": {
      const status = data.status as { type?: string } | undefined
      if (status?.type === "idle") {
        busy = false
        for (const message of messages) {
          if (message.kind === "assistant") message.streaming = false
        }
        scheduleBroadcast()
      }
      break
    }
    case "session.error": {
      busy = false
      statusMessage = null
      let message = [...messages].reverse().find((item) => item.kind === "assistant")
      if (!message || message.kind !== "assistant") {
        message = ensureAssistant(`error_${crypto.randomUUID()}`)
      }
      if (message.kind === "assistant") {
        message.error = errorText(data.error) ?? "Erro na execução."
        message.streaming = false
      }
      scheduleBroadcast()
      break
    }
  }
}

function ensureAssistant(id: string): Extract<ChatMessage, { kind: "assistant" }> {
  const existing = messages.find(
    (message): message is Extract<ChatMessage, { kind: "assistant" }> =>
      message.kind === "assistant" && message.id === id,
  )
  if (existing) return existing
  const created: Extract<ChatMessage, { kind: "assistant" }> = {
    kind: "assistant",
    id,
    text: "",
    reasoning: "",
    tools: [],
    time: Date.now(),
    streaming: true,
  }
  messages.push(created)
  return created
}

function findTool(id: string): ToolCallView | undefined {
  for (const message of messages) {
    if (message.kind !== "assistant") continue
    const tool = message.tools.find((item) => item.id === id)
    if (tool) return tool
  }
  return undefined
}

function ensureTool(id: string, assistantID?: string): ToolCallView | undefined {
  const existing = findTool(id)
  if (existing) return existing
  const message = assistantID ? ensureAssistant(assistantID) : [...messages].reverse().find((item) => item.kind === "assistant")
  if (!message || message.kind !== "assistant") return undefined
  const tool: ToolCallView = {
    id,
    name: toolNames.get(id) ?? "tool",
    status: "running",
    images: toolImages.get(id),
  }
  message.tools.push(tool)
  return tool
}

function contentText(content: unknown): string | undefined {
  if (!Array.isArray(content)) return undefined
  const text = content
    .map((entry) => {
      const value = entry as Record<string, unknown>
      return value.type === "text" && typeof value.text === "string" ? value.text : ""
    })
    .filter(Boolean)
    .join("\n")
  return text || undefined
}

function errorText(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return typeof error === "string" ? error : undefined
  const value = error as Record<string, unknown>
  if (typeof value.message === "string") return value.message
  if (typeof value.name === "string") return value.name
  return undefined
}

async function executeRelayTool(request: Extract<RelayInbound, { type: "tool_request" }>): Promise<void> {
  const sessionID = request.sessionID || activeSessionID || "relay"
  const controller = new AbortController()
  toolAborts.set(request.id, controller)
  const context: ToolContext = {
    sessionID,
    signal: controller.signal,
    cdp,
    permissions,
    tabs,
    progress: (phase, detail) => {
      relay.send({ type: "progress", id: request.id, phase, detail })
    },
    indicator: async (tabId, status, busy = true) => {
      await chrome.tabs.sendMessage(tabId, { type: "indicator:show" }).catch(() => undefined)
      await chrome.tabs
        .sendMessage(tabId, { type: "indicator:status", text: status, busy })
        .catch(() => undefined)
    },
    hideIndicator: async (tabId) => {
      await chrome.tabs.sendMessage(tabId, { type: "indicator:hide" }).catch(() => undefined)
    },
    cursor: async (tabId, x, y) => {
      await chrome.tabs.sendMessage(tabId, { type: "indicator:cursor", x, y }).catch(() => undefined)
    },
    rank: async (query, candidates) => {
      if (!client || (config?.findMode ?? "heuristic") !== "model") return null
      const session = sessions.find((item) => item.id === activeSessionID)
      const model = session?.model ?? config?.defaultModel ?? defaultModel ?? undefined
      const list = candidates
        .slice(0, 120)
        .map((item) => `${item.ref} | ${item.role} | ${item.name}${item.type ? ` | ${item.type}` : ""}`)
        .join("\n")
      const prompt = [
        "Você escolhe elementos de uma página web para uma consulta.",
        `Consulta: ${query}`,
        "",
        "Elementos (ref | role | nome | tipo):",
        list,
        "",
        "Responda SOMENTE com os refs mais relevantes, um por linha, no máximo 10, do mais relevante ao menos.",
        "Se nenhum servir, responda NENHUM.",
      ].join("\n")
      try {
        const text = await client.generate(prompt, model)
        const refs = text
          .split(/\s+/)
          .map((token) => token.trim().replace(/[^A-Za-z0-9_]/g, ""))
          .filter((token) => /^(f\d+_)?ref_\d+$/.test(token))
        if (refs.length === 0) return null
        return [...new Set(refs)].slice(0, 10)
      } catch {
        return null
      }
    },
    ask: async (input) => (await permissions.check(input, sessionID)).allowed,
  }

  try {
    relay.send({ type: "progress", id: request.id, phase: "starting", detail: request.tool })
    const result = await registry.run(request.tool, request.args ?? {}, context)
    if (result.images?.length) {
      toolImages.set(request.id, result.images)
      if (toolImages.size > 40) {
        const oldest = toolImages.keys().next().value
        if (oldest) toolImages.delete(oldest)
      }
      const tool = findTool(request.id)
      if (tool) tool.images = result.images
    }
    relay.send({
      type: "tool_result",
      id: request.id,
      ok: true,
      content: result.content,
      images: result.images,
      metadata: result.metadata,
    })
    if (recording.active && request.tool !== "gif_creator") {
      const target = await tabs.resolveTab(sessionID).catch(() => null)
      if (target) await recording.capture(target.tabId, request.tool)
    }
    scheduleBroadcast()
  } catch (error) {
    const message = errorMessage(error)
    relay.send({ type: "tool_result", id: request.id, ok: false, error: message })
    const tool = findTool(request.id)
    if (tool) {
      tool.status = "error"
      tool.output = message
      scheduleBroadcast()
    }
  } finally {
    toolAborts.delete(request.id)
  }
}

function handleStop(sender: chrome.runtime.MessageSender): void {
  for (const controller of toolAborts.values()) controller.abort()
  toolAborts.clear()
  if (client && activeSessionID) {
    void client.interrupt(activeSessionID).catch(() => undefined)
  }
  busy = false
  for (const message of messages) {
    if (message.kind === "assistant") message.streaming = false
  }
  if (sender.tab?.id !== undefined) {
    void chrome.tabs.sendMessage(sender.tab.id, { type: "indicator:hide" }).catch(() => undefined)
  }
  broadcastNow()
}

async function updateBadge(): Promise<void> {
  try {
    if (!config) {
      await chrome.action.setBadgeText({ text: "!" })
      await chrome.action.setTitle({ title: "OpenCode Browser: configure o pareamento" })
    } else {
      await chrome.action.setBadgeText({ text: "" })
      await chrome.action.setTitle({ title: "OpenCode Browser" })
    }
  } catch {
    // ignore
  }
}

async function ensureOffscreen(): Promise<void> {
  try {
    if (await chrome.offscreen.hasDocument()) return
  } catch {
    // fall through
  }
  try {
    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["BLOBS"] as chrome.offscreen.Reason[],
      justification: "Manter a conexão com o plugin local do OpenCode ativa.",
    })
  } catch {
    // Already created or unsupported.
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PORT_NAME) return
  ports.add(port)
  port.onDisconnect.addListener(() => ports.delete(port))
  try {
    port.postMessage({ type: "snapshot", snapshot: snapshot() } satisfies UiEvent)
  } catch {
    ports.delete(port)
  }
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "SW_KEEPALIVE") {
    sendResponse({ ok: true })
    return
  }
  if (message?.type === "browser:stop") {
    handleStop(sender)
    sendResponse({ ok: true })
    return
  }
  if (message?.type === "permission:respond") return
  if (typeof message?.type !== "string") return
  void handleUi(message as UiRequest)
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, error: errorMessage(error) } satisfies UiResponse))
  return true
})

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== "keepalive") return
  void ensureOffscreen()
  relay.connect()
  if (config && backend === "offline" && !sseAbort) startSse()
})

chrome.commands.onCommand.addListener((command) => {
  if (command !== "toggle-side-panel") return
  void chrome.windows.getLastFocused().then((window) => {
    if (window.id !== undefined) void chrome.sidePanel.open({ windowId: window.id }).catch(() => undefined)
  })
})

chrome.runtime.onStartup.addListener(() => {
  void ensureOffscreen()
  relay.connect()
})

chrome.runtime.onInstalled.addListener(() => {
  void ensureOffscreen()
  relay.connect()
  void updateBadge()
})

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return
  if ("permissions.allow" in changes || "permissions.deny" in changes) {
    void permissions.init()
  }
})

async function init(): Promise<void> {
  await permissions.init()
  await tabs.cleanup().catch(() => undefined)
  config = await getConfig()
  if (config) {
    client = new OpencodeClient(config.baseUrl, config.token, config.directory)
    await refreshModels().catch(() => {
      backend = "offline"
    })
    await refreshAgents().catch(() => undefined)
    await refreshCommands().catch(() => undefined)
    await refreshSessions().catch(() => undefined)
    const stored = await chrome.storage.local.get(ACTIVE_SESSION_KEY)
    const wanted = typeof stored[ACTIVE_SESSION_KEY] === "string" ? stored[ACTIVE_SESSION_KEY] : null
    const initial = sessions.find((session) => session.id === wanted)?.id ?? sessions[0]?.id ?? null
    if (initial) await selectSession(initial)
    startSse()
  }
  relay.connect()
  await updateBadge()
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined)
  chrome.alarms.create("keepalive", { periodInMinutes: 0.5 })
  await ensureOffscreen()
  broadcastNow()
}

void init()
