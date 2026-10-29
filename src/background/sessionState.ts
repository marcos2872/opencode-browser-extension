import type {
  ChatMessage,
  FormInfo,
  SessionMeta,
  TokenUsage,
} from "../shared/types";

/**
 * Estado vivo de uma conversa. O OpenCode continua sendo a fonte de verdade do
 * histórico; aqui fica só o que o painel precisa para desenhar a sessão sem
 * esperar uma nova hidratação (streaming, forms, execução em andamento).
 */
export interface SessionState {
  messages: ChatMessage[];
  forms: FormInfo[];
  busy: boolean;
  statusMessage: string | null;
  contextUsage?: TokenUsage;
  /** Resultado novo em uma sessão que não é a exibida. */
  unread: boolean;
  /** Se já buscamos o histórico no OpenCode ao menos uma vez. */
  hydrated: boolean;
  /** Último evento SSE recebido; evita que uma hidratação antiga sobrescreva. */
  lastEventAt: number;
  /** Token por sessão: uma troca rápida de conversa não cancela a outra. */
  hydrateToken: number;
}

export function createSessionState(): SessionState {
  return {
    messages: [],
    forms: [],
    busy: false,
    statusMessage: null,
    contextUsage: undefined,
    unread: false,
    hydrated: false,
    lastEventAt: 0,
    hydrateToken: 0,
  };
}

/**
 * Cache de sessões em memória, com limite para o service worker não crescer sem
 * controle quando várias conversas rodam em segundo plano. Sessões protegidas
 * (a exibida no painel) e sessões ocupadas nunca são descartadas.
 */
export class SessionStates {
  private readonly states = new Map<string, SessionState>();

  constructor(
    private readonly limit = 4,
    private readonly isProtected: (sessionID: string) => boolean = () =>
      false,
  ) {}

  get(sessionID: string): SessionState {
    const existing = this.states.get(sessionID);
    if (existing) {
      // Move para o fim: a ordem do Map é a ordem de uso (LRU).
      this.states.delete(sessionID);
      this.states.set(sessionID, existing);
      return existing;
    }
    const created = createSessionState();
    this.states.set(sessionID, created);
    this.evict(sessionID);
    return created;
  }

  peek(sessionID: string): SessionState | undefined {
    return this.states.get(sessionID);
  }

  delete(sessionID: string): void {
    this.states.delete(sessionID);
  }

  clear(): void {
    this.states.clear();
  }

  ids(): string[] {
    return [...this.states.keys()];
  }

  anyBusy(): boolean {
    for (const state of this.states.values()) {
      if (state.busy) return true;
    }
    return false;
  }

  meta(): SessionMeta[] {
    return [...this.states.entries()].map(([sessionID, state]) => ({
      sessionID,
      busy: state.busy,
      unread: state.unread,
    }));
  }

  /** Descarta o estado de sessões que não existem mais na lista do servidor. */
  retain(sessionIDs: Iterable<string>): void {
    const keep = new Set(sessionIDs);
    for (const sessionID of [...this.states.keys()]) {
      const state = this.states.get(sessionID);
      if (!state) continue;
      if (keep.has(sessionID) || state.busy || this.isProtected(sessionID)) {
        continue;
      }
      this.states.delete(sessionID);
    }
  }

  private evict(keepID?: string): void {
    if (this.states.size <= this.limit) return;
    for (const [sessionID, state] of [...this.states.entries()]) {
      if (this.states.size <= this.limit) return;
      if (
        state.busy ||
        state.unread ||
        sessionID === keepID ||
        this.isProtected(sessionID)
      )
        continue;
      this.states.delete(sessionID);
    }
  }
}
