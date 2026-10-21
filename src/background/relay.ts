import { RELAY_PROTOCOL, RELAY_URL, type RelayInbound, type RelayOutbound } from "../shared/protocol"
import type { RelayState } from "../shared/types"

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

  connect(force = false): void {
    if (!force && this.socket && this.socket.readyState <= WebSocket.OPEN) return
    if (force) this.close()
    this.setState({ ...this.state, connected: false, lastError: undefined })
    let socket: WebSocket
    try {
      socket = new WebSocket(RELAY_URL)
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
      this.setState({ connected: true, url: RELAY_URL })
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
        url: RELAY_URL,
        lastError: event.reason || `Conexão encerrada (${event.code}).`,
      })
      this.schedule()
    })

    socket.addEventListener("error", () => {
      if (this.socket !== socket) return
      this.setState({ connected: false, url: RELAY_URL, lastError: "Plugin do OpenCode não encontrado." })
    })
  }

  reconnect(): void {
    this.attempts = 0
    this.connect(true)
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
    this.setState({ connected: false, url: RELAY_URL, lastError: reason })
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
