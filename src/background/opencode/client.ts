import type {
  AgentInfo,
  CommandInfo,
  FormAnswer,
  FormInfo,
  ModelInfo,
  ModelRef,
  SessionInfo,
  TokenUsage,
} from "../../shared/types";
import type { OpencodeEvent } from "../../shared/protocol";
import { parseSse } from "./sse";
import { messageUsage } from "./usage";

const PAIR_PATH = /\/auth\/connect\/([A-Za-z0-9_-]+)/;

export class OpencodeError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    options?: { cause?: unknown; timedOut?: boolean },
  ) {
    super(message, options);
    this.name = "OpencodeError";
    this.timedOut = options?.timedOut ?? false;
  }

  readonly timedOut: boolean;
}

export function formatOpencodeError(error: unknown): string {
  const detail =
    errorDetail(error) ??
    (error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "");
  const serialized = (() => {
    try {
      return JSON.stringify(error);
    } catch {
      return "";
    }
  })();
  const searchable = `${detail} ${serialized}`.toLowerCase();
  const status =
    error && typeof error === "object"
      ? (error as { status?: unknown }).status
      : undefined;
  let guidance: string | undefined;

  if (
    status === 402 ||
    /insufficient[ _-]?(funds|credits?|quota)|out of (funds|credits?)|no credits|credit balance|billing hard limit|saldo insuficiente|cr[eé]ditos? insuficientes/.test(
      searchable,
    )
  ) {
    guidance =
      "Confira o saldo e os limites de gastos do OpenCode Go/provedor, ou selecione outro provedor ou modelo.";
  } else if (
    status === 401 ||
    status === 403 ||
    /unauthorized|authentication|invalid api key|chave de api inv[aá]lida/.test(
      searchable,
    )
  ) {
    guidance =
      "Confira as credenciais e permissões configuradas para esse provedor no OpenCode.";
  } else if (
    status === 429 ||
    /rate.?limit|too many requests/.test(searchable)
  ) {
    guidance =
      "O provedor limitou as requisições. Aguarde um pouco ou confira a cota e os limites da conta.";
  }

  return guidance ? `${detail}\n\n${guidance}` : detail;
}

function errorDetail(error: unknown, depth = 0): string | undefined {
  if (depth > 4 || error == null) return undefined;
  if (typeof error === "string") return error;
  if (Array.isArray(error)) {
    return (
      error
        .map((item) => errorDetail(item, depth + 1))
        .filter(Boolean)
        .join("; ") || undefined
    );
  }
  if (typeof error !== "object") return undefined;

  const value = error as Record<string, unknown>;
  for (const key of [
    "message",
    "detail",
    "body",
    "data",
    "error",
    "errors",
    "cause",
  ]) {
    const detail = errorDetail(value[key], depth + 1);
    if (detail) return detail;
  }
  return typeof value.name === "string" ? value.name : undefined;
}

export class OpencodeClient {
  constructor(
    readonly baseUrl: string,
    readonly token: string,
    readonly directory?: string,
    readonly timeoutMs = 15_000,
  ) {}

  static parsePairLink(link: string): { baseUrl: string; code: string } {
    const trimmed = link.trim();
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      throw new OpencodeError(
        "Link inválido. Cole o link completo exibido por `opencode pair`.",
      );
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new OpencodeError(
        "O link precisa começar com http:// ou https://.",
      );
    }
    const match = url.pathname.match(PAIR_PATH);
    if (!match?.[1]) {
      throw new OpencodeError("O link não contém /auth/connect/<código>.");
    }
    return { baseUrl: url.origin, code: match[1] };
  }

  static async pair(link: string): Promise<{ baseUrl: string; token: string }> {
    const { baseUrl, code } = OpencodeClient.parsePairLink(link);
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/auth/connect/${code}`, {
        headers: { accept: "application/json" },
        cache: "no-store",
      });
    } catch (error) {
      throw new OpencodeError(
        `Não foi possível falar com o OpenCode em ${baseUrl}. Ele está rodando?`,
        undefined,
        { cause: error },
      );
    }
    if (!response.ok) {
      throw new OpencodeError(
        response.status === 401
          ? "Link expirado ou já usado. Rode `opencode pair` novamente."
          : `Falha ao parear (HTTP ${response.status}).`,
        response.status,
      );
    }
    const payload = (await response.json()) as { token?: unknown };
    if (typeof payload.token !== "string" || payload.token.length === 0) {
      throw new OpencodeError("O servidor não devolveu um token de sessão.");
    }
    return { baseUrl, token: payload.token };
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    return {
      authorization: `Basic ${btoa(`opencode:${this.token}`)}`,
      "content-type": "application/json",
      accept: "application/json",
      ...extra,
    };
  }

  private url(path: string): string {
    const url = new URL(path, this.baseUrl);
    if (this.directory) url.searchParams.set("directory", this.directory);
    return url.toString();
  }

  private async request<T>(
    path: string,
    init?: RequestInit,
    timeoutMs = this.timeoutMs,
  ): Promise<T> {
    const controller = new AbortController();
    const external = init?.signal ?? undefined;
    const forwardAbort = () => controller.abort();
    if (external) {
      if (external.aborted) controller.abort();
      else external.addEventListener("abort", forwardAbort, { once: true });
    }
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    let response: Response;
    try {
      response = await fetch(this.url(path), {
        ...init,
        signal: controller.signal,
        headers: this.headers(
          init?.headers as Record<string, string> | undefined,
        ),
        cache: "no-store",
      });
    } catch (error) {
      throw new OpencodeError(
        timedOut
          ? `O OpenCode não respondeu em ${Math.round(timeoutMs / 1000)}s. Ele ainda está rodando?`
          : `Não foi possível falar com o OpenCode em ${this.baseUrl}. Ele está rodando?`,
        undefined,
        { cause: error, timedOut },
      );
    } finally {
      clearTimeout(timer);
      external?.removeEventListener("abort", forwardAbort);
    }
    if (!response.ok) {
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        body = undefined;
      }
      const detail =
        body === undefined
          ? `HTTP ${response.status}`
          : formatOpencodeError({ body, status: response.status });
      throw new OpencodeError(
        detail || `HTTP ${response.status}`,
        response.status,
      );
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  async listModels(): Promise<ModelInfo[]> {
    const payload = await this.request<{ data?: ModelInfo[] } | ModelInfo[]>(
      "/api/model",
    );
    const models = Array.isArray(payload) ? payload : (payload?.data ?? []);
    return models.filter((model) => !model.disabled);
  }

  async defaultModel(): Promise<ModelRef | null> {
    const payload = await this.request<
      ModelInfo | { data?: ModelInfo | null } | null
    >("/api/model/default");
    const model =
      payload && typeof payload === "object" && "data" in payload
        ? ((payload as { data?: ModelInfo | null }).data ?? null)
        : (payload as ModelInfo | null);
    if (!model?.id || !model.providerID) return null;
    return { id: model.id, providerID: model.providerID };
  }

  async listAgents(): Promise<AgentInfo[]> {
    const payload = await this.request<{ data?: AgentInfo[] }>("/api/agent");
    return (payload?.data ?? []).filter(
      (agent) => agent.mode !== "subagent" && agent.hidden !== true,
    );
  }

  async listCommands(): Promise<CommandInfo[]> {
    const payload = await this.request<{ data?: CommandInfo[] }>(
      "/api/command",
    );
    return payload?.data ?? [];
  }

  async runCommand(id: string, name: string, text: string): Promise<void> {
    await this.request(`/api/session/${encodeURIComponent(id)}/command`, {
      method: "POST",
      body: JSON.stringify({ name, text }),
    });
  }

  async switchAgent(id: string, agent: string): Promise<void> {
    await this.request<void>(`/api/session/${encodeURIComponent(id)}/agent`, {
      method: "POST",
      body: JSON.stringify({ agent }),
    });
  }

  async generate(prompt: string, model?: ModelRef): Promise<string> {
    const payload = await this.request<{ data?: { text?: string } }>(
      "/api/experimental/generate",
      {
        method: "POST",
        body: JSON.stringify({ prompt, ...(model ? { model } : {}) }),
      },
    );
    return payload.data?.text ?? "";
  }

  async listSessions(): Promise<SessionInfo[]> {
    const payload = await this.request<{ data?: SessionInfo[] }>(
      "/api/session",
    );
    return payload?.data ?? [];
  }

  /** Usage da última mensagem do assistente (contexto da última requisição). */
  async lastAssistantUsage(id: string): Promise<TokenUsage | undefined> {
    const payload = await this.request<{ data?: unknown[] }>(
      `/api/session/${encodeURIComponent(id)}/message`,
    );
    const list = Array.isArray(payload?.data) ? payload.data : [];
    // A API devolve as mensagens da mais nova para a mais antiga, mas não
    // confie na ordem: escolhe a de maior `time.created`.
    let best: { created: number; usage: TokenUsage } | undefined;
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const message = item as Record<string, unknown>;
      if (message.type !== "assistant") continue;
      const usage = messageUsage(message);
      if (!usage) continue;
      const time =
        message.time && typeof message.time === "object"
          ? (message.time as Record<string, unknown>)
          : undefined;
      const created =
        typeof time?.created === "number" ? time.created : 0;
      if (!best || created > best.created) best = { created, usage };
    }
    return best?.usage;
  }

  async createSession(model?: ModelRef, agent?: string): Promise<SessionInfo> {
    const body: Record<string, unknown> = {};
    if (model) body.model = model;
    if (agent) body.agent = agent;
    if (this.directory) body.location = { directory: this.directory };
    const payload = await this.request<{ data: SessionInfo }>("/api/session", {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (!payload?.data?.id) throw new OpencodeError("Sessão criada sem id.");
    return payload.data;
  }

  async deleteSession(id: string): Promise<void> {
    await this.request<void>(`/api/session/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  }

  async switchModel(id: string, model: ModelRef): Promise<void> {
    await this.request<void>(`/api/session/${encodeURIComponent(id)}/model`, {
      method: "POST",
      body: JSON.stringify({ model }),
    });
  }

  async context(id: string): Promise<unknown[]> {
    const payload = await this.request<{ data?: unknown[] }>(
      `/api/session/${encodeURIComponent(id)}/context`,
    );
    return payload?.data ?? [];
  }

  async prompt(id: string, text: string): Promise<void> {
    await this.request(`/api/session/${encodeURIComponent(id)}/prompt`, {
      method: "POST",
      body: JSON.stringify({ text }),
    });
  }

  async listForms(sessionID: string): Promise<FormInfo[]> {
    const payload = await this.request<{ data?: FormInfo[] }>(
      `/api/session/${encodeURIComponent(sessionID)}/form`,
    );
    return payload?.data ?? [];
  }

  async replyForm(
    sessionID: string,
    formID: string,
    answer: FormAnswer,
  ): Promise<void> {
    await this.request<void>(
      `/api/session/${encodeURIComponent(sessionID)}/form/${encodeURIComponent(formID)}/reply`,
      { method: "POST", body: JSON.stringify({ answer }) },
    );
  }

  async cancelForm(
    sessionID: string,
    formID: string,
    message?: string,
  ): Promise<void> {
    const query = message ? `?message=${encodeURIComponent(message)}` : "";
    await this.request<void>(
      `/api/session/${encodeURIComponent(sessionID)}/form/${encodeURIComponent(formID)}${query}`,
      { method: "DELETE" },
    );
  }

  async interrupt(id: string): Promise<void> {
    await this.request(`/api/session/${encodeURIComponent(id)}/interrupt`, {
      method: "POST",
    });
  }

  async subscribe(
    onEvent: (event: OpencodeEvent) => void,
    signal: AbortSignal,
    onOpen?: () => void,
  ): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/event`, {
      headers: { ...this.headers(), accept: "text/event-stream" },
      signal,
      cache: "no-store",
    });
    if (!response.ok || !response.body) {
      throw new OpencodeError(
        `Stream de eventos indisponível (HTTP ${response.status}).`,
        response.status,
      );
    }
    onOpen?.();
    for await (const event of parseSse(response.body, signal)) {
      onEvent(event);
    }
  }

  /** Verificação leve de que o servidor continua respondendo. */
  async probe(timeoutMs = 5_000): Promise<void> {
    await this.request<unknown>("/api/agent", undefined, timeoutMs);
  }
}
