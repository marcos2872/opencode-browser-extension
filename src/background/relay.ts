import { RELAY_PORT, RELAY_PROTOCOL, RELAY_URL, type RelayInbound, type RelayOutbound } from "../shared/protocol"
import type { RelayState } from "../shared/types"

const CANDIDATE_PORTS = [RELAY_PORT, RELAY_PORT + 1, RELAY_PORT + 2, RELAY_PORT + 3]

/** O plugin pode precisar de outra porta quando um servidor antigo ainda ocupa 8799. */
async function resolveRelayUrl(): Promise<string> {
  for (const port of CANDIDATE_PORTS) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, {
        signal: AbortSignal.timeout(700),
        cache: "no-store",
      })
      if (!response.ok) continue
      const data = (await response.json()) as { connected?: boolean }
      if (data && typeof data === "object" && "connected" in data) {
        return `ws://127.0.0.1:${port}`
      }
    } catch {
      // porta sem o relay novo; tenta a próxima
    }
  }
  return RELAY_URL
}

interface RelayHandlers {
  onTool: (request: Extract<RelayInbound, { type: "tool_request" }>) => void
  onCancel: (id: string) => void
  onState: (state: RelayState) => void
}

export class RelayClient {
  private socket: WebSocket | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private pingTimer: ReturnType<typeof setInterval> | null = null
  private attempts = 0
  private state: RelayState = { connected: false, url: RELAY_URL }

  constructor(private readonly handlers: RelayHandlers) {}

  get current(): RelayState {
    return this.state
  }

  async connect(force = false): Promise<void> {
    if (!force && this.socket && this.socket.readyState <= WebSocket.OPEN) return
    if (force) this.close()
    const url = await resolveRelayUrl()
    if (this.socket) return
    this.setState({ ...this.state, connected: false, url, lastError: undefined })
    let socket: WebSocket
    try {
      socket = new WebSocket(url)
    } catch (error) {
      this.fail(error instanceof Error ? error.message : String(error))
      return
    }
    this.socket = socket

    socket.addEventListener("open", () => {
      this.attempts = 0
      const hello: RelayOutbound = {
        type: "hello",
        v: RELAY_PROTOCOL,
        extensionId: chrome.runtime.id,
      }
      socket.send(JSON.stringify(hello))
      this.setState({ connected: true, url })
      if (this.pingTimer) clearInterval(this.pingTimer)
      this.pingTimer = setInterval(() => this.send({ type: "pong" }), 20_000)
    })

    socket.addEventListener("message", (event) => {
      if (typeof event.data !== "string") return
      let message: RelayInbound
      try {
        message = JSON.parse(event.data) as RelayInbound
      } catch {
        return
      }
      if (message.type === "ping") {
        this.send({ type: "pong" })
        return
      }
      if (message.type === "cancel") {
        this.handlers.onCancel(message.id)
        return
      }
      if (message.type === "tool_request") {
        this.handlers.onTool(message)
      }
    })

    socket.addEventListener("close", (event) => {
      if (this.socket !== socket) return
      this.socket = null
      this.stopPing()
      this.setState({
        connected: false,
        url,
        lastError: event.reason || `Conexão encerrada (${event.code}).`,
      })
      this.schedule()
    })

    socket.addEventListener("error", () => {
      if (this.socket !== socket) return
      this.setState({ connected: false, url, lastError: "Plugin do OpenCode não encontrado." })
    })
  }

  reconnect(): void {
    this.attempts = 0
    void this.connect(true)
  }

  send(message: RelayOutbound): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false
    try {
      this.socket.send(JSON.stringify(message))
      return true
    } catch {
      return false
    }
  }

  private schedule(): void {
    if (this.reconnectTimer) return
    this.attempts += 1
    const delay = Math.min(1000 * 1.6 ** Math.min(this.attempts, 5), 15_000)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, delay)
  }

  private fail(reason: string): void {
    this.setState({ connected: false, url: this.state.url, lastError: reason })
    this.schedule()
  }

  private close(): void {
    this.stopPing()
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.socket) {
      const socket = this.socket
      this.socket = null
      try {
        socket.close()
      } catch {
        // ignore
      }
    }
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer)
      this.pingTimer = null
    }
  }

  private setState(state: RelayState): void {
    this.state = state
    this.handlers.onState(state)
  }
}
