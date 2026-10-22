import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { RelayClient } from "../../src/background/relay"
import { RELAY_PROTOCOL, RELAY_URL } from "../../src/shared/protocol"
import type { RelayState } from "../../src/shared/types"

type Listener = (event: unknown) => void

/** WebSocket falso: o teste controla abertura, mensagens, erros e queda da conexão. */
class FakeWebSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3

  static instances: FakeWebSocket[] = []
  static constructAttempts = 0
  static throwOnConstruct: false | Error | string = false

  readonly url: string
  readyState = FakeWebSocket.CONNECTING
  sent: string[] = []
  closeCalls = 0
  sendThrows = false
  private readonly listeners = new Map<string, Listener[]>()

  constructor(url: string) {
    FakeWebSocket.constructAttempts += 1
    if (FakeWebSocket.throwOnConstruct !== false) throw FakeWebSocket.throwOnConstruct
    this.url = url
    FakeWebSocket.instances.push(this)
  }

  addEventListener(type: string, listener: Listener): void {
    const list = this.listeners.get(type) ?? []
    list.push(listener)
    this.listeners.set(type, list)
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter((item) => item !== listener))
  }

  send(data: string): void {
    if (this.readyState !== FakeWebSocket.OPEN) throw new Error("socket não está aberto")
    if (this.sendThrows) throw new Error("send falhou")
    this.sent.push(data)
  }

  close(): void {
    this.closeCalls += 1
    this.readyState = FakeWebSocket.CLOSED
  }

  sentJson(): unknown[] {
    return this.sent.map((item) => JSON.parse(item) as unknown)
  }

  /** Simula o servidor aceitando a conexão. */
  open(): void {
    this.readyState = FakeWebSocket.OPEN
    this.emit("open", {})
  }

  message(data: unknown): void {
    this.emit("message", { data })
  }

  errorEvent(): void {
    this.emit("error", {})
  }

  /** Simula a queda da conexão pelo servidor. */
  drop(code = 1006, reason = ""): void {
    this.readyState = FakeWebSocket.CLOSED
    this.emit("close", { code, reason })
  }

  private emit(type: string, event: unknown): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event)
  }
}

interface RelayHarness {
  client: RelayClient
  onTool: ReturnType<typeof vi.fn>
  onCancel: ReturnType<typeof vi.fn>
  onState: ReturnType<typeof vi.fn>
  states: RelayState[]
}

function makeClient(): RelayHarness {
  const onTool = vi.fn()
  const onCancel = vi.fn()
  const states: RelayState[] = []
  const onState = vi.fn((state: RelayState) => {
    states.push(state)
  })
  const client = new RelayClient({ onTool, onCancel, onState })
  return { client, onTool, onCancel, onState, states }
}

function healthOk(payload: unknown = { connected: true }): Response {
  return { ok: true, status: 200, json: async () => payload } as unknown as Response
}

function healthNotOk(status = 404): Response {
  return { ok: false, status, json: async () => ({}) } as unknown as Response
}

/** Instala o fetch do /health respondendo apenas nas portas presentes no mapa. */
function healthFetch(map: Record<number, () => Promise<Response>>): void {
  fetchMock.mockImplementation(async (input: unknown) => {
    const port = Number(new URL(String(input)).port)
    const handler = map[port]
    if (!handler) throw new TypeError("Failed to fetch")
    return handler()
  })
}

function healthUrls(): string[] {
  return fetchMock.mock.calls.map(([input]) => String(input))
}

async function flush(turns = 10): Promise<void> {
  for (let i = 0; i < turns; i += 1) await Promise.resolve()
}

function socketAt(index: number): FakeWebSocket {
  const socket = FakeWebSocket.instances[index]
  if (!socket) throw new Error(`socket ${index} não existe`)
  return socket
}

function pongs(socket: FakeWebSocket): unknown[] {
  return socket.sentJson().filter((item) => (item as { type?: string }).type === "pong")
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  FakeWebSocket.instances = []
  FakeWebSocket.constructAttempts = 0
  FakeWebSocket.throwOnConstruct = false
  fetchMock = vi.fn()
  vi.stubGlobal("fetch", fetchMock)
  vi.stubGlobal("WebSocket", FakeWebSocket)
})

afterEach(() => {
  vi.useRealTimers()
})

describe("background/relay — descoberta de porta", () => {
  it("começa desconectado apontando para a porta padrão", () => {
    const { client } = makeClient()
    expect(client.current).toEqual({ connected: false, url: RELAY_URL })
  })

  it("escolhe a primeira porta que responde /health com a chave connected", async () => {
    healthFetch({ 8799: async () => healthOk({ connected: false }) })
    const { client, states } = makeClient()

    await client.connect()

    expect(healthUrls()).toEqual(["http://127.0.0.1:8799/health"])
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(init.cache).toBe("no-store")
    expect((init.signal as AbortSignal).aborted).toBe(false)
    expect(FakeWebSocket.instances).toHaveLength(1)
    expect(socketAt(0).url).toBe("ws://127.0.0.1:8799")
    expect(client.current).toMatchObject({ connected: false, url: "ws://127.0.0.1:8799" })
    expect(states.at(-1)).toMatchObject({ connected: false, url: "ws://127.0.0.1:8799" })
  })

  it("pula portas sem ok e corpos sem a chave connected", async () => {
    healthFetch({
      8799: async () => healthNotOk(),
      8800: async () => healthOk(42),
      8801: async () => healthOk({ status: "ok" }),
      8802: async () => healthOk({ connected: true }),
    })
    const { client } = makeClient()

    await client.connect()

    expect(healthUrls()).toEqual([
      "http://127.0.0.1:8799/health",
      "http://127.0.0.1:8800/health",
      "http://127.0.0.1:8801/health",
      "http://127.0.0.1:8802/health",
    ])
    expect(socketAt(0).url).toBe("ws://127.0.0.1:8802")
  })

  it("pula porta cujo /health não é JSON", async () => {
    healthFetch({
      8799: async () =>
        ({
          ok: true,
          status: 200,
          json: async () => {
            throw new SyntaxError("Unexpected token")
          },
        }) as unknown as Response,
      8800: async () => healthOk({ connected: true }),
    })
    const { client } = makeClient()

    await client.connect()

    expect(socketAt(0).url).toBe("ws://127.0.0.1:8800")
  })

  it("usa a porta padrão quando nenhuma porta responde", async () => {
    healthFetch({})
    const { client } = makeClient()

    await client.connect()

    expect(healthUrls()).toEqual([
      "http://127.0.0.1:8799/health",
      "http://127.0.0.1:8800/health",
      "http://127.0.0.1:8801/health",
      "http://127.0.0.1:8802/health",
    ])
    expect(socketAt(0).url).toBe(RELAY_URL)
  })
})

describe("background/relay — handshake e ping", () => {
  it("envia hello com extensionId e versão do protocolo ao abrir", async () => {
    vi.useFakeTimers()
    healthFetch({ 8799: async () => healthOk() })
    const { client, states } = makeClient()
    await client.connect()

    socketAt(0).open()

    expect(socketAt(0).sentJson()).toEqual([
      { type: "hello", v: RELAY_PROTOCOL, extensionId: "test-extension-id" },
    ])
    expect(RELAY_PROTOCOL).toBe(1)
    expect(client.current).toEqual({ connected: true, url: "ws://127.0.0.1:8799" })
    expect(states.at(-1)).toEqual({ connected: true, url: "ws://127.0.0.1:8799" })
  })

  it("envia pong a cada 20 segundos", async () => {
    vi.useFakeTimers()
    healthFetch({ 8799: async () => healthOk() })
    const { client } = makeClient()
    await client.connect()
    const socket = socketAt(0)
    socket.open()

    expect(socket.sent).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(19_999)
    expect(pongs(socket)).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(1)
    expect(pongs(socket)).toEqual([{ type: "pong" }])

    await vi.advanceTimersByTimeAsync(20_000)
    expect(pongs(socket)).toHaveLength(2)
  })

  it("não acumula intervalos quando o socket emite open mais de uma vez", async () => {
    vi.useFakeTimers()
    healthFetch({ 8799: async () => healthOk() })
    const { client } = makeClient()
    await client.connect()
    const socket = socketAt(0)

    socket.open()
    socket.open()

    await vi.advanceTimersByTimeAsync(20_000)
    expect(pongs(socket)).toHaveLength(1)
  })
})

describe("background/relay — mensagens recebidas", () => {
  async function connectedClient(): Promise<RelayHarness & { socket: FakeWebSocket }> {
    healthFetch({ 8799: async () => healthOk() })
    const harness = makeClient()
    await harness.client.connect()
    const socket = socketAt(0)
    socket.open()
    return { ...harness, socket }
  }

  it("entrega tool_request para onTool", async () => {
    const { socket, onTool, onCancel } = await connectedClient()
    const request = {
      type: "tool_request",
      id: "t1",
      tool: "browser_click",
      args: { x: 1 },
      sessionID: "ses_1",
      permissionMode: "ask",
    }

    socket.message(JSON.stringify(request))

    expect(onTool).toHaveBeenCalledTimes(1)
    expect(onTool).toHaveBeenCalledWith(request)
    expect(onCancel).not.toHaveBeenCalled()
  })

  it("entrega cancel para onCancel", async () => {
    const { socket, onTool, onCancel } = await connectedClient()

    socket.message(JSON.stringify({ type: "cancel", id: "t9" }))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onCancel).toHaveBeenCalledWith("t9")
    expect(onTool).not.toHaveBeenCalled()
  })

  it("responde ping com pong", async () => {
    const { socket, onTool } = await connectedClient()

    socket.message(JSON.stringify({ type: "ping" }))

    expect(pongs(socket)).toEqual([{ type: "pong" }])
    expect(onTool).not.toHaveBeenCalled()
  })

  it("ignora JSON inválido, tipo desconhecido e payload não-string", async () => {
    const { socket, onTool, onCancel } = await connectedClient()

    socket.message("não é json")
    socket.message(JSON.stringify({ type: "desconhecido" }))
    socket.message({ type: "tool_request", id: "x", tool: "y", args: {} })

    expect(onTool).not.toHaveBeenCalled()
    expect(onCancel).not.toHaveBeenCalled()
    expect(socket.sent).toHaveLength(1)
  })
})

describe("background/relay — queda e reconexão", () => {
  it("reporta o motivo da queda e reconecta com backoff de 1,6s", async () => {
    vi.useFakeTimers()
    healthFetch({ 8799: async () => healthOk() })
    const { client, states } = makeClient()
    await client.connect()
    const first = socketAt(0)
    first.open()

    first.drop(1006, "")

    expect(client.current).toMatchObject({
      connected: false,
      lastError: "Conexão encerrada (1006).",
    })
    expect(states.at(-1)).toMatchObject({
      connected: false,
      lastError: "Conexão encerrada (1006).",
    })

    await vi.advanceTimersByTimeAsync(1599)
    await flush()
    expect(FakeWebSocket.instances).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(1)
    await flush()
    expect(FakeWebSocket.instances).toHaveLength(2)
    expect(socketAt(1).url).toBe("ws://127.0.0.1:8799")
  })

  it("usa o reason do close quando informado", async () => {
    vi.useFakeTimers()
    healthFetch({ 8799: async () => healthOk() })
    const { client } = makeClient()
    await client.connect()
    socketAt(0).open()

    socketAt(0).drop(1000, "plugin desligado")

    expect(client.current).toMatchObject({ connected: false, lastError: "plugin desligado" })
  })

  it("cresce o backoff e reconnect() zera as tentativas", async () => {
    vi.useFakeTimers()
    healthFetch({ 8799: async () => healthOk() })
    const { client } = makeClient()
    await client.connect()
    socketAt(0).open()

    socketAt(0).drop()
    await vi.advanceTimersByTimeAsync(1600)
    await flush()
    expect(FakeWebSocket.instances).toHaveLength(2)

    socketAt(1).drop()
    await vi.advanceTimersByTimeAsync(2559)
    await flush()
    expect(FakeWebSocket.instances).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(1)
    await flush()
    expect(FakeWebSocket.instances).toHaveLength(3)

    socketAt(2).drop()
    client.reconnect()
    await flush()
    // o socket já tinha caído sozinho: não há nada para close() fechar
    expect(socketAt(2).closeCalls).toBe(0)
    expect(FakeWebSocket.instances).toHaveLength(4)

    // o timer pendente foi cancelado pelo reconnect()
    await vi.advanceTimersByTimeAsync(4096)
    await flush()
    expect(FakeWebSocket.instances).toHaveLength(4)

    // attempts zerado: a próxima queda volta ao primeiro degrau (1,6s)
    socketAt(3).drop()
    await vi.advanceTimersByTimeAsync(1599)
    await flush()
    expect(FakeWebSocket.instances).toHaveLength(4)
    await vi.advanceTimersByTimeAsync(1)
    await flush()
    expect(FakeWebSocket.instances).toHaveLength(5)
  })

  it("reporta erro ao falhar a construção do WebSocket e tenta de novo", async () => {
    vi.useFakeTimers()
    healthFetch({ 8799: async () => healthOk() })
    FakeWebSocket.throwOnConstruct = new Error("porta bloqueada")
    const { client, states } = makeClient()

    await client.connect()

    expect(FakeWebSocket.constructAttempts).toBe(1)
    expect(FakeWebSocket.instances).toHaveLength(0)
    expect(client.current).toMatchObject({ connected: false, lastError: "porta bloqueada" })
    expect(states.at(-1)).toMatchObject({ lastError: "porta bloqueada" })

    await vi.advanceTimersByTimeAsync(1600)
    await flush()
    expect(FakeWebSocket.constructAttempts).toBe(2)

    await vi.advanceTimersByTimeAsync(2560)
    await flush()
    expect(FakeWebSocket.constructAttempts).toBe(3)
  })

  it("usa String(error) quando a falha não é um Error", async () => {
    vi.useFakeTimers()
    healthFetch({ 8799: async () => healthOk() })
    FakeWebSocket.throwOnConstruct = "sem permissão para abrir socket"
    const { client } = makeClient()

    await client.connect()

    expect(client.current).toMatchObject({
      connected: false,
      lastError: "sem permissão para abrir socket",
    })
  })

  it("não agenda duas reconexões quando já existe timer pendente", async () => {
    vi.useFakeTimers()
    healthFetch({ 8799: async () => healthOk() })
    FakeWebSocket.throwOnConstruct = new Error("porta bloqueada")
    const { client } = makeClient()

    await client.connect() // falha → agenda em 1,6s
    await client.connect() // falha de novo → schedule() deve sair cedo
    expect(FakeWebSocket.constructAttempts).toBe(2)

    await vi.advanceTimersByTimeAsync(1600)
    await flush()
    expect(FakeWebSocket.constructAttempts).toBe(3)

    // a próxima espera é 2,56s (um único agendamento por falha), não 4,09s
    await vi.advanceTimersByTimeAsync(2559)
    await flush()
    expect(FakeWebSocket.constructAttempts).toBe(3)
    await vi.advanceTimersByTimeAsync(1)
    await flush()
    expect(FakeWebSocket.constructAttempts).toBe(4)
  })

  it("marca lastError quando o socket emite error", async () => {
    vi.useFakeTimers()
    healthFetch({ 8799: async () => healthOk() })
    const { client, states } = makeClient()
    await client.connect()

    socketAt(0).errorEvent()

    expect(client.current).toMatchObject({
      connected: false,
      lastError: "Plugin do OpenCode não encontrado.",
    })
    expect(states.at(-1)).toMatchObject({ lastError: "Plugin do OpenCode não encontrado." })
  })

  it("ignora eventos de sockets antigos depois do reconnect", async () => {
    vi.useFakeTimers()
    healthFetch({ 8799: async () => healthOk() })
    const { client, onState } = makeClient()
    await client.connect()
    const first = socketAt(0)
    first.open()

    client.reconnect()
    await flush()
    expect(first.closeCalls).toBe(1)
    const second = socketAt(1)
    second.open()
    const callsAfterReconnect = onState.mock.calls.length

    first.drop(1006, "tarde demais")
    first.errorEvent()

    expect(onState.mock.calls.length).toBe(callsAfterReconnect)
    expect(client.current).toMatchObject({ connected: true })
    expect(FakeWebSocket.instances).toHaveLength(2)
  })
})

describe("background/relay — connect() e send()", () => {
  it("não abre um segundo socket quando já existe conexão", async () => {
    vi.useFakeTimers()
    healthFetch({ 8799: async () => healthOk() })
    const { client } = makeClient()

    await client.connect()
    await client.connect() // ainda CONNECTING
    expect(FakeWebSocket.instances).toHaveLength(1)

    socketAt(0).open()
    await client.connect() // já OPEN
    expect(FakeWebSocket.instances).toHaveLength(1)

    socketAt(0).drop()
    await client.connect() // caiu: abre outro
    expect(FakeWebSocket.instances).toHaveLength(2)
  })

  it("ignora connect() concorrente depois do await da descoberta", async () => {
    healthFetch({ 8799: async () => healthOk() })
    const { client } = makeClient()

    await Promise.all([client.connect(), client.connect()])

    expect(FakeWebSocket.instances).toHaveLength(1)
  })

  it("send() devolve false sem socket aberto e true quando aberto", async () => {
    vi.useFakeTimers()
    healthFetch({ 8799: async () => healthOk() })
    const { client } = makeClient()

    expect(client.send({ type: "pong" })).toBe(false)

    await client.connect()
    expect(client.send({ type: "pong" })).toBe(false) // CONNECTING

    const socket = socketAt(0)
    socket.open()
    expect(client.send({ type: "progress", id: "1", phase: "coletando" })).toBe(true)
    expect(socket.sentJson().at(-1)).toEqual({
      type: "progress",
      id: "1",
      phase: "coletando",
    })

    socket.sendThrows = true
    expect(client.send({ type: "pong" })).toBe(false)
    socket.sendThrows = false

    socket.drop()
    expect(client.send({ type: "pong" })).toBe(false)
  })
})
