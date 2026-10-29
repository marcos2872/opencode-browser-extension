import type {
  AppSnapshot,
  BrowserTabContext,
  ConnectionFailure,
  FormAnswer,
  ImagePayload,
  ModelInfo,
  ModelRef,
  OpencodeConfig,
  PermissionDecision,
  PermissionRequest,
  RelayState,
  SessionInfo,
  SessionMeta,
} from "./types";

export const RELAY_PORT = 8799;
export const RELAY_URL = `ws://127.0.0.1:${RELAY_PORT}`;
export const RELAY_PROTOCOL = 1;

/** Plugin -> extension */
export type RelayInbound =
  | {
      /** Handshake do plugin: informa o home e a pasta de conversas. */
      type: "ready";
      v?: number;
      home?: string;
      workspace?: string;
    }
  | {
      type: "tool_request";
      id: string;
      tool: string;
      args: Record<string, unknown>;
      sessionID?: string;
      permissionMode?: string;
    }
  | { type: "cancel"; id: string }
  | { type: "ping" }
  | {
      type: "ensure_agent_result";
      id: string;
      ok: boolean;
      path?: string;
      error?: string;
    };

/** Extension -> plugin */
export type RelayOutbound =
  | { type: "hello"; v: number; extensionId: string }
  | {
      type: "tool_result";
      id: string;
      ok: boolean;
      content?: string;
      images?: ImagePayload[];
      error?: string;
      metadata?: Record<string, unknown>;
    }
  | { type: "progress"; id: string; phase: string; detail?: string }
  | { type: "pong" }
  | { type: "ensure_agent"; id: string };

export type UiRequest =
  | { type: "state:get" }
  | { type: "pair"; link: string }
  | { type: "unpair" }
  | { type: "models:refresh" }
  | { type: "sessions:list" }
  | {
      type: "session:new";
      model?: ModelRef;
      agent?: string;
      /** Janela do painel: o grupo automático nasce nela, não na última focada. */
      windowId?: number;
    }
  | { type: "session:select"; id: string }
  | { type: "session:delete"; id: string }
  | { type: "session:model"; model: ModelRef; sessionID?: string }
  | { type: "session:agent"; agent: string; sessionID?: string }
  | { type: "tabs:attach-current"; sessionID?: string }
  | { type: "tabs:list"; sessionID: string }
  | { type: "tabs:detach"; sessionID: string; tabID: number }
  | { type: "prompt"; text: string; sessionID?: string }
  | { type: "command"; name: string; text: string; sessionID?: string }
  | { type: "interrupt"; sessionID?: string }
  | { type: "settings:update"; patch: Partial<OpencodeConfig> }
  | { type: "open:options" }
  | { type: "open:sidepanel" }
  | {
      type: "permission:respond";
      requestId: string;
      decision: PermissionDecision;
    }
  | {
      type: "form:respond";
      sessionID: string;
      formID: string;
      answer: FormAnswer;
    }
  | {
      type: "form:cancel";
      sessionID: string;
      formID: string;
      message?: string;
    }
  | { type: "relay:reconnect" }
  | { type: "connection:reconnect" };

export type UiResponse =
  | {
      ok: true;
      snapshot?: AppSnapshot;
      models?: ModelInfo[];
      sessions?: SessionInfo[];
      tabs?: BrowserTabContext[];
      /** `session:new`: o grupo de abas foi criado junto com a conversa. */
      groupCreated?: boolean;
    }
  | { ok: false; error: string; failure?: ConnectionFailure };

/** Broadcast from service worker to extension pages. */
export type UiEvent =
  | { type: "event"; event: OpencodeEvent }
  | { type: "snapshot"; snapshot: AppSnapshot }
  /** Atualização barata de ocupado/não lido de outras sessões. */
  | { type: "sessions:meta"; items: SessionMeta[] }
  | { type: "relay"; relay: RelayState }
  | { type: "permission"; request: PermissionRequest }
  /** Lista autoritativa de pedidos abertos, enviada ao conectar um painel. */
  | { type: "permission:sync"; requests: PermissionRequest[] }
  | { type: "permission:resolved"; requestId: string };

export interface OpencodeEvent {
  id?: string;
  type: string;
  data?: Record<string, unknown>;
  location?: { directory?: string };
}

export const PORT_NAME = "opencode-browser-ui";
