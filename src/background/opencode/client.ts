import type { ModelInfo, ModelRef, SessionInfo } from "../../shared/types"
import type { OpencodeEvent } from "../../shared/protocol"
import { parseSse } from "./sse"

const PAIR_PATH = /\/auth\/connect\/([A-Za-z0-9_-]+)/

export class OpencodeError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = "OpencodeError"
  }
}

export class OpencodeClient {
  constructor(
    readonly baseUrl: string,
    readonly token: string,
    readonly directory?: string,
  ) {}

  static parsePairLink(link: string): { baseUrl: string; code: string } {
    const trimmed = link.trim()
    let url: URL
    try {
      url = new URL(trimmed)
    } catch {
      throw new OpencodeError("Link inválido. Cole o link completo exibido por `opencode pair`.")
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new OpencodeError("O link precisa começar com http:// ou https://.")
    }
    const match = url.pathname.match(PAIR_PATH)
    if (!match?.[1]) {
      throw new OpencodeError("O link não contém /auth/connect/<código>.")
    }
    return { baseUrl: url.origin, code: match[1] }
  }

  static async pair(link: string): Promise<{ baseUrl: string; token: string }> {
    const { baseUrl, code } = OpencodeClient.parsePairLink(link)
    const response = await fetch(`${baseUrl}/auth/connect/${code}`, {
      headers: { accept: "application/json" },
      cache: "no-store",
    })
    if (!response.ok) {
      throw new OpencodeError(
        response.status === 401
          ? "Link expirado ou já usado. Rode `opencode pair` novamente."
          : `Falha ao parear (HTTP ${response.status}).`,
        response.status,
      )
    }
    const payload = (await response.json()) as { token?: unknown }
    if (typeof payload.token !== "string" || payload.token.length === 0) {
      throw new OpencodeError("O servidor não devolveu um token de sessão.")
    }
    return { baseUrl, token: payload.token }
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    return {
      authorization: `Basic ${btoa(`opencode:${this.token}`)}`,
      "content-type": "application/json",
      accept: "application/json",
      ...extra,
    }
  }

  private url(path: string): string {
    const url = new URL(path, this.baseUrl)
    if (this.directory) url.searchParams.set("directory", this.directory)
    return url.toString()
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    let response: Response
    try {
      response = await fetch(this.url(path), {
        ...init,
        headers: this.headers(init?.headers as Record<string, string> | undefined),
        cache: "no-store",
      })
    } catch (error) {
      throw new OpencodeError(
        `Não foi possível falar com o OpenCode em ${this.baseUrl}. Ele está rodando?`,
        undefined,
      )
    }
    if (!response.ok) {
      let detail = `HTTP ${response.status}`
      try {
        const body = (await response.json()) as { message?: string; _tag?: string }
        if (body?.message) detail = body.message
      } catch {
        // keep status text
      }
      throw new OpencodeError(detail, response.status)
    }
    if (response.status === 204) return undefined as T
    return (await response.json()) as T
  }

  async listModels(): Promise<ModelInfo[]> {
    const payload = await this.request<{ data?: ModelInfo[] } | ModelInfo[]>("/api/model")
    const models = Array.isArray(payload) ? payload : payload.data
    return (models ?? []).filter((model) => !model.disabled)
  }

  async defaultModel(): Promise<ModelRef | null> {
    const payload = await this.request<ModelInfo | { data?: ModelInfo | null } | null>(
      "/api/model/default",
    )
    const model =
      payload && typeof payload === "object" && "data" in payload
        ? ((payload as { data?: ModelInfo | null }).data ?? null)
        : (payload as ModelInfo | null)
    if (!model?.id || !model.providerID) return null
    return { id: model.id, providerID: model.providerID }
  }

  async listSessions(): Promise<SessionInfo[]> {
    const payload = await this.request<{ data?: SessionInfo[] }>("/api/session")
    return payload.data ?? []
  }

  async createSession(model?: ModelRef): Promise<SessionInfo> {
    const body: Record<string, unknown> = {}
    if (model) body.model = model
    if (this.directory) body.location = { directory: this.directory }
    const payload = await this.request<{ data: SessionInfo }>("/api/session", {
      method: "POST",
      body: JSON.stringify(body),
    })
    if (!payload.data?.id) throw new OpencodeError("Sessão criada sem id.")
    return payload.data
  }

  async deleteSession(id: string): Promise<void> {
    await this.request<void>(`/api/session/${encodeURIComponent(id)}`, { method: "DELETE" })
  }

  async switchModel(id: string, model: ModelRef): Promise<void> {
    await this.request<void>(`/api/session/${encodeURIComponent(id)}/model`, {
      method: "POST",
      body: JSON.stringify({ model }),
    })
  }

  async context(id: string): Promise<unknown[]> {
    const payload = await this.request<{ data?: unknown[] }>(
      `/api/session/${encodeURIComponent(id)}/context`,
    )
    return payload.data ?? []
  }

  async prompt(id: string, text: string): Promise<void> {
    await this.request(`/api/session/${encodeURIComponent(id)}/prompt`, {
      method: "POST",
      body: JSON.stringify({ text }),
    })
  }

  async interrupt(id: string): Promise<void> {
    await this.request(`/api/session/${encodeURIComponent(id)}/interrupt`, { method: "POST" })
  }

  async subscribe(
    onEvent: (event: OpencodeEvent) => void,
    signal: AbortSignal,
  ): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/event`, {
      headers: { ...this.headers(), accept: "text/event-stream" },
      signal,
      cache: "no-store",
    })
    if (!response.ok || !response.body) {
      throw new OpencodeError(`Stream de eventos indisponível (HTTP ${response.status}).`, response.status)
    }
    for await (const event of parseSse(response.body, signal)) {
      onEvent(event)
    }
  }
}
