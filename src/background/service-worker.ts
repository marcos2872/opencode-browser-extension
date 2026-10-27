import { Cdp } from "./cdp";
import {
  formatOpencodeError,
  OpencodeClient,
  OpencodeError,
} from "./opencode/client";
import { messageUsage } from "./opencode/usage";
import { Permissions } from "./permissions";
import { Recording } from "./recording";
import { RelayClient } from "./relay";
import { TabGroups } from "./tabGroups";
import { computerTools } from "./tools/computer";
import { gifTools } from "./tools/gif";
import { pageTools } from "./tools/page";
import { planTools } from "./tools/plan";
import { uploadTools } from "./tools/upload";
import { ToolRegistry } from "./tools/registry";
import { tabsTools } from "./tools/tabs";
import type { ToolContext } from "./tools/types";
import { getConfig, setConfig } from "../shared/storage";
import {
  PORT_NAME,
  RELAY_URL,
  type RelayInbound,
  type UiEvent,
  type UiRequest,
  type UiResponse,
} from "../shared/protocol";
import type {
  AgentInfo,
  AppSnapshot,
  CommandInfo,
  ChatMessage,
  ConnectionFailure,
  ConnectionPhase,
  ConnectionState,
  FormAnswer,
  FormInfo,
  ImagePayload,
  ModelInfo,
  ModelRef,
  OpencodeConfig,
  RelayState,
  SessionInfo,
  TokenUsage,
  ToolCallView,
} from "../shared/types";

const ACTIVE_SESSION_KEY = "ui.activeSession";
const BROWSER_AGENT_ID = "opencode-browser";
const cdp = new Cdp();
const tabs = new TabGroups();
const recording = new Recording(cdp);
const registry = new ToolRegistry([
  tabsTools,
  pageTools,
  computerTools,
  planTools,
  uploadTools,
  gifTools(recording),
]);
const ports = new Set<chrome.runtime.Port>();
const toolAborts = new Map<string, AbortController>();
const toolNames = new Map<string, string>();
const toolImages = new Map<string, ImagePayload[]>();

let config: OpencodeConfig | null = null;
let client: OpencodeClient | null = null;
let models: ModelInfo[] = [];
let sessions: SessionInfo[] = [];
let activeSessionID: string | null = null;
let messages: ChatMessage[] = [];
let forms: FormInfo[] = [];
let busy = false;
let connection: ConnectionState = {
  phase: "unconfigured",
  failure: null,
  detail: null,
  attempts: 0,
  lastOnlineAt: null,
  offlineSince: null,
};
let defaultModel: ModelRef | null = null;
let agents: AgentInfo[] = [];
let commands: CommandInfo[] = [];
let relayState: RelayState = { connected: false, url: RELAY_URL };
let statusMessage: string | null = null;
let workspaceHint: string | null = null;
let sseAbort: AbortController | null = null;
let broadcastTimer: ReturnType<typeof setTimeout> | null = null;
let hydrateToken = 0;
let probeInFlight = false;
let healthTick = 0;
let syncInFlight = false;
let syncPending = false;
let lastSseEventAt = 0;
let connectStartedAt = 0;
let refreshSessionTimer: ReturnType<typeof setTimeout> | null = null;
let contextUsage: TokenUsage | undefined;

function playSound(): void {
  if (config?.soundEnabled === false) return;
  void chrome.runtime
    .sendMessage({ type: "PLAY_NOTIFICATION" })
    .catch(() => undefined);
}

const permissions = new Permissions(
  () => config?.permissionMode ?? "ask",
  () => config?.permissionTimeoutMs ?? 60_000,
  () => ports.size > 0,
  (request) => broadcast({ type: "permission", request }),
  (requestId) => broadcast({ type: "permission:resolved", requestId }),
  () => playSound(),
);

const relay = new RelayClient({
  onTool: (request) => {
    void executeRelayTool(request);
  },
  onCancel: (id) => {
    toolAborts.get(id)?.abort();
  },
  onReady: (info) => {
    void applyWorkspace(info.workspace);
  },
  onState: (state) => {
    relayState = state;
    broadcast({ type: "relay", relay: state });
  },
});

function snapshot(): AppSnapshot {
  return {
    config,
    models,
    sessions,
    activeSessionID,
    messages,
    forms,
    relay: relayState,
    busy,
    connection,
    contextUsage,
    defaultModel,
    agents,
    commands,
    statusMessage,
  };
}

function broadcast(message: UiEvent): void {
  for (const port of ports) {
    try {
      port.postMessage(message);
    } catch {
      ports.delete(port);
    }
  }
}

function scheduleBroadcast(): void {
  if (broadcastTimer) return;
  broadcastTimer = setTimeout(() => {
    broadcastTimer = null;
    broadcast({ type: "snapshot", snapshot: snapshot() });
  }, 60);
}

function broadcastNow(): void {
  if (broadcastTimer) {
    clearTimeout(broadcastTimer);
    broadcastTimer = null;
  }
  broadcast({ type: "snapshot", snapshot: snapshot() });
}

function errorMessage(error: unknown): string {
  return formatOpencodeError(error) || "Erro inesperado do OpenCode.";
}

function setConnection(patch: Partial<ConnectionState>): void {
  const previous = connection;
  const next = { ...connection, ...patch };
  if (patch.phase === "online" && previous.phase !== "online") {
    next.lastOnlineAt = Date.now();
    next.offlineSince = null;
  }
  if (patch.phase === "offline" && previous.phase !== "offline") {
    next.offlineSince = Date.now();
  }
  if (patch.phase !== undefined && patch.phase !== "offline") {
    next.offlineSince = null;
  }
  connection = next;
  const visible =
    next.phase !== previous.phase ||
    next.failure !== previous.failure ||
    next.detail !== previous.detail;
  if (visible) broadcastNow();
  else scheduleBroadcast();
}

function classifyFailure(error: unknown): ConnectionFailure {
  if (error instanceof OpencodeError) {
    if (error.timedOut) return "timeout";
    if (error.status === 401 || error.status === 403) return "unauthorized";
    if (error.status !== undefined) return "server_error";
  }
  return "unreachable";
}

/**
 * Só devolve causa quando a falha é do canal (não do provedor). A UI usa isso
 * para não repetir no toast o que o banner persistente já explica.
 */
function connectionFailureOf(error: unknown): ConnectionFailure | undefined {
  if (!(error instanceof OpencodeError)) return undefined;
  if (error.timedOut) return "timeout";
  if (error.status === 401 || error.status === 403) return "unauthorized";
  if (error.status !== undefined) return undefined;
  return "unreachable";
}

function nextRetryDelay(
  attempts: number,
  failure: ConnectionFailure | null,
): number {
  if (failure === "unauthorized") return 60_000;
  const exponent = Math.min(Math.max(attempts - 1, 0), 4);
  return Math.min(2_000 * 2 ** exponent, 30_000);
}

function resetStreaming(): void {
  busy = false;
  statusMessage = null;
  for (const message of messages) {
    if (message.kind === "assistant") message.streaming = false;
  }
}

function markRunInterrupted(detail: string): void {
  busy = false;
  statusMessage = null;
  for (const item of messages) {
    if (item.kind === "assistant") item.streaming = false;
  }
  let message = [...messages]
    .reverse()
    .find((item) => item.kind === "assistant");
  if (!message || message.kind !== "assistant") {
    message = ensureAssistant(`interrupted_${crypto.randomUUID()}`);
  }
  if (message.kind !== "assistant") return;
  message.error = detail;
  message.streaming = false;
  broadcastNow();
}

function freshConnection(phase: ConnectionPhase): ConnectionState {
  return {
    phase,
    failure: null,
    detail: null,
    attempts: 0,
    lastOnlineAt: null,
    offlineSince: phase === "offline" ? Date.now() : null,
  };
}

async function handleUi(request: UiRequest): Promise<UiResponse> {
  switch (request.type) {
    case "state:get":
      return { ok: true, snapshot: snapshot() };
    case "pair":
      await pair(request.link);
      return { ok: true, snapshot: snapshot() };
    case "unpair":
      await unpair();
      return { ok: true, snapshot: snapshot() };
    case "models:refresh":
      await refreshModels();
      return { ok: true, snapshot: snapshot(), models };
    case "sessions:list":
      await refreshSessions();
      return { ok: true, snapshot: snapshot(), sessions };
    case "session:new":
      await createSession(request.model, request.agent);
      return { ok: true, snapshot: snapshot() };
    case "session:select":
      await selectSession(request.id);
      return { ok: true, snapshot: snapshot() };
    case "session:delete":
      await deleteSession(request.id);
      return { ok: true, snapshot: snapshot() };
    case "session:model":
      await switchModel(request.model);
      return { ok: true, snapshot: snapshot() };
    case "session:agent":
      await switchAgent(request.agent);
      return { ok: true, snapshot: snapshot() };
    case "tabs:attach-current": {
      const [tab] = await chrome.tabs.query({
        active: true,
        lastFocusedWindow: true,
      });
      if (!tab?.id) throw new Error("Nenhuma aba ativa encontrada.");
      const sessionID = activeSessionID ?? "default";
      const allowed = await permissions.check(
        {
          kind: "action",
          tool: "tabs_attach",
          title: "Dar acesso a esta aba ao agente",
          detail: tab.title,
          url: tab.url,
        },
        sessionID,
      );
      if (!allowed) return { ok: true, snapshot: snapshot() };
      await tabs.addTab(sessionID, tab.id, { makeMain: true });
      return { ok: true, snapshot: snapshot() };
    }
    case "tabs:list":
      return { ok: true, tabs: await tabs.list(request.sessionID) };
    case "tabs:detach":
      await tabs.detachTab(request.sessionID, request.tabID);
      return { ok: true, tabs: await tabs.list(request.sessionID) };
    case "prompt":
      await sendPrompt(request.text);
      return { ok: true, snapshot: snapshot() };
    case "command":
      await runCommand(request.name, request.text);
      return { ok: true, snapshot: snapshot() };
    case "interrupt":
      await interrupt();
      return { ok: true, snapshot: snapshot() };
    case "form:respond":
      await respondForm(request.sessionID, request.formID, request.answer);
      return { ok: true, snapshot: snapshot() };
    case "form:cancel":
      await cancelForm(request.sessionID, request.formID, request.message);
      return { ok: true, snapshot: snapshot() };
    case "settings:update":
      await updateSettings(request.patch);
      return { ok: true, snapshot: snapshot() };
    case "open:options":
      await chrome.runtime.openOptionsPage();
      return { ok: true };
    case "relay:reconnect":
      relay.reconnect();
      return { ok: true };
    case "connection:reconnect":
      await reconnectBackend();
      return { ok: true, snapshot: snapshot() };
    default:
      return { ok: false, error: "Comando desconhecido." };
  }
}

async function applyWorkspace(workspace: string | undefined): Promise<void> {
  if (!workspace) return;
  workspaceHint = workspace;
  if (!config) return;
  const firstDirectory = !config.directory;
  if (firstDirectory) {
    config = { ...config, directory: workspace };
    await setConfig(config);
    client = new OpencodeClient(config.baseUrl, config.token, config.directory);
  }
  ensureBrowserAgentInBackground();
  if (!firstDirectory) {
    // O agente pode ter acabado de ser gravado; recarrega a lista a cada ready.
    await refreshAgents().catch(() => undefined);
    return;
  }
  await refreshModels().catch(() => undefined);
  await refreshAgents().catch(() => undefined);
  await refreshCommands().catch(() => undefined);
  await refreshSessions().catch(() => undefined);
  if (!activeSessionID && sessions[0]) await selectSession(sessions[0].id);
  startSse();
  broadcastNow();
}

/**
 * O plugin grava o agente `opencode-browser` no `.opencode/agents` do diretório
 * da sessão. É idempotente e silencioso quando o plugin não está disponível.
 */
async function ensureBrowserAgent(): Promise<void> {
  if (!relayState.connected) return;
  try {
    await relay.ensureAgent();
  } catch {
    // plugin antigo ou sem resposta: seguimos com os agentes existentes
  }
}

/** Instala o agente sem bloquear o fluxo e recarrega a lista quando terminar. */
function ensureBrowserAgentInBackground(): void {
  if (!relayState.connected) return;
  void ensureBrowserAgent().then(async () => {
    await refreshAgents().catch(() => undefined);
    broadcastNow();
  });
}

async function pair(link: string): Promise<void> {
  const previous = config;
  const { baseUrl, token } = await OpencodeClient.pair(link);
  config = {
    baseUrl,
    token,
    directory: previous?.directory ?? workspaceHint ?? undefined,
    defaultModel: previous?.defaultModel,
    permissionMode: previous?.permissionMode ?? "ask",
  };
  await setConfig(config);
  client = new OpencodeClient(config.baseUrl, config.token, config.directory);
  await permissions.init();
  setConnection({
    phase: "connecting",
    failure: null,
    detail: null,
    attempts: 0,
  });
  try {
    await refreshModels();
    ensureBrowserAgentInBackground();
    await refreshAgents().catch(() => undefined);
    await refreshCommands().catch(() => undefined);
    await refreshSessions();
  } catch (error) {
    setConnection({
      phase: "offline",
      failure: classifyFailure(error),
      detail: errorMessage(error),
    });
    throw error;
  }
  if (!activeSessionID && sessions[0]) {
    await selectSession(sessions[0].id);
  }
  startSse();
  await updateBadge();
  broadcastNow();
}

async function unpair(): Promise<void> {
  sseAbort?.abort();
  sseAbort = null;
  await setConfig(null);
  config = null;
  client = null;
  workspaceHint = null;
  models = [];
  sessions = [];
  activeSessionID = null;
  messages = [];
  forms = [];
  busy = false;
  connection = freshConnection("unconfigured");
  defaultModel = null;
  agents = [];
  commands = [];
  statusMessage = null;
  syncPending = false;
  contextUsage = undefined;
  await chrome.storage.local.remove(ACTIVE_SESSION_KEY);
  await updateBadge();
  broadcastNow();
}

async function updateSettings(patch: Partial<OpencodeConfig>): Promise<void> {
  if (!config) throw new Error("Configure o pareamento primeiro.");
  const next: OpencodeConfig = { ...config, ...patch };
  if (!next.baseUrl || !next.token) throw new Error("Configuração inválida.");
  const connectionChanged =
    next.baseUrl !== config.baseUrl ||
    next.token !== config.token ||
    next.directory !== config.directory;
  config = next;
  await setConfig(config);
  if (connectionChanged) {
    client = new OpencodeClient(config.baseUrl, config.token, config.directory);
    setConnection({
      phase: "connecting",
      failure: null,
      detail: null,
      attempts: 0,
    });
    startSse();
    await refreshModels().catch((error) => {
      setConnection({
        phase: "offline",
        failure: classifyFailure(error),
        detail: errorMessage(error),
      });
    });
    ensureBrowserAgentInBackground();
  }
  broadcastNow();
}

async function refreshModels(): Promise<void> {
  if (!client) throw new Error("OpenCode não configurado.");
  const active = client;
  const listed = await active.listModels();
  if (client !== active) return;
  models = listed.sort((a, b) => {
    if (a.providerID !== b.providerID)
      return a.providerID.localeCompare(b.providerID);
    return (a.name ?? a.id).localeCompare(b.name ?? b.id);
  });
  const fallback = await active.defaultModel().catch(() => null);
  if (client !== active || !config) return;
  defaultModel = fallback ?? defaultModel;
  const preferred = config.defaultModel;
  if (
    preferred &&
    !models.some(
      (model) =>
        model.id === preferred.id && model.providerID === preferred.providerID,
    )
  ) {
    config = { ...config, defaultModel: undefined };
    await setConfig(config);
  }
  if (!config.defaultModel && defaultModel) {
    config = { ...config, defaultModel };
    await setConfig(config);
  }
  broadcastNow();
}

async function refreshCommands(): Promise<void> {
  if (!client) return;
  const active = client;
  const listed = await active.listCommands();
  if (client !== active) return;
  commands = listed.sort((a, b) => a.name.localeCompare(b.name));
  broadcastNow();
}

async function refreshAgents(): Promise<void> {
  if (!client) return;
  const active = client;
  const listed = await active.listAgents();
  if (client !== active || !config) return;
  agents = listed.sort((a, b) =>
    (a.name ?? a.id).localeCompare(b.name ?? b.id),
  );
  if (
    config.defaultAgent &&
    !agents.some((agent) => agent.id === config?.defaultAgent)
  ) {
    config = { ...config, defaultAgent: undefined };
    await setConfig(config);
  }
  if (!config?.defaultAgent) {
    const preferred = agents.some((agent) => agent.id === BROWSER_AGENT_ID)
      ? BROWSER_AGENT_ID
      : agents.some((agent) => agent.id === "build")
        ? "build"
        : undefined;
    if (preferred) {
      config = { ...config!, defaultAgent: preferred };
      await setConfig(config);
    }
  }
  broadcastNow();
}

function refreshSessionUsage(): void {
  if (refreshSessionTimer) clearTimeout(refreshSessionTimer);
  refreshSessionTimer = setTimeout(() => {
    refreshSessionTimer = null;
    void (async () => {
      await refreshSessions().catch(() => undefined);
      await refreshActiveUsage();
    })();
  }, 400);
}

/** Contexto da última requisição da sessão ativa (não é o total acumulado). */
async function refreshActiveUsage(): Promise<void> {
  if (!client || !activeSessionID) {
    contextUsage = undefined;
    broadcastNow();
    return;
  }
  const sessionID = activeSessionID;
  const usage = await client
    .lastAssistantUsage(sessionID)
    .catch(() => undefined);
  if (activeSessionID !== sessionID) return;
  contextUsage = usage;
  broadcastNow();
}

async function refreshSessions(): Promise<void> {
  if (!client) throw new Error("OpenCode não configurado.");
  const active = client;
  const directory = config?.directory;
  const listed = await active.listSessions();
  if (client !== active) return;
  sessions = listed
    .filter(
      (session) =>
        !directory ||
        !session.location?.directory ||
        session.location.directory === directory,
    )
    .sort((a, b) => (b.time?.updated ?? 0) - (a.time?.updated ?? 0));
  if (
    activeSessionID &&
    !sessions.some((session) => session.id === activeSessionID)
  ) {
    activeSessionID = null;
    messages = [];
    forms = [];
  }
  broadcastNow();
}

function pickModel(explicit?: ModelRef): ModelRef | undefined {
  if (explicit) return explicit;
  if (config?.defaultModel) return config.defaultModel;
  if (defaultModel) return defaultModel;
  return models.find((model) => model.capabilities?.tools !== false)
    ? {
        id: models.find((model) => model.capabilities?.tools !== false)!.id,
        providerID: models.find((model) => model.capabilities?.tools !== false)!
          .providerID,
      }
    : undefined;
}

async function createSession(model?: ModelRef, agent?: string): Promise<void> {
  if (!client) throw new Error("OpenCode não configurado.");
  const chosen = pickModel(model);
  const browserAgent =
    config?.browserAgentDefault !== false &&
    agents.some((item) => item.id === BROWSER_AGENT_ID)
      ? BROWSER_AGENT_ID
      : undefined;
  const chosenAgent =
    agent ??
    browserAgent ??
    config?.defaultAgent ??
    agents.find((item) => item.id === "build")?.id;
  const session = await client.createSession(chosen, chosenAgent);
  if (!session.agent && chosenAgent) session.agent = chosenAgent;
  sessions = [session, ...sessions.filter((item) => item.id !== session.id)];
  activeSessionID = session.id;
  messages = [];
  busy = false;
  contextUsage = undefined;
  await chrome.storage.local.set({ [ACTIVE_SESSION_KEY]: session.id });
  broadcastNow();
}

async function selectSession(id: string): Promise<void> {
  activeSessionID = id;
  messages = [];
  forms = [];
  busy = false;
  await chrome.storage.local.set({ [ACTIVE_SESSION_KEY]: id });
  broadcastNow();
  void hydrate(id);
  void loadForms(id);
  void refreshActiveUsage();
}

async function loadForms(id: string): Promise<void> {
  if (!client) return;
  const known = new Set(forms.map((form) => form.id));
  try {
    const pending = await client.listForms(id);
    if (activeSessionID !== id) return;
    // Preserva forms criados por SSE enquanto a listagem estava em voo.
    const arrived = forms.filter((form) => !known.has(form.id));
    const missing = arrived.filter(
      (form) => !pending.some((item) => item.id === form.id),
    );
    forms = [...pending, ...missing];
    broadcastNow();
  } catch {
    // A sessão pode ter sido removida; mantém os forms que já estão na tela.
  }
}

async function respondForm(
  sessionID: string,
  formID: string,
  answer: FormAnswer,
): Promise<void> {
  if (!client) throw new Error("OpenCode não configurado.");
  await client.replyForm(sessionID, formID, answer);
  forms = forms.filter((form) => form.id !== formID);
  broadcastNow();
}

async function cancelForm(
  sessionID: string,
  formID: string,
  message?: string,
): Promise<void> {
  if (!client) throw new Error("OpenCode não configurado.");
  await client.cancelForm(sessionID, formID, message);
  forms = forms.filter((form) => form.id !== formID);
  broadcastNow();
}

async function hydrate(id: string): Promise<void> {
  if (!client) return;
  const token = ++hydrateToken;
  const startedAt = Date.now();
  try {
    const raw = await client.context(id);
    if (token !== hydrateToken || activeSessionID !== id) return;
    if (busy) return;
    // Um evento ao vivo chegou durante a leitura: ele é mais novo que o
    // snapshot e sobrescrever aqui apagaria texto/erro recém-recebidos.
    if (lastSseEventAt > startedAt) return;
    messages = mapContext(raw);
    busy = messages.some(
      (message) => message.kind === "assistant" && message.streaming,
    );
    broadcastNow();
  } catch {
    // The session may have been deleted; keep the current view.
  }
}

function mapContext(raw: unknown[]): ChatMessage[] {
  const output: ChatMessage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const message = item as Record<string, unknown>;
    const id =
      typeof message.id === "string" ? message.id : crypto.randomUUID();
    const time =
      message.time &&
      typeof message.time === "object" &&
      typeof (message.time as { created?: unknown }).created === "number"
        ? ((message.time as { created: number }).created as number)
        : Date.now();
    if (message.type === "user" && typeof message.text === "string") {
      output.push({ kind: "user", id, text: message.text, time });
      continue;
    }
    if (message.type !== "assistant") continue;
    const content = Array.isArray(message.content) ? message.content : [];
    const textParts: string[] = [];
    const reasoningParts: string[] = [];
    const tools: ToolCallView[] = [];
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const value = part as Record<string, unknown>;
      if (value.type === "text" && typeof value.text === "string")
        textParts.push(value.text);
      if (value.type === "reasoning" && typeof value.text === "string")
        reasoningParts.push(value.text);
      if (value.type === "tool") {
        const state = (value.state ?? {}) as Record<string, unknown>;
        const status =
          state.status === "error"
            ? "error"
            : state.status === "completed"
              ? "ok"
              : "running";
        const parts = Array.isArray(state.content) ? state.content : [];
        const text = parts
          .map((entry) => {
            const partValue = entry as Record<string, unknown>;
            return partValue.type === "text" &&
              typeof partValue.text === "string"
              ? partValue.text
              : "";
          })
          .filter(Boolean)
          .join("\n");
        tools.push({
          id: typeof value.id === "string" ? value.id : crypto.randomUUID(),
          name: typeof value.name === "string" ? value.name : "tool",
          input: state.input,
          status,
          output: text || undefined,
          images: toolImages.get(typeof value.id === "string" ? value.id : ""),
        });
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
      usage: messageUsage(message),
    });
  }
  return output;
}

async function deleteSession(id: string): Promise<void> {
  if (!client) return;
  await client.deleteSession(id);
  sessions = sessions.filter((session) => session.id !== id);
  if (activeSessionID === id) {
    activeSessionID = sessions[0]?.id ?? null;
    messages = [];
    forms = [];
    if (activeSessionID) await selectSession(activeSessionID);
    else contextUsage = undefined;
  }
  broadcastNow();
}

async function switchModel(model: ModelRef): Promise<void> {
  if (!client || !activeSessionID) throw new Error("Nenhuma sessão ativa.");
  await client.switchModel(activeSessionID, model);
  const session = sessions.find((item) => item.id === activeSessionID);
  if (session) session.model = model;
  broadcastNow();
}

function isConnectionFailure(failure: ConnectionFailure): boolean {
  return (
    failure === "unreachable" ||
    failure === "timeout" ||
    failure === "unauthorized"
  );
}

/**
 * Em falha de conexão, remove a mensagem otimista para a UI devolver o texto ao
 * rascunho e propaga o erro (o banner persistente explica o que fazer). Nos
 * demais erros, mantém a bolha inline com o detalhe do provedor.
 */
function handleSendFailure(error: unknown, optimisticID: string): void {
  busy = false;
  const failure = classifyFailure(error);
  if (isConnectionFailure(failure)) {
    messages = messages.filter((message) => message.id !== optimisticID);
    setConnection({
      phase: "offline",
      failure,
      detail: errorMessage(error),
    });
    broadcastNow();
    throw error;
  }
  messages.push({
    kind: "assistant",
    id: `local_error_${crypto.randomUUID()}`,
    text: "",
    reasoning: "",
    tools: [],
    time: Date.now(),
    streaming: false,
    error: errorMessage(error),
  });
  broadcastNow();
}

async function runCommand(name: string, text: string): Promise<void> {
  if (!client) throw new Error("OpenCode não configurado.");
  if (!activeSessionID) await createSession();
  if (!activeSessionID) throw new Error("Não foi possível criar a sessão.");
  const sessionID = activeSessionID;
  const optimisticID = `local_${crypto.randomUUID()}`;
  messages.push({
    kind: "user",
    id: optimisticID,
    text: `/${name}${text ? ` ${text}` : ""}`,
    time: Date.now(),
  });
  busy = true;
  statusMessage = null;
  broadcastNow();
  try {
    await client.runCommand(sessionID, name, text);
  } catch (error) {
    handleSendFailure(error, optimisticID);
  }
}

async function switchAgent(agent: string): Promise<void> {
  if (!client) throw new Error("OpenCode não configurado.");
  if (activeSessionID) {
    await client.switchAgent(activeSessionID, agent);
    const session = sessions.find((item) => item.id === activeSessionID);
    if (session) session.agent = agent;
  } else {
    config = { ...config!, defaultAgent: agent };
    await setConfig(config);
  }
  broadcastNow();
}

async function sendPrompt(text: string): Promise<void> {
  if (!client) throw new Error("OpenCode não configurado.");
  const trimmed = text.trim();
  if (!trimmed) return;
  if (!activeSessionID) {
    await createSession();
  }
  if (!activeSessionID) throw new Error("Não foi possível criar a sessão.");
  const sessionID = activeSessionID;
  const optimisticID = `local_${crypto.randomUUID()}`;
  messages.push({
    kind: "user",
    id: optimisticID,
    text: trimmed,
    time: Date.now(),
  });
  busy = true;
  statusMessage = null;
  broadcastNow();
  try {
    await client.prompt(sessionID, trimmed);
  } catch (error) {
    handleSendFailure(error, optimisticID);
  }
}

async function interrupt(): Promise<void> {
  for (const controller of toolAborts.values()) controller.abort();
  toolAborts.clear();
  if (client && activeSessionID) {
    await client.interrupt(activeSessionID).catch(() => undefined);
  }
  busy = false;
  for (const message of messages) {
    if (message.kind === "assistant") message.streaming = false;
  }
  broadcastNow();
}

function startSse(resetBackoff = true): void {
  sseAbort?.abort();
  sseAbort = null;
  if (!client) {
    setConnection({ phase: "unconfigured" });
    return;
  }
  const controller = new AbortController();
  sseAbort = controller;
  const activeClient = client;
  setConnection({
    phase: "connecting",
    failure: null,
    detail: null,
    attempts: resetBackoff ? 0 : connection.attempts,
  });
  const handleEvent = (event: Parameters<typeof onOpencodeEvent>[0]) => {
    if (client !== activeClient) return;
    lastSseEventAt = Date.now();
    onOpencodeEvent(event);
  };

  void (async () => {
    while (!controller.signal.aborted) {
      try {
        connectStartedAt = Date.now();
        console.log("[sse] conectando", config?.baseUrl);
        await activeClient.subscribe(
          handleEvent,
          controller.signal,
          () => {
            if (
              controller.signal.aborted ||
              sseAbort !== controller ||
              client !== activeClient
            ) {
              return;
            }
            const reconnected = connection.phase !== "online";
            lastSseEventAt = Date.now();
            setConnection({
              phase: "online",
              failure: null,
              detail: null,
              attempts: 0,
            });
            if (reconnected) void syncAfterReconnect();
          },
        );
        if (controller.signal.aborted) return;
        console.log("[sse] stream encerrado");
        setConnection({
          phase: "offline",
          failure: "stream_closed",
          detail: "O OpenCode encerrou o stream de eventos.",
          attempts: connection.attempts + 1,
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("[sse] erro", error);
        setConnection({
          phase: "offline",
          failure: classifyFailure(error),
          detail: errorMessage(error),
          attempts: connection.attempts + 1,
        });
      }
      if (controller.signal.aborted) return;
      await sleep(nextRetryDelay(connection.attempts, connection.failure));
    }
    if (sseAbort === controller) sseAbort = null;
  })();
}

/**
 * Depois de uma reconexão, o servidor pode estar em outro estado: recarrega as
 * listas e reidrata a sessão ativa para o painel não ficar vazio.
 */
async function syncAfterReconnect(): Promise<void> {
  if (!client) return;
  if (syncInFlight) {
    syncPending = true;
    return;
  }
  const active = client;
  syncInFlight = true;
  try {
    await refreshModels();
    if (client !== active) return;
    await refreshAgents().catch(() => undefined);
    await refreshCommands().catch(() => undefined);
    await refreshSessions().catch(() => undefined);
    if (client !== active) return;
    if (!activeSessionID && sessions[0]) {
      await selectSession(sessions[0].id);
    } else if (activeSessionID) {
      void hydrate(activeSessionID);
    }
  } catch (error) {
    if (client !== active) return;
    // O stream está aberto; uma falha pontual de refresh não derruba o estado.
    if (connection.phase === "online") return;
    setConnection({
      phase: "offline",
      failure: classifyFailure(error),
      detail: errorMessage(error),
    });
  } finally {
    syncInFlight = false;
    if (syncPending) {
      syncPending = false;
      void syncAfterReconnect();
    }
  }
}

async function reconnectBackend(): Promise<void> {
  const stored = await getConfig();
  if (!stored) {
    setConnection({ phase: "unconfigured" });
    throw new Error("Configure o pareamento primeiro.");
  }
  const wasOnline = connection.phase === "online";
  config = stored;
  client = new OpencodeClient(config.baseUrl, config.token, config.directory);
  if (!wasOnline) resetStreaming();
  ensureBrowserAgentInBackground();
  startSse();
  await syncAfterReconnect();
  await updateBadge();
  broadcastNow();
}

function onOpencodeEvent(event: {
  type: string;
  data?: Record<string, unknown>;
}): void {
  const data = event.data ?? {};
  const info =
    data.info && typeof data.info === "object"
      ? (data.info as Record<string, unknown>)
      : undefined;
  const sessionID =
    typeof data.sessionID === "string"
      ? data.sessionID
      : typeof info?.sessionID === "string"
        ? info.sessionID
        : undefined;
  console.log(
    "[sse] evento",
    event.type,
    sessionID ?? "",
    "active=",
    activeSessionID ?? "",
  );

  if (event.type === "form.created") {
    const form = data.form as FormInfo | undefined;
    if (form?.id && form.sessionID === activeSessionID) {
      if (!forms.some((item) => item.id === form.id)) {
        forms = [...forms, form];
        playSound();
        if (ports.size === 0 && config?.notifyEnabled !== false) {
          void chrome.notifications
            .create(`oc-form-${form.id}`, {
              type: "basic",
              iconUrl: chrome.runtime.getURL("icons/icon-128.png"),
              title: "OpenCode Browser",
              message: (form.title
                ? `O agente precisa de uma resposta: ${form.title}`
                : "O agente precisa de uma resposta."
              ).slice(0, 180),
            })
            .catch(() => undefined);
        }
        scheduleBroadcast();
      }
    }
    return;
  }

  if (event.type === "form.replied" || event.type === "form.cancelled") {
    const replied = data.form as FormInfo | undefined;
    const formID =
      typeof data.id === "string"
        ? data.id
        : typeof replied?.id === "string"
          ? replied.id
          : undefined;
    if (formID && forms.some((item) => item.id === formID)) {
      forms = forms.filter((item) => item.id !== formID);
      scheduleBroadcast();
    }
    return;
  }

  if (event.type === "session.created" && sessionID) {
    const title = typeof data.title === "string" ? data.title : undefined;
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
      ];
      scheduleBroadcast();
    }
  }

  if (event.type === "session.renamed" && sessionID) {
    const session = sessions.find((item) => item.id === sessionID);
    if (session && typeof data.title === "string") {
      session.title = data.title;
      session.time = { ...session.time, updated: Date.now() };
      scheduleBroadcast();
    }
  }

  if (!sessionID || sessionID !== activeSessionID) return;

  const assistantID =
    typeof data.assistantMessageID === "string"
      ? data.assistantMessageID
      : event.type === "message.updated" &&
          info?.role === "assistant" &&
          typeof info.id === "string"
        ? info.id
        : event.type === "session.usage.updated" &&
            typeof data.messageID === "string"
          ? data.messageID
          : undefined;

  switch (event.type) {
    case "message.updated": {
      if (info?.role !== "assistant" || !assistantID) break;
      const usage = messageUsage(info);
      if (usage) {
        ensureAssistant(assistantID).usage = usage;
        scheduleBroadcast();
      }
      break;
    }
    case "session.usage.updated": {
      const source =
        data.usage && typeof data.usage === "object"
          ? (data.usage as Record<string, unknown>)
          : data;
      const usage = messageUsage(source);
      const target = assistantID
        ? ensureAssistant(assistantID)
        : [...messages]
            .reverse()
            .find(
              (message) => message.kind === "assistant" && message.streaming,
            );
      if (usage && target?.kind === "assistant") {
        target.usage = usage;
        scheduleBroadcast();
      }
      break;
    }
    case "session.step.started":
    case "session.execution.started":
      busy = true;
      statusMessage = null;
      scheduleBroadcast();
      break;
    case "session.text.started":
      if (assistantID) ensureAssistant(assistantID).streaming = true;
      scheduleBroadcast();
      break;
    case "session.text.delta": {
      if (!assistantID || typeof data.delta !== "string") break;
      const message = ensureAssistant(assistantID);
      message.text += data.delta;
      message.streaming = true;
      statusMessage = null;
      scheduleBroadcast();
      break;
    }
    case "session.text.ended": {
      if (!assistantID) break;
      const message = ensureAssistant(assistantID);
      if (typeof data.text === "string") {
        message.text =
          message.text && !data.text.startsWith(message.text)
            ? `${message.text}\n\n${data.text}`
            : data.text;
      }
      // O texto deste passo acabou; o run pode continuar em outro passo.
      message.streaming = false;
      scheduleBroadcast();
      break;
    }
    case "session.reasoning.delta": {
      if (!assistantID || typeof data.delta !== "string") break;
      const message = ensureAssistant(assistantID);
      message.reasoning += data.delta;
      scheduleBroadcast();
      break;
    }
    case "session.reasoning.ended": {
      if (!assistantID) break;
      const message = ensureAssistant(assistantID);
      if (typeof data.text === "string") message.reasoning = data.text;
      scheduleBroadcast();
      break;
    }
    case "session.tool.input.started": {
      if (typeof data.id === "string" && typeof data.name === "string") {
        toolNames.set(data.id, data.name);
      }
      break;
    }
    case "session.tool.called": {
      if (!assistantID || typeof data.id !== "string") break;
      const message = ensureAssistant(assistantID);
      const id = data.id;
      const existing = message.tools.find((tool) => tool.id === id);
      if (existing) {
        existing.input = data.input;
      } else {
        message.tools.push({
          id,
          name: toolNames.get(id) ?? "tool",
          input: data.input,
          status: "running",
          images: toolImages.get(id),
          startedAt: Date.now(),
        });
      }
      scheduleBroadcast();
      break;
    }
    case "session.tool.progress": {
      if (typeof data.id !== "string") break;
      const tool = findTool(data.id);
      if (tool) {
        tool.metadata = data.metadata as Record<string, unknown>;
        scheduleBroadcast();
      }
      break;
    }
    case "session.tool.success": {
      if (typeof data.id !== "string") break;
      const tool = ensureTool(data.id, assistantID);
      if (tool) {
        tool.status = "ok";
        tool.output = contentText(data.content);
        tool.metadata = data.metadata as Record<string, unknown>;
        tool.images = toolImages.get(data.id) ?? tool.images;
        tool.finishedAt = Date.now();
        scheduleBroadcast();
      }
      break;
    }
    case "session.tool.failed": {
      if (typeof data.id !== "string") break;
      const tool = ensureTool(data.id, assistantID);
      if (tool) {
        tool.status = "error";
        tool.output =
          formatOpencodeError(data.error) || contentText(data.content);
        tool.finishedAt = Date.now();
        scheduleBroadcast();
      }
      break;
    }
    case "session.retry.scheduled": {
      busy = true;
      const attempt =
        typeof data.attempt === "number" ? data.attempt : undefined;
      const reason =
        typeof data.message === "string" ? data.message : "erro temporário";
      statusMessage = `Tentando novamente${attempt ? ` (tentativa ${attempt})` : ""}: ${reason}`;
      scheduleBroadcast();
      break;
    }
    case "session.execution.succeeded":
      busy = false;
      statusMessage = null;
      for (const message of messages) {
        if (message.kind === "assistant") message.streaming = false;
      }
      refreshSessionUsage();
      if (ports.size === 0) {
        playSound();
        if (config?.notifyEnabled !== false) {
          const title =
            sessions.find((item) => item.id === activeSessionID)?.title ??
            "Tarefa";
          void chrome.notifications
            .create(`oc-${Date.now()}`, {
              type: "basic",
              iconUrl: chrome.runtime.getURL("icons/icon-128.png"),
              title: "OpenCode Browser",
              message: `Concluído: ${title}`.slice(0, 180),
            })
            .catch(() => undefined);
        }
      }
      scheduleBroadcast();
      break;
    case "session.execution.failed":
      markSessionError(data.error ?? data.message);
      break;
    case "session.step.ended":
      if (data.finish !== "tool-calls") busy = false;
      // O passo terminou; nenhuma mensagem dele continua "streaming", mesmo
      // quando o run segue para as ferramentas ou para o próximo passo.
      for (const message of messages) {
        if (message.kind === "assistant") message.streaming = false;
      }
      scheduleBroadcast();
      break;
    case "session.status": {
      const status = data.status as { type?: string } | undefined;
      if (status?.type === "idle") {
        busy = false;
        for (const message of messages) {
          if (message.kind === "assistant") message.streaming = false;
        }
        refreshSessionUsage();
        scheduleBroadcast();
      }
      break;
    }
    case "session.error": {
      markSessionError(data.error);
      break;
    }
  }
}

function markSessionError(error: unknown): void {
  busy = false;
  statusMessage = null;
  refreshSessionUsage();
  for (const item of messages) {
    if (item.kind === "assistant") item.streaming = false;
  }
  let message = [...messages]
    .reverse()
    .find((item) => item.kind === "assistant");
  if (!message || message.kind !== "assistant") {
    message = ensureAssistant(`error_${crypto.randomUUID()}`);
  }
  if (message.kind !== "assistant") return;
  const detail = formatOpencodeError(error);
  if (detail) message.error = detail;
  else if (!message.error) {
    message.error = "A execução falhou no OpenCode sem detalhes adicionais.";
  }
  message.streaming = false;
  scheduleBroadcast();
}

function ensureAssistant(
  id: string,
): Extract<ChatMessage, { kind: "assistant" }> {
  const existing = messages.find(
    (message): message is Extract<ChatMessage, { kind: "assistant" }> =>
      message.kind === "assistant" && message.id === id,
  );
  if (existing) return existing;
  const created: Extract<ChatMessage, { kind: "assistant" }> = {
    kind: "assistant",
    id,
    text: "",
    reasoning: "",
    tools: [],
    time: Date.now(),
    streaming: true,
  };
  // Só uma mensagem pode estar em produção por vez; passos anteriores já
  // terminaram mesmo que o run continue.
  for (const message of messages) {
    if (message.kind === "assistant") message.streaming = false;
  }
  messages.push(created);
  return created;
}

function findTool(id: string): ToolCallView | undefined {
  for (const message of messages) {
    if (message.kind !== "assistant") continue;
    const tool = message.tools.find((item) => item.id === id);
    if (tool) return tool;
  }
  return undefined;
}

function ensureTool(
  id: string,
  assistantID?: string,
): ToolCallView | undefined {
  const existing = findTool(id);
  if (existing) return existing;
  const message = assistantID
    ? ensureAssistant(assistantID)
    : [...messages].reverse().find((item) => item.kind === "assistant");
  if (!message || message.kind !== "assistant") return undefined;
  const tool: ToolCallView = {
    id,
    name: toolNames.get(id) ?? "tool",
    status: "running",
    images: toolImages.get(id),
    startedAt: Date.now(),
  };
  message.tools.push(tool);
  return tool;
}

function contentText(content: unknown): string | undefined {
  if (!Array.isArray(content)) return undefined;
  const text = content
    .map((entry) => {
      const value = entry as Record<string, unknown>;
      return value.type === "text" && typeof value.text === "string"
        ? value.text
        : "";
    })
    .filter(Boolean)
    .join("\n");
  return text || undefined;
}

async function executeRelayTool(
  request: Extract<RelayInbound, { type: "tool_request" }>,
): Promise<void> {
  const sessionID = request.sessionID || activeSessionID || "relay";
  const controller = new AbortController();
  toolAborts.set(request.id, controller);
  const context: ToolContext = {
    sessionID,
    signal: controller.signal,
    cdp,
    permissions,
    tabs,
    progress: (phase, detail) => {
      relay.send({ type: "progress", id: request.id, phase, detail });
    },
    indicator: async (tabId, status, busy = true) => {
      await chrome.tabs
        .sendMessage(tabId, { type: "indicator:show" })
        .catch(() => undefined);
      await chrome.tabs
        .sendMessage(tabId, { type: "indicator:status", text: status, busy })
        .catch(() => undefined);
    },
    hideIndicator: async (tabId) => {
      await chrome.tabs
        .sendMessage(tabId, { type: "indicator:hide" })
        .catch(() => undefined);
    },
    cursor: async (tabId, x, y) => {
      await chrome.tabs
        .sendMessage(tabId, { type: "indicator:cursor", x, y })
        .catch(() => undefined);
    },
    rank: async (query, candidates) => {
      if (!client || (config?.findMode ?? "heuristic") !== "model") return null;
      const session = sessions.find((item) => item.id === activeSessionID);
      const model =
        session?.model ?? config?.defaultModel ?? defaultModel ?? undefined;
      const list = candidates
        .slice(0, 120)
        .map(
          (item) =>
            `${item.ref} | ${item.role} | ${item.name}${item.type ? ` | ${item.type}` : ""}`,
        )
        .join("\n");
      const prompt = [
        "Você escolhe elementos de uma página web para uma consulta.",
        `Consulta: ${query}`,
        "",
        "Elementos (ref | role | nome | tipo):",
        list,
        "",
        "Responda SOMENTE com os refs mais relevantes, um por linha, no máximo 10, do mais relevante ao menos.",
        "Se nenhum servir, responda NENHUM.",
      ].join("\n");
      try {
        const text = await client.generate(prompt, model);
        const refs = text
          .split(/\s+/)
          .map((token) => token.trim().replace(/[^A-Za-z0-9_]/g, ""))
          .filter((token) => /^(f\d+_)?ref_\d+$/.test(token));
        if (refs.length === 0) return null;
        return [...new Set(refs)].slice(0, 10);
      } catch {
        return null;
      }
    },
    ask: async (input) => (await permissions.check(input, sessionID)).allowed,
  };

  try {
    relay.send({
      type: "progress",
      id: request.id,
      phase: "starting",
      detail: request.tool,
    });
    const result = await registry.run(
      request.tool,
      request.args ?? {},
      context,
    );
    if (result.images?.length) {
      toolImages.set(request.id, result.images);
      if (toolImages.size > 40) {
        const oldest = toolImages.keys().next().value;
        if (oldest) toolImages.delete(oldest);
      }
      const tool = findTool(request.id);
      if (tool) tool.images = result.images;
    }
    relay.send({
      type: "tool_result",
      id: request.id,
      ok: true,
      content: result.content,
      images: result.images,
      metadata: result.metadata,
    });
    if (recording.active && request.tool !== "gif_creator") {
      const target = await tabs.resolveTab(sessionID).catch(() => null);
      if (target) await recording.capture(target.tabId, request.tool);
    }
    scheduleBroadcast();
  } catch (error) {
    const message = errorMessage(error);
    relay.send({
      type: "tool_result",
      id: request.id,
      ok: false,
      error: message,
    });
    const tool = findTool(request.id);
    if (tool) {
      tool.status = "error";
      tool.output = message;
      scheduleBroadcast();
    }
  } finally {
    toolAborts.delete(request.id);
  }
}

function handleStop(sender: chrome.runtime.MessageSender): void {
  for (const controller of toolAborts.values()) controller.abort();
  toolAborts.clear();
  if (client && activeSessionID) {
    void client.interrupt(activeSessionID).catch(() => undefined);
  }
  busy = false;
  for (const message of messages) {
    if (message.kind === "assistant") message.streaming = false;
  }
  if (sender.tab?.id !== undefined) {
    void chrome.tabs
      .sendMessage(sender.tab.id, { type: "indicator:hide" })
      .catch(() => undefined);
  }
  broadcastNow();
}

async function updateBadge(): Promise<void> {
  try {
    if (!config) {
      await chrome.action.setBadgeText({ text: "!" });
      await chrome.action.setTitle({
        title: "OpenCode Browser: configure o pareamento",
      });
    } else {
      await chrome.action.setBadgeText({ text: "" });
      await chrome.action.setTitle({ title: "OpenCode Browser" });
    }
  } catch {
    // ignore
  }
}

async function ensureOffscreen(): Promise<void> {
  try {
    if (await chrome.offscreen.hasDocument()) return;
  } catch {
    // fall through
  }
  try {
    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["BLOBS"] as chrome.offscreen.Reason[],
      justification: "Manter a conexão com o plugin local do OpenCode ativa.",
    });
  } catch {
    // Already created or unsupported.
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PORT_NAME) return;
  ports.add(port);
  port.onDisconnect.addListener(() => ports.delete(port));
  try {
    port.postMessage({
      type: "snapshot",
      snapshot: snapshot(),
    } satisfies UiEvent);
  } catch {
    ports.delete(port);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "SW_KEEPALIVE") {
    sendResponse({ ok: true });
    return;
  }
  if (message?.type === "browser:stop") {
    handleStop(sender);
    sendResponse({ ok: true });
    return;
  }
  if (message?.type === "permission:respond") return;
  if (typeof message?.type !== "string") return;
  void handleUi(message as UiRequest)
    .then(sendResponse)
    .catch((error) =>
      sendResponse({
        ok: false,
        error: errorMessage(error),
        failure: connectionFailureOf(error),
      } satisfies UiResponse),
    );
  return true;
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== "keepalive") return;
  void ensureOffscreen();
  relay.connect();
  void runHealthcheck();
});

/**
 * Motor periódico (30 s). Retoma o SSE quando ele não está rodando, encerra
 * execuções órfãs após queda e faz uma verificação leve de vida do servidor
 * para detectar streams meio-abertos.
 */
async function runHealthcheck(): Promise<void> {
  if (!config || !client) return;
  if (!sseAbort) {
    startSse();
    return;
  }
  if (
    connection.phase === "connecting" &&
    connectStartedAt &&
    Date.now() - connectStartedAt > 20_000
  ) {
    // Handshake pendurado: o servidor aceitou o TCP mas não abriu o stream.
    startSse(false);
    return;
  }
  if (busy) {
    if (
      connection.phase === "offline" &&
      connection.offlineSince &&
      Date.now() - connection.offlineSince > 5_000
    ) {
      markRunInterrupted(
        "A conexão com o OpenCode caiu durante a execução. A resposta pode estar incompleta.",
      );
      return;
    }
    if (
      connection.phase === "online" &&
      lastSseEventAt &&
      Date.now() - lastSseEventAt > 120_000
    ) {
      markRunInterrupted(
        "O OpenCode parou de responder durante a execução. A resposta pode estar incompleta.",
      );
      startSse(false);
    }
    return;
  }
  healthTick += 1;
  if (healthTick % 2 !== 0 || probeInFlight) return;
  probeInFlight = true;
  try {
    await client.probe();
    if (connection.phase === "offline") startSse(false);
  } catch (error) {
    setConnection({
      phase: "offline",
      failure: classifyFailure(error),
      detail: errorMessage(error),
    });
    startSse(false);
  } finally {
    probeInFlight = false;
  }
}

chrome.commands.onCommand.addListener((command) => {
  if (command !== "toggle-side-panel") return;
  void chrome.windows.getLastFocused().then((window) => {
    if (window.id !== undefined)
      void chrome.sidePanel
        .open({ windowId: window.id })
        .catch(() => undefined);
  });
});

chrome.runtime.onStartup.addListener(() => {
  void ensureOffscreen();
  relay.connect();
});

chrome.runtime.onInstalled.addListener(() => {
  void ensureOffscreen();
  relay.connect();
  void updateBadge();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if ("permissions.allow" in changes || "permissions.deny" in changes) {
    void permissions.init();
  }
});

async function init(): Promise<void> {
  await permissions.init();
  await tabs.cleanup().catch(() => undefined);
  config = await getConfig();
  if (config) {
    client = new OpencodeClient(config.baseUrl, config.token, config.directory);
    setConnection({
      phase: "connecting",
      failure: null,
      detail: null,
      attempts: 0,
    });
    try {
      await refreshModels();
      await refreshAgents().catch(() => undefined);
      await refreshCommands().catch(() => undefined);
      await refreshSessions().catch(() => undefined);
      const stored = await chrome.storage.local.get(ACTIVE_SESSION_KEY);
      const wanted =
        typeof stored[ACTIVE_SESSION_KEY] === "string"
          ? stored[ACTIVE_SESSION_KEY]
          : null;
      const initial =
        sessions.find((session) => session.id === wanted)?.id ??
        sessions[0]?.id ??
        null;
      if (initial) await selectSession(initial);
    } catch (error) {
      setConnection({
        phase: "offline",
        failure: classifyFailure(error),
        detail: errorMessage(error),
      });
    }
    startSse();
  } else {
    connection = freshConnection("unconfigured");
  }
  relay.connect();
  await updateBadge();
  await chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => undefined);
  chrome.alarms.create("keepalive", { periodInMinutes: 0.5 });
  await ensureOffscreen();
  broadcastNow();
}

void init();
