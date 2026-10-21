export type PermissionMode = "ask" | "allow" | "deny"

export interface ModelRef {
  id: string
  providerID: string
  variant?: string
}

export interface ModelInfo {
  id: string
  modelID?: string
  providerID: string
  name?: string
  family?: string
  disabled?: boolean
  capabilities?: {
    tools?: boolean
    input?: string[]
    output?: string[]
    temperature?: boolean
  }
  limit?: {
    context?: number
    output?: number
  }
  variants?: Array<{ id: string }>
  cost?: unknown
}

export interface CommandInfo {
  name: string
  description?: string
}

export interface AgentInfo {
  id: string
  name?: string
  description?: string
  mode?: string
  hidden?: boolean
}

export interface SessionInfo {
  id: string
  title?: string
  slug?: string
  model?: ModelRef
  agent?: string
  time?: { created?: number; updated?: number }
  location?: { directory?: string }
}

export interface ToolCallView {
  id: string
  name: string
  input?: unknown
  status: "running" | "ok" | "error"
  output?: string
  images?: ImagePayload[]
  metadata?: Record<string, unknown>
}

export interface ImagePayload {
  name: string
  mime: string
  data: string
}

export type ChatMessage =
  | {
      kind: "user"
      id: string
      text: string
      time: number
    }
  | {
      kind: "assistant"
      id: string
      text: string
      reasoning: string
      tools: ToolCallView[]
      time: number
      streaming: boolean
      error?: string
    }

export interface OpencodeConfig {
  baseUrl: string
  token: string
  directory?: string
  defaultModel?: ModelRef
  defaultAgent?: string
  permissionMode: PermissionMode
  permissionTimeoutMs?: number
  findMode?: "heuristic" | "model"
  soundEnabled?: boolean
  notifyEnabled?: boolean
}

export interface PermissionRequest {
  id: string
  kind: "action" | "plan" | "domain"
  tool: string
  title: string
  detail?: string
  url?: string
  host?: string
  screenshot?: string
  text?: string
  plan?: {
    domains: string[]
    approach: string[]
  }
  fromDomain?: string
  toDomain?: string
}

export type PermissionScope = "once" | "site" | "always"

export interface PermissionDecision {
  allowed: boolean
  scope?: PermissionScope
}

export interface RelayState {
  connected: boolean
  url: string
  lastError?: string
}

export interface AppSnapshot {
  config: OpencodeConfig | null
  models: ModelInfo[]
  sessions: SessionInfo[]
  activeSessionID: string | null
  messages: ChatMessage[]
  relay: RelayState
  busy: boolean
  backend: "unknown" | "online" | "offline"
  defaultModel: ModelRef | null
  agents: AgentInfo[]
  commands: CommandInfo[]
  statusMessage: string | null
}

export interface PairResult {
  ok: boolean
  error?: string
}
