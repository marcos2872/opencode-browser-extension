export type PermissionMode = "ask" | "allow" | "deny";

export interface ModelRef {
  id: string;
  providerID: string;
  variant?: string;
}

export interface ModelInfo {
  id: string;
  modelID?: string;
  providerID: string;
  name?: string;
  family?: string;
  disabled?: boolean;
  capabilities?: {
    tools?: boolean;
    input?: string[];
    output?: string[];
    temperature?: boolean;
  };
  limit?: {
    context?: number;
    output?: number;
  };
  variants?: Array<{ id: string }>;
  cost?: unknown;
}

export interface CommandInfo {
  name: string;
  description?: string;
}

export interface AgentInfo {
  id: string;
  name?: string;
  description?: string;
  mode?: string;
  hidden?: boolean;
}

export interface SessionInfo {
  id: string;
  title?: string;
  slug?: string;
  model?: ModelRef;
  agent?: string;
  time?: { created?: number; updated?: number };
  location?: { directory?: string };
  /** Custo acumulado informado pelo OpenCode. */
  cost?: number;
  /** Uso da sessão (último request) informado pelo OpenCode. */
  tokens?: TokenUsage;
}

export interface BrowserTabContext {
  id: number;
  title: string;
  url: string;
  active: boolean;
}

export interface ToolCallView {
  id: string;
  name: string;
  input?: unknown;
  status: "running" | "ok" | "error";
  output?: string;
  images?: ImagePayload[];
  metadata?: Record<string, unknown>;
  startedAt?: number;
  finishedAt?: number;
}

export interface FormOption {
  value: string
  label: string
  description?: string
}

interface FormFieldBase {
  key: string
  title?: string
  description?: string
  required?: boolean
  hidden?: boolean
}

export interface FormStringField extends FormFieldBase {
  type: "string"
  options?: FormOption[]
  custom?: boolean
  placeholder?: string
  format?: "email" | "uri" | "date" | "date-time"
  minLength?: number
  maxLength?: number
  pattern?: string
  default?: string
}

export interface FormNumberField extends FormFieldBase {
  type: "number" | "integer"
  minimum?: number
  maximum?: number
  default?: number
}

export interface FormBooleanField extends FormFieldBase {
  type: "boolean"
  default?: boolean
}

export interface FormMultiselectField extends FormFieldBase {
  type: "multiselect"
  options: FormOption[]
  custom?: boolean
  minItems?: number
  maxItems?: number
  default?: string[]
}

export interface FormExternalField extends FormFieldBase {
  type: "external"
  url: string
}

export type FormField =
  | FormStringField
  | FormNumberField
  | FormBooleanField
  | FormMultiselectField
  | FormExternalField

export type FormValue = string | number | boolean | string[]

export type FormAnswer = Record<string, FormValue>

/**
 * Formulário pendente criado pelo OpenCode (perguntas interativas e
 * elicitation de MCP). A tool `question` vira um form com a chave `q0`, `q1`, …
 */
export interface FormInfo {
  id: string
  sessionID: string
  title: string
  metadata?: Record<string, unknown>
  fields: FormField[]
}

export interface TokenUsage {
  total?: number;
  input?: number;
  output?: number;
  reasoning?: number;
  cacheRead?: number;
  cacheWrite?: number;
  cache?: { read?: number; write?: number };
  cost?: number;
}

export interface ImagePayload {
  name: string;
  mime: string;
  data: string;
}

export type ChatMessage =
  | {
      kind: "user";
      id: string;
      text: string;
      time: number;
    }
  | {
      kind: "assistant";
      id: string;
      text: string;
      reasoning: string;
      tools: ToolCallView[];
      time: number;
      streaming: boolean;
      error?: string;
      usage?: TokenUsage;
    };

export interface OpencodeConfig {
  baseUrl: string;
  token: string;
  directory?: string;
  defaultModel?: ModelRef;
  defaultAgent?: string;
  permissionMode: PermissionMode;
  permissionTimeoutMs?: number;
  findMode?: "heuristic" | "model";
  soundEnabled?: boolean;
  notifyEnabled?: boolean;
  /** Como as tools aparecem no chat. Padrão: agrupadas em um modal. */
  toolDisplay?: "grouped" | "rows" | "full" | "hidden";
  /** Usa o agente `opencode-browser` nas novas sessões. Padrão: true. */
  browserAgentDefault?: boolean;
}

export interface PermissionRequest {
  id: string;
  kind: "action" | "plan" | "domain";
  tool: string;
  title: string;
  detail?: string;
  url?: string;
  host?: string;
  screenshot?: string;
  text?: string;
  plan?: {
    domains: string[];
    approach: string[];
  };
  fromDomain?: string;
  toDomain?: string;
}

export type PermissionScope = "once" | "site" | "always";

export interface PermissionDecision {
  allowed: boolean;
  scope?: PermissionScope;
}

/** Motivo da última queda do relay, usado para escolher a instrução na UI. */
export type RelayFailure =
  | "missing_plugin"
  | "rejected"
  | "closed"
  | "silent";

export interface RelayState {
  connected: boolean;
  url: string;
  lastError?: string;
  reason?: RelayFailure;
  /** Última mensagem recebida do plugin (prova de vida). */
  lastSeenAt?: number;
}

/** Estado do canal HTTP/SSE com o servidor do OpenCode. */
export type ConnectionPhase =
  | "unconfigured"
  | "connecting"
  | "online"
  | "offline";

export type ConnectionFailure =
  | "unreachable"
  | "timeout"
  | "unauthorized"
  | "server_error"
  | "stream_closed";

export interface ConnectionState {
  phase: ConnectionPhase;
  failure: ConnectionFailure | null;
  detail: string | null;
  attempts: number;
  lastOnlineAt: number | null;
  /** Quando a fase virou `offline`; usado para encerrar execuções órfãs. */
  offlineSince: number | null;
}

export interface AppSnapshot {
  config: OpencodeConfig | null;
  models: ModelInfo[];
  sessions: SessionInfo[];
  activeSessionID: string | null;
  messages: ChatMessage[];
  forms: FormInfo[];
  relay: RelayState;
  busy: boolean;
  connection: ConnectionState;
  /** Usage da última mensagem da sessão ativa (contexto da janela). */
  contextUsage?: TokenUsage;
  defaultModel: ModelRef | null;
  agents: AgentInfo[];
  commands: CommandInfo[];
  statusMessage: string | null;
}

export interface PairResult {
  ok: boolean;
  error?: string;
}
