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
import { SessionStates, type SessionState } from "./sessionState";
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
import { sessionLabel } from "../shared/sessionLabel";
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
const toolAborts = new Map<
  string,
  { sessionID: string; controller: AbortController }
>();
const toolNames = new Map<string, string>();
const toolImages = new Map<string, ImagePayload[]>();

let config: OpencodeConfig | null = null;
let client: OpencodeClient | null = null;
let models: ModelInfo[] = [];
let sessions: SessionInfo[] = [];
let activeSessionID: string | null = null;
const sessionStates = new SessionStates(4, (id) => id === activeSessionID);
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
let workspaceHint: string | null = null;
/**
 * O relay só pode conectar depois que a configuração está hidratada. No boot
 * do navegador o `ready` do plugin pode chegar antes do `getConfig()`; sem esse
 * sinal, o workspace anunciava a pasta mas era descartado e a lista mostrava as
 * sessões de todos os projetos até o próximo reload da extensão.
 */
let markConfigHydrated!: () => void;
const configHydrated = new Promise<void>((resolve) => {
  markConfigHydrated = resolve;
});
let sseAbort: AbortController | null = null;
let broadcastTimer: ReturnType<typeof setTimeout> | null = null;
let metaTimer: ReturnType<typeof setTimeout> | null = null;
let followTimer: ReturnType<typeof setTimeout> | null = null;
let followTabID: number | null = null;
let followGeneration = 0;
let probeInFlight = false;
let healthTick = 0;
let syncInFlight = false;
let syncPending = false;
let lastSseEventAt = 0;
let connectStartedAt = 0;
let refreshSessionTimer: ReturnType<typeof setTimeout> | null = null;

function playSound(): void {
  if (config?.soundEnabled === false) return;
  void chrome.runtime
    .sendMessage({ type: "PLAY_NOTIFICATION" })
    .catch(() => undefined);
}

const permissions = new Permissions(
  () => config?.permissionMode ?? "allow",
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
    toolAborts.get(id)?.controller.abort();
  },
  onReady: (info) => {
    void applyWorkspace(info.workspace);
  },
  onState: (state) => {
    relayState = state;
    broadcast({ type: "relay", relay: state });
  },
});

function stateOf(sessionID: string): SessionState {
  return sessionStates.get(sessionID);
}

function snapshot(): AppSnapshot {
  const state = activeSessionID
    ? sessionStates.peek(activeSessionID)
    : undefined;
  return {
    config,
    models,
    sessions,
    activeSessionID,
    messages: state?.messages ?? [],
    forms: state?.forms ?? [],
    sessionMeta: sessionStates.meta(),
    relay: relayState,
    busy: state?.busy ?? false,
    connection,
    contextUsage: state?.contextUsage,
    defaultModel,
    agents,
    commands,
    statusMessage: state?.statusMessage ?? null,
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

function broadcastMeta(): void {
  broadcast({ type: "sessions:meta", items: sessionStates.meta() });
}

function scheduleMeta(): void {
  if (metaTimer) return;
  metaTimer = setTimeout(() => {
    metaTimer = null;
    broadcastMeta();
  }, 100);
}

/**
 * Avisa a UI só do que mudou: a sessão exibida recebe o snapshot completo; uma
 * conversa em segundo plano atualiza apenas ocupado/não lido.
 */
function notifySession(sessionID: string | null): void {
  if (!sessionID || sessionID === activeSessionID) scheduleBroadcast();
  else scheduleMeta();
}

function markUnread(sessionID: string): void {
  const state = sessionStates.peek(sessionID);
  if (!state || state.unread) return;
  state.unread = true;
  void updateBadge();
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
  for (const sessionID of sessionStates.ids()) {
    const state = sessionStates.peek(sessionID);
    if (!state) continue;
    state.busy = false;
    state.statusMessage = null;
    for (const message of state.messages) {
      if (message.kind === "assistant") message.streaming = false;
    }
  }
}

function markRunInterrupted(state: SessionState, sessionID: string): void {
  state.busy = false;
  state.statusMessage = null;
  for (const item of state.messages) {
    if (item.kind === "assistant") item.streaming = false;
  }
  let message = [...state.messages]
    .reverse()
    .find((item) => item.kind === "assistant");
  if (!message || message.kind !== "assistant") {
    message = ensureAssistant(state, `interrupted_${crypto.randomUUID()}`);
  }
  if (message.kind !== "assistant") return;
  message.error =
    "A conexão com o OpenCode caiu durante a execução. A resposta pode estar incompleta.";
  message.streaming = false;
  notifySession(sessionID);
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
    case "session:new": {
      const session = await createSession(request.model, request.agent);
      const groupCreated =
        config?.autoGroupNewSessions === true
          ? await ensureSessionGroup(session, request.windowId)
          : false;
      return { ok: true, snapshot: snapshot(), groupCreated };
    }
    case "session:select":
      await selectSession(request.id);
      return { ok: true, snapshot: snapshot() };
    case "session:delete":
      await deleteSession(request.id);
      return { ok: true, snapshot: snapshot() };
    case "session:model":
      await switchModel(request.model, request.sessionID);
      return { ok: true, snapshot: snapshot() };
    case "session:agent":
      await switchAgent(request.agent, request.sessionID);
      return { ok: true, snapshot: snapshot() };
    case "tabs:attach-current": {
      const [tab] = await chrome.tabs.query({
        active: true,
        lastFocusedWindow: true,
      });
      if (!tab?.id) throw new Error("Nenhuma aba ativa encontrada.");
      const sessionID =
        request.sessionID ?? activeSessionID ?? "default";
      // Falha rápido antes de pedir aprovação (ver ADR 0009: anexar aba de
      // outra janela é recusado).
      await tabs.assertAttachable(sessionID, tab.id);
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
      await tabs.addTab(sessionID, tab.id, { makeMain: true, activate: true });
      return { ok: true, snapshot: snapshot() };
    }
    case "tabs:list":
      return { ok: true, tabs: await tabs.list(request.sessionID) };
    case "tabs:detach":
      await tabs.detachTab(request.sessionID, request.tabID);
      return { ok: true, tabs: await tabs.list(request.sessionID) };
    case "prompt":
      await sendPrompt(request.text, request.sessionID);
      return { ok: true, snapshot: snapshot() };
    case "command":
      await runCommand(request.name, request.text, request.sessionID);
      return { ok: true, snapshot: snapshot() };
    case "interrupt":
      await interrupt(request.sessionID);
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
      connectRelay(true);
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
  // Sem configuração o workspace fica no hint e é adotado pelo `init()` (ou
  // pelo `pair()`, quando a extensão ainda não está pareada).
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

/**
 * Conecta o relay depois da hidratação da configuração, para o `ready` do
 * plugin nunca chegar com `config` ainda nulo. Idempotente no cliente.
 */
function connectRelay(force = false): void {
  void configHydrated.then(() => {
    if (force) {
      relay.reconnect();
      return;
    }
    void relay.connect();
  });
}

/**
 * Adota a pasta anunciada pelo plugin quando a configuração ainda não tem uma.
 * O gate `configHydrated` garante que o `ready` normalmente chegue depois do
 * `getConfig()` (caminho do `applyWorkspace`); esta função é a rede de
 * segurança para qualquer conexão fora do gate — sem ela o workspace viraria
 * só um hint em memória e a lista cairia nas sessões de todos os projetos.
 */
async function adoptWorkspaceHint(): Promise<void> {
  if (!config || config.directory || !workspaceHint) return;
  config = { ...config, directory: workspaceHint };
  await setConfig(config).catch(() => undefined);
}

async function pair(link: string): Promise<void> {
  const previous = config;
  const { baseUrl, token } = await OpencodeClient.pair(link);
  config = {
    baseUrl,
    token,
    directory: previous?.directory ?? workspaceHint ?? undefined,
    defaultModel: previous?.defaultModel,
    permissionMode: previous?.permissionMode ?? "allow",
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
  sessionStates.clear();
  connection = freshConnection("unconfigured");
  defaultModel = null;
  agents = [];
  commands = [];
  syncPending = false;
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
      if (activeSessionID) await refreshUsage(activeSessionID);
    })();
  }, 400);
}

/** Contexto da última requisição de uma sessão (não é o total acumulado). */
async function refreshUsage(sessionID: string): Promise<void> {
  if (!client) return;
  const usage = await client
    .lastAssistantUsage(sessionID)
    .catch(() => undefined);
  const state = sessionStates.peek(sessionID);
  if (!state) return;
  state.contextUsage = usage;
  notifySession(sessionID);
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
  sessionStates.retain(sessions.map((session) => session.id));
  let lostActive = false;
  if (
    activeSessionID &&
    !sessions.some((session) => session.id === activeSessionID)
  ) {
    activeSessionID = null;
    lostActive = true;
  }
  broadcastNow();
  if (lostActive && sessions[0]) await selectSession(sessions[0].id);
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

async function createSession(
  model?: ModelRef,
  agent?: string,
): Promise<SessionInfo> {
  if (!client) throw new Error("OpenCode não configurado.");
  cancelPendingFollow();
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
  const state = stateOf(session.id);
  state.messages = [];
  state.forms = [];
  state.busy = false;
  state.statusMessage = null;
  state.contextUsage = undefined;
  state.unread = false;
  state.hydrated = true;
  await chrome.storage.local.set({ [ACTIVE_SESSION_KEY]: session.id });
  broadcastNow();
  return session;
}

/**
 * Cria e rotula o grupo de abas de uma sessão. Best-effort: a conversa continua
 * válida quando o grupo não pode ser aberto agora.
 */
async function ensureSessionGroup(
  session: SessionInfo,
  windowId?: number,
): Promise<boolean> {
  try {
    const label = sessionLabel(session);
    await tabs.ensure(session.id, label, windowId);
    return true;
  } catch {
    return false;
  }
}

/** Uma troca de aba pendente não pode reverter a conversa recém-criada. */
function cancelPendingFollow(): void {
  followGeneration += 1;
  if (followTimer) {
    clearTimeout(followTimer);
    followTimer = null;
  }
  followTabID = null;
}

/**
 * Troca a conversa exibida sem descartar o estado das demais: execuções em
 * segundo plano continuam chegando pelo SSE e ficam no cache da sessão.
 */
async function selectSession(id: string): Promise<void> {
  if (!sessions.some((session) => session.id === id)) return;
  cancelPendingFollow();
  activeSessionID = id;
  const state = sessionStates.get(id);
  state.unread = false;
  await chrome.storage.local.set({ [ACTIVE_SESSION_KEY]: id });
  void updateBadge();
  broadcastNow();
  if (!state.hydrated) void hydrate(id);
  void loadForms(id);
  void refreshUsage(id);
  const session = sessions.find((item) => item.id === id);
  if (session) void tabs.setLabel(id, sessionLabel(session));
}

async function loadForms(id: string): Promise<void> {
  if (!client) return;
  const state = sessionStates.peek(id);
  if (!state) return;
  const known = new Set(state.forms.map((form) => form.id));
  try {
    const pending = await client.listForms(id);
    if (sessionStates.peek(id) !== state) return;
    // Preserva forms criados por SSE enquanto a listagem estava em voo.
    const arrived = state.forms.filter((form) => !known.has(form.id));
    const missing = arrived.filter(
      (form) => !pending.some((item) => item.id === form.id),
    );
    state.forms = [...pending, ...missing];
    notifySession(id);
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
  removeForm(sessionID, formID);
  notifySession(sessionID);
}

async function cancelForm(
  sessionID: string,
  formID: string,
  message?: string,
): Promise<void> {
  if (!client) throw new Error("OpenCode não configurado.");
  await client.cancelForm(sessionID, formID, message);
  removeForm(sessionID, formID);
  notifySession(sessionID);
}

function removeForm(sessionID: string, formID: string): void {
  const state = sessionStates.peek(sessionID);
  if (!state) return;
  state.forms = state.forms.filter((form) => form.id !== formID);
}

async function hydrate(id: string): Promise<void> {
  if (!client) return;
  const state = sessionStates.peek(id);
  if (!state) return;
  const token = ++state.hydrateToken;
  const startedAt = Date.now();
  try {
    const raw = await client.context(id);
    if (token !== state.hydrateToken || sessionStates.peek(id) !== state) return;
    if (state.busy) return;
    // Um evento ao vivo chegou durante a leitura: ele é mais novo que o
    // snapshot e sobrescrever aqui apagaria texto/erro recém-recebidos.
    if (state.lastEventAt > startedAt) return;
    state.messages = mapContext(raw);
    state.busy = state.messages.some(
      (message) => message.kind === "assistant" && message.streaming,
    );
    state.hydrated = true;
    notifySession(id);
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
  forgetSession(id);
  if (activeSessionID === id) {
    activeSessionID = sessions[0]?.id ?? null;
    if (activeSessionID) await selectSession(activeSessionID);
    else await chrome.storage.local.remove(ACTIVE_SESSION_KEY);
  }
  void updateBadge();
  broadcastNow();
}

/** Esquece tudo que pertencia a uma sessão removida. */
function forgetSession(sessionID: string): void {
  sessionStates.delete(sessionID);
  permissions.forget(sessionID);
  for (const [id, entry] of [...toolAborts.entries()]) {
    if (entry.sessionID !== sessionID) continue;
    entry.controller.abort();
    toolAborts.delete(id);
  }
  void tabs.release(sessionID);
}

async function switchModel(
  model: ModelRef,
  sessionID?: string,
): Promise<void> {
  const target = sessionID ?? activeSessionID;
  if (!client || !target) throw new Error("Nenhuma sessão ativa.");
  await client.switchModel(target, model);
  const session = sessions.find((item) => item.id === target);
  if (session) session.model = model;
  notifySession(target);
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
function handleSendFailure(
  state: SessionState,
  sessionID: string,
  optimisticID: string,
  error: unknown,
): void {
  state.busy = false;
  const failure = classifyFailure(error);
  if (isConnectionFailure(failure)) {
    state.messages = state.messages.filter(
      (message) => message.id !== optimisticID,
    );
    setConnection({
      phase: "offline",
      failure,
      detail: errorMessage(error),
    });
    notifySession(sessionID);
    throw error;
  }
  state.messages.push({
    kind: "assistant",
    id: `local_error_${crypto.randomUUID()}`,
    text: "",
    reasoning: "",
    tools: [],
    time: Date.now(),
    streaming: false,
    error: errorMessage(error),
  });
  notifySession(sessionID);
}

/** Sessão alvo de um pedido da UI, criando a primeira quando não há nenhuma. */
async function targetSession(sessionID?: string): Promise<string> {
  if (sessionID) {
    if (!sessions.some((session) => session.id === sessionID)) {
      throw new Error("Sessão não encontrada.");
    }
    return sessionID;
  }
  if (!activeSessionID) await createSession();
  if (!activeSessionID) throw new Error("Não foi possível criar a sessão.");
  return activeSessionID;
}

async function runCommand(
  name: string,
  text: string,
  sessionID?: string,
): Promise<void> {
  if (!client) throw new Error("OpenCode não configurado.");
  const target = await targetSession(sessionID);
  const state = stateOf(target);
  const optimisticID = `local_${crypto.randomUUID()}`;
  state.messages.push({
    kind: "user",
    id: optimisticID,
    text: `/${name}${text ? ` ${text}` : ""}`,
    time: Date.now(),
  });
  state.busy = true;
  state.statusMessage = null;
  notifySession(target);
  try {
    await client.runCommand(target, name, text);
  } catch (error) {
    handleSendFailure(state, target, optimisticID, error);
  }
}

async function switchAgent(agent: string, sessionID?: string): Promise<void> {
  if (!client) throw new Error("OpenCode não configurado.");
  const target = sessionID ?? activeSessionID;
  if (target) {
    await client.switchAgent(target, agent);
    const session = sessions.find((item) => item.id === target);
    if (session) session.agent = agent;
    notifySession(target);
    return;
  }
  config = { ...config!, defaultAgent: agent };
  await setConfig(config);
  broadcastNow();
}

async function sendPrompt(text: string, sessionID?: string): Promise<void> {
  if (!client) throw new Error("OpenCode não configurado.");
  const trimmed = text.trim();
  if (!trimmed) return;
  const target = await targetSession(sessionID);
  const state = stateOf(target);
  const optimisticID = `local_${crypto.randomUUID()}`;
  state.messages.push({
    kind: "user",
    id: optimisticID,
    text: trimmed,
    time: Date.now(),
  });
  state.busy = true;
  state.statusMessage = null;
  notifySession(target);
  try {
    await client.prompt(target, trimmed);
  } catch (error) {
    handleSendFailure(state, target, optimisticID, error);
  }
}

/**
 * Interrompe uma sessão específica. Sem `sessionID`, age na sessão exibida;
 * `null` interrompe todas as que estão executando (usado quando a aba de
 * origem não pertence a nenhum grupo).
 */
async function interrupt(sessionID?: string | null): Promise<void> {
  const stopAll = sessionID === null;
  const targets = stopAll
    ? sessionStates
        .ids()
        .filter((id) => sessionStates.peek(id)?.busy)
    : [sessionID ?? activeSessionID].filter((id): id is string => !!id);
  for (const [id, entry] of [...toolAborts.entries()]) {
    if (!stopAll && !targets.includes(entry.sessionID)) continue;
    entry.controller.abort();
    toolAborts.delete(id);
  }
  for (const target of targets) {
    if (client) {
      await client.interrupt(target).catch(() => undefined);
    }
    const state = sessionStates.peek(target);
    if (!state) continue;
    state.busy = false;
    state.statusMessage = null;
    for (const message of state.messages) {
      if (message.kind === "assistant") message.streaming = false;
    }
    notifySession(target);
  }
  if (stopAll) {
    resetStreaming();
    broadcastNow();
  }
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

function describeSession(sessionID: string | null): string {
  return sessions.find((item) => item.id === sessionID)?.title ?? "Tarefa";
}

/** Notifica quando o painel está fechado ou quando a sessão não é a exibida. */
function shouldNotify(sessionID: string | null): boolean {
  return ports.size === 0 || sessionID !== activeSessionID;
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
    // O evento pode não repetir a sessão no topo; o form é a fonte confiável.
    const formSessionID =
      typeof form?.sessionID === "string" ? form.sessionID : sessionID;
    if (!form?.id || !formSessionID) return;
    const formState = stateOf(formSessionID);
    if (formState.forms.some((item) => item.id === form.id)) return;
    formState.forms = [...formState.forms, form];
    if (formSessionID !== activeSessionID) markUnread(formSessionID);
    playSound();
    if (shouldNotify(formSessionID) && config?.notifyEnabled !== false) {
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
    notifySession(formSessionID);
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
    if (!formID) return;
    for (const id of sessionStates.ids()) {
      const candidate = sessionStates.peek(id);
      if (!candidate?.forms.some((form) => form.id === formID)) continue;
      candidate.forms = candidate.forms.filter((form) => form.id !== formID);
      notifySession(id);
    }
    return;
  }

  if (event.type === "session.deleted" && sessionID) {
    const known = sessions.some((session) => session.id === sessionID);
    const wasActive = activeSessionID === sessionID;
    sessions = sessions.filter((session) => session.id !== sessionID);
    forgetSession(sessionID);
    if (wasActive) {
      activeSessionID = sessions[0]?.id ?? null;
      if (activeSessionID) void selectSession(activeSessionID);
      else void chrome.storage.local.remove(ACTIVE_SESSION_KEY);
    }
    void updateBadge();
    if (known || wasActive) scheduleBroadcast();
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
      void tabs.setLabel(sessionID, data.title);
      scheduleBroadcast();
    }
  }

  if (!sessionID) return;
  // Sessão excluída (ou filtrada por outro diretório): não recria estado
  // fantasma a partir de eventos atrasados.
  if (!sessions.some((session) => session.id === sessionID)) return;
  const state = stateOf(sessionID);
  state.lastEventAt = Date.now();

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
        ensureAssistant(state, assistantID).usage = usage;
        notifySession(sessionID);
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
        ? ensureAssistant(state, assistantID)
        : [...state.messages]
            .reverse()
            .find(
              (message) => message.kind === "assistant" && message.streaming,
            );
      if (usage && target?.kind === "assistant") {
        target.usage = usage;
        notifySession(sessionID);
      }
      break;
    }
    case "session.step.started":
    case "session.execution.started":
      state.busy = true;
      state.statusMessage = null;
      notifySession(sessionID);
      break;
    case "session.text.started":
      if (assistantID) ensureAssistant(state, assistantID).streaming = true;
      notifySession(sessionID);
      break;
    case "session.text.delta": {
      if (!assistantID || typeof data.delta !== "string") break;
      const message = ensureAssistant(state, assistantID);
      message.text += data.delta;
      message.streaming = true;
      state.statusMessage = null;
      notifySession(sessionID);
      break;
    }
    case "session.text.ended": {
      if (!assistantID) break;
      const message = ensureAssistant(state, assistantID);
      if (typeof data.text === "string") {
        message.text =
          message.text && !data.text.startsWith(message.text)
            ? `${message.text}\n\n${data.text}`
            : data.text;
      }
      // O texto deste passo acabou; o run pode continuar em outro passo.
      message.streaming = false;
      notifySession(sessionID);
      break;
    }
    case "session.reasoning.delta": {
      if (!assistantID || typeof data.delta !== "string") break;
      const message = ensureAssistant(state, assistantID);
      message.reasoning += data.delta;
      notifySession(sessionID);
      break;
    }
    case "session.reasoning.ended": {
      if (!assistantID) break;
      const message = ensureAssistant(state, assistantID);
      if (typeof data.text === "string") message.reasoning = data.text;
      notifySession(sessionID);
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
      const message = ensureAssistant(state, assistantID);
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
      notifySession(sessionID);
      break;
    }
    case "session.tool.progress": {
      if (typeof data.id !== "string") break;
      const tool = findTool(state, data.id);
      if (tool) {
        tool.metadata = data.metadata as Record<string, unknown>;
        notifySession(sessionID);
      }
      break;
    }
    case "session.tool.success": {
      if (typeof data.id !== "string") break;
      const tool = ensureTool(state, data.id, assistantID);
      if (tool) {
        tool.status = "ok";
        tool.output = contentText(data.content);
        tool.metadata = data.metadata as Record<string, unknown>;
        tool.images = toolImages.get(data.id) ?? tool.images;
        tool.finishedAt = Date.now();
        notifySession(sessionID);
      }
      break;
    }
    case "session.tool.failed": {
      if (typeof data.id !== "string") break;
      const tool = ensureTool(state, data.id, assistantID);
      if (tool) {
        tool.status = "error";
        tool.output =
          formatOpencodeError(data.error) || contentText(data.content);
        tool.finishedAt = Date.now();
        notifySession(sessionID);
      }
      break;
    }
    case "session.retry.scheduled": {
      state.busy = true;
      const attempt =
        typeof data.attempt === "number" ? data.attempt : undefined;
      const reason =
        typeof data.message === "string" ? data.message : "erro temporário";
      state.statusMessage = `Tentando novamente${attempt ? ` (tentativa ${attempt})` : ""}: ${reason}`;
      notifySession(sessionID);
      break;
    }
    case "session.execution.succeeded":
      state.busy = false;
      state.statusMessage = null;
      for (const message of state.messages) {
        if (message.kind === "assistant") message.streaming = false;
      }
      refreshSessionUsage();
      if (sessionID !== activeSessionID) markUnread(sessionID);
      if (shouldNotify(sessionID)) {
        playSound();
        if (config?.notifyEnabled !== false) {
          const title = describeSession(sessionID);
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
      notifySession(sessionID);
      break;
    case "session.execution.failed":
      markSessionError(state, sessionID, data.error ?? data.message);
      break;
    case "session.step.ended":
      if (data.finish !== "tool-calls") state.busy = false;
      // O passo terminou; nenhuma mensagem dele continua "streaming", mesmo
      // quando o run segue para as ferramentas ou para o próximo passo.
      for (const message of state.messages) {
        if (message.kind === "assistant") message.streaming = false;
      }
      notifySession(sessionID);
      break;
    case "session.status": {
      const status = data.status as { type?: string } | undefined;
      if (status?.type === "idle") {
        state.busy = false;
        for (const message of state.messages) {
          if (message.kind === "assistant") message.streaming = false;
        }
        refreshSessionUsage();
        notifySession(sessionID);
      }
      break;
    }
    case "session.error": {
      markSessionError(state, sessionID, data.error);
      break;
    }
  }
}

function markSessionError(
  state: SessionState,
  sessionID: string,
  error: unknown,
): void {
  state.busy = false;
  state.statusMessage = null;
  refreshSessionUsage();
  for (const item of state.messages) {
    if (item.kind === "assistant") item.streaming = false;
  }
  let message = [...state.messages]
    .reverse()
    .find((item) => item.kind === "assistant");
  if (!message || message.kind !== "assistant") {
    message = ensureAssistant(state, `error_${crypto.randomUUID()}`);
  }
  if (message.kind !== "assistant") return;
  const detail = formatOpencodeError(error);
  if (detail) message.error = detail;
  else if (!message.error) {
    message.error = "A execução falhou no OpenCode sem detalhes adicionais.";
  }
  message.streaming = false;
  if (sessionID !== activeSessionID) markUnread(sessionID);
  notifySession(sessionID);
}

function ensureAssistant(
  state: SessionState,
  id: string,
): Extract<ChatMessage, { kind: "assistant" }> {
  const existing = state.messages.find(
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
  for (const message of state.messages) {
    if (message.kind === "assistant") message.streaming = false;
  }
  state.messages.push(created);
  return created;
}

function findTool(state: SessionState, id: string): ToolCallView | undefined {
  for (const message of state.messages) {
    if (message.kind !== "assistant") continue;
    const tool = message.tools.find((item) => item.id === id);
    if (tool) return tool;
  }
  return undefined;
}

function ensureTool(
  state: SessionState,
  id: string,
  assistantID?: string,
): ToolCallView | undefined {
  const existing = findTool(state, id);
  if (existing) return existing;
  const message = assistantID
    ? ensureAssistant(state, assistantID)
    : [...state.messages].reverse().find((item) => item.kind === "assistant");
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
  toolAborts.set(request.id, { sessionID, controller });
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
      const session = sessions.find((item) => item.id === sessionID);
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
      const state = sessionStates.peek(sessionID);
      const tool = state ? findTool(state, request.id) : undefined;
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
    notifySession(sessionID);
  } catch (error) {
    const message = errorMessage(error);
    relay.send({
      type: "tool_result",
      id: request.id,
      ok: false,
      error: message,
    });
    const state = sessionStates.peek(sessionID);
    const tool = state ? findTool(state, request.id) : undefined;
    if (tool) {
      tool.status = "error";
      tool.output = message;
      notifySession(sessionID);
    }
  } finally {
    toolAborts.delete(request.id);
  }
}

function handleStop(sender: chrome.runtime.MessageSender): void {
  if (sender.tab?.id !== undefined) {
    void chrome.tabs
      .sendMessage(sender.tab.id, { type: "indicator:hide" })
      .catch(() => undefined);
  }
  void (async () => {
    const tabID = sender.tab?.id;
    // A sessão vem do grupo da aba que pediu o stop; sem grupo, para tudo.
    const sessionID =
      tabID !== undefined
        ? await tabs.sessionOfTab(tabID).catch(() => null)
        : null;
    await interrupt(sessionID);
    broadcastNow();
  })();
}

async function updateBadge(): Promise<void> {
  try {
    if (!config) {
      await chrome.action.setBadgeText({ text: "!" });
      await chrome.action.setTitle({
        title: "OpenCode Browser: configure o pareamento",
      });
    } else {
      const unread = sessionStates
        .meta()
        .filter((item) => item.unread).length;
      await chrome.action.setBadgeText({
        text: unread ? String(Math.min(unread, 9)) : "",
      });
      await chrome.action.setTitle({
        title: unread
          ? `OpenCode Browser: ${unread} conversa${unread > 1 ? "s" : ""} com novidade`
          : "OpenCode Browser",
      });
    }
  } catch {
    // ignore
  }
}

/**
 * Segue o grupo de abas em foco: a conversa exibida passa a ser a da sessão
 * dona do grupo. Só reage a abas já agrupadas registradas na extensão.
 */
function scheduleFollow(tabID: number | undefined): void {
  if (tabID === undefined || config?.followTabGroups === false) return;
  followTabID = tabID;
  if (followTimer) clearTimeout(followTimer);
  followTimer = setTimeout(() => {
    followTimer = null;
    const target = followTabID;
    followTabID = null;
    if (target !== null) void followTab(target);
  }, 150);
}

async function followTab(tabID: number): Promise<void> {
  const generation = followGeneration;
  const tab = await chrome.tabs.get(tabID).catch(() => undefined);
  if (!tab?.active) return;
  const sessionID = await tabs.sessionOfTab(tabID).catch(() => null);
  // Uma criação/seleção aconteceu enquanto resolvíamos a aba: não reverter.
  if (generation !== followGeneration) return;
  if (!sessionID || sessionID === activeSessionID) return;
  if (!sessions.some((session) => session.id === sessionID)) return;
  await selectSession(sessionID);
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
    // Painel (re)conectado: a lista de pendentes é a fonte autoritativa.
    port.postMessage({
      type: "permission:sync",
      requests: permissions.pendingRequests(),
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
  connectRelay();
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
  if (sessionStates.anyBusy()) {
    if (
      connection.phase === "offline" &&
      connection.offlineSince &&
      Date.now() - connection.offlineSince > 5_000
    ) {
      for (const sessionID of sessionStates.ids()) {
        const state = sessionStates.peek(sessionID);
        if (state?.busy) markRunInterrupted(state, sessionID);
      }
      return;
    }
    if (
      connection.phase === "online" &&
      lastSseEventAt &&
      Date.now() - lastSseEventAt > 120_000
    ) {
      for (const sessionID of sessionStates.ids()) {
        const state = sessionStates.peek(sessionID);
        if (state?.busy) markRunInterrupted(state, sessionID);
      }
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

chrome.tabs.onActivated.addListener((info) => {
  scheduleFollow(info.tabId);
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  void chrome.tabs
    .query({ active: true, windowId })
    .then(([tab]) => scheduleFollow(tab?.id))
    .catch(() => undefined);
});

chrome.runtime.onStartup.addListener(() => {
  void ensureOffscreen();
  connectRelay();
});

chrome.runtime.onInstalled.addListener(() => {
  void ensureOffscreen();
  connectRelay();
  void updateBadge();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if ("permissions.allow" in changes || "permissions.deny" in changes) {
    void permissions.init();
  }
});

async function init(): Promise<void> {
  try {
    await permissions.init();
    // A limpeza mexe em abas: nunca durante uma execução do agente.
    if (!sessionStates.anyBusy() && toolAborts.size === 0) {
      await tabs.cleanup().catch(() => undefined);
    }
    config = await getConfig();
    await adoptWorkspaceHint();
  } finally {
    // Sempre libera o relay, inclusive sem configuração ou em falha de leitura:
    // prender a conexão deixaria o painel sem as tools `browser_*`.
    markConfigHydrated();
    connectRelay();
  }
  if (config) {
    client = new OpencodeClient(config.baseUrl, config.token, config.directory);
    // Salvaguarda: com o relay já conectado (conexão fora do gate), o `ready`
    // não é reemitido, então o agente do navegador não seria instalado pelo
    // `applyWorkspace`.
    ensureBrowserAgentInBackground();
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
  await updateBadge();
  await chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => undefined);
  chrome.alarms.create("keepalive", { periodInMinutes: 0.5 });
  await ensureOffscreen();
  broadcastNow();
}

void init().catch(() => undefined);
