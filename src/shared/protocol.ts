import type {
  AppSnapshot,
  ImagePayload,
  ModelInfo,
  ModelRef,
  OpencodeConfig,
  PermissionDecision,
  PermissionRequest,
  RelayState,
  SessionInfo,
} from "./types"

export const RELAY_PORT = 8799
export const RELAY_URL = `ws://127.0.0.1:${RELAY_PORT}`
export const RELAY_PROTOCOL = 1

/** Plugin -> extension */
export type RelayInbound =
  | {
      type: "tool_request"
      id: string
      tool: string
      args: Record<string, unknown>
      sessionID?: string
      permissionMode?: string
    }
  | { type: "cancel"; id: string }
  | { type: "ping" }

/** Extension -> plugin */
export type RelayOutbound =
  | { type: "hello"; v: number; extensionId: string }
  | {
      type: "tool_result"
      id: string
      ok: boolean
      content?: string
      images?: ImagePayload[]
      error?: string
      metadata?: Record<string, unknown>
    }
  | { type: "progress"; id: string; phase: string; detail?: string }
  | { type: "pong" }

export type UiRequest =
  | { type: "state:get" }
  | { type: "pair"; link: string }
  | { type: "unpair" }
  | { type: "models:refresh" }
  | { type: "sessions:list" }
  | { type: "session:new"; model?: ModelRef; agent?: string }
  | { type: "session:select"; id: string }
  | { type: "session:delete"; id: string }
  | { type: "session:model"; model: ModelRef }
  | { type: "session:agent"; agent: string }
  | { type: "tabs:attach-current" }
  | { type: "prompt"; text: string }
  | { type: "interrupt" }
  | { type: "settings:update"; patch: Partial<OpencodeConfig> }
  | { type: "open:options" }
  | { type: "open:sidepanel" }
  | { type: "permission:respond"; requestId: string; decision: PermissionDecision }
  | { type: "relay:reconnect" }

export type UiResponse =
  | { ok: true; snapshot?: AppSnapshot; models?: ModelInfo[]; sessions?: SessionInfo[] }
  | { ok: false; error: string }

/** Broadcast from service worker to extension pages. */
export type UiEvent =
  | { type: "event"; event: OpencodeEvent }
  | { type: "snapshot"; snapshot: AppSnapshot }
  | { type: "relay"; relay: RelayState }
  | { type: "permission"; request: PermissionRequest }
  | { type: "permission:resolved"; requestId: string }

export interface OpencodeEvent {
  id?: string
  type: string
  data?: Record<string, unknown>
  location?: { directory?: string }
}

export const PORT_NAME = "opencode-browser-ui"
