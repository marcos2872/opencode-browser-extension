import { describe, expect, it } from "vitest"
import { parseSse } from "../../../src/background/opencode/sse"
import type { OpencodeEvent } from "../../../src/shared/protocol"

const encoder = new TextEncoder()

function bytes(text: string): Uint8Array {
  return encoder.encode(text)
}

/** Stream que entrega todos os chunks e fecha (imita o servidor terminando a resposta). */
function streamOf(chunks: Array<string | Uint8Array>): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const item of chunks) controller.enqueue(typeof item === "string" ? bytes(item) : item)
      controller.close()
    },
  })
}

interface ControlledStream {
  stream: ReadableStream<Uint8Array>
  push(text: string | Uint8Array): void
  close(): void
  fail(reason: unknown): void
}

/** Stream "vivo": só entrega o que o teste empurrar, como o body de um fetch em andamento. */
function controlledStream(): ControlledStream {
  let controller!: ReadableStreamDefaultController<Uint8Array>
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c
    },
  })
  return {
    stream,
    push: (text) => controller.enqueue(typeof text === "string" ? bytes(text) : text),
    close: () => controller.close(),
    fail: (reason) => controller.error(reason),
  }
}

/** Monta um frame SSE com um payload JSON. */
function frame(payload: Record<string, unknown>): string {
  return `data: ${JSON.stringify(payload)}\n\n`
}

async function collect(
  stream: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  limit = 100,
): Promise<OpencodeEvent[]> {
  const events: OpencodeEvent[] = []
  for await (const event of parseSse(stream, signal)) {
    events.push(event)
    if (events.length >= limit) break
  }
  return events
}

function liveSignal(): AbortSignal {
  return new AbortController().signal
}

describe("background/opencode/sse", () => {
  it("converte um frame data: simples em evento", async () => {
    const stream = streamOf([
      frame({ id: "evt_1", type: "session.updated", data: { id: "ses_1" } }),
    ])

    await expect(collect(stream, liveSignal())).resolves.toEqual([
      { id: "evt_1", type: "session.updated", data: { id: "ses_1" } },
    ])
  })

  it("concatena várias linhas data: do mesmo frame", async () => {
    const stream = streamOf([
      'data: {"type":"message.part",\ndata: "data":{"text":"olá"}}\n\n',
    ])

    await expect(collect(stream, liveSignal())).resolves.toEqual([
      { type: "message.part", data: { text: "olá" } },
    ])
  })

  it("aceita data: sem espaço e com espaços extras", async () => {
    const stream = streamOf([
      'data:{"type":"sem-espaco"}\n\n',
      'data:      {"type":"com-espacos"}\n\n',
    ])

    await expect(collect(stream, liveSignal())).resolves.toEqual([
      { type: "sem-espaco" },
      { type: "com-espacos" },
    ])
  })

  it("ignora campos que não são data: no meio do frame", async () => {
    const stream = streamOf(['event: message\nid: 42\ndata: {"type":"custom"}\n\n'])

    await expect(collect(stream, liveSignal())).resolves.toEqual([{ type: "custom" }])
  })

  it("ignora comentários e heartbeats", async () => {
    const stream = streamOf([
      ": ping\n\n",
      ":keepalive\n\n",
      "event: message\nid: 7\n\n",
      ": heartbeat\ndata: {\"type\":\"depois-do-heartbeat\"}\n\n",
    ])

    await expect(collect(stream, liveSignal())).resolves.toEqual([
      { type: "depois-do-heartbeat" },
    ])
  })

  it("ignora JSON inválido e frames data: vazios", async () => {
    const stream = streamOf([
      "data: {isso não é json\n\n",
      "data: \n\n",
      'data: {"type":}\n\n',
    ])

    await expect(collect(stream, liveSignal())).resolves.toEqual([])
  })

  it("ignora payload sem type string", async () => {
    const stream = streamOf([
      "data: null\n\n",
      "data: 42\n\n",
      'data: "texto"\n\n',
      'data: {"foo":"bar"}\n\n',
      'data: {"type":42}\n\n',
      'data: {"type":null}\n\n',
    ])

    await expect(collect(stream, liveSignal())).resolves.toEqual([])
  })

  it("respeita corte de chunk no meio de um frame", async () => {
    const stream = streamOf([
      'data: {"ty',
      'pe":"message.updated","data":{"n":',
      "1}}\n\n",
    ])

    await expect(collect(stream, liveSignal())).resolves.toEqual([
      { type: "message.updated", data: { n: 1 } },
    ])
  })

  it("processa vários frames no mesmo chunk e completa o frame parcial seguinte", async () => {
    const stream = streamOf([
      `${frame({ type: "a" })}${frame({ type: "b" })}data: {"type":"c"}`,
      "\n\n",
    ])

    await expect(collect(stream, liveSignal())).resolves.toEqual([
      { type: "a" },
      { type: "b" },
      { type: "c" },
    ])
  })

  it("reconstrói caracteres multibyte cortados entre chunks", async () => {
    const full = frame({ type: "message.part", data: { text: "coração ção" } })
    const all = bytes(full)
    const charIndex = full.indexOf("ç")
    // corta no meio dos dois bytes do "ç"
    const cut = bytes(full.slice(0, charIndex)).length + 1
    const stream = streamOf([all.slice(0, cut), all.slice(cut)])

    await expect(collect(stream, liveSignal())).resolves.toEqual([
      { type: "message.part", data: { text: "coração ção" } },
    ])
  })

  it("encerra quando o stream termina e descarta frame sem \\n\\n final", async () => {
    const stream = streamOf([frame({ type: "a" }), 'data: {"type":"incompleto"'])

    await expect(collect(stream, liveSignal())).resolves.toEqual([{ type: "a" }])
  })

  it("faz release do reader ao terminar normalmente", async () => {
    const stream = streamOf([frame({ type: "a" })])
    expect(stream.locked).toBe(false)

    await collect(stream, liveSignal())

    expect(stream.locked).toBe(false)
  })

  it("faz release do reader quando o consumidor para no meio", async () => {
    const { stream, push } = controlledStream()
    push(frame({ type: "a" }))
    push(frame({ type: "b" }))

    const events = await collect(stream, liveSignal(), 1)

    expect(events).toEqual([{ type: "a" }])
    expect(stream.locked).toBe(false)
  })

  it("para de produzir eventos quando o signal é abortado", async () => {
    const { stream, push, close } = controlledStream()
    const controller = new AbortController()
    const iterator = parseSse(stream, controller.signal)

    push(frame({ type: "primeiro" }))
    const first = await iterator.next()
    expect(first.done).toBe(false)
    expect(first.value).toEqual({ type: "primeiro" })

    controller.abort()
    push(frame({ type: "segundo" }))
    close()

    await expect(iterator.next()).resolves.toEqual({ done: true, value: undefined })
    expect(stream.locked).toBe(false)
  })

  it("não lê o stream quando o signal já chega abortado", async () => {
    const { stream, push } = controlledStream()
    const controller = new AbortController()
    controller.abort()
    push(frame({ type: "ignorado" }))

    await expect(collect(stream, controller.signal)).resolves.toEqual([])
    expect(stream.locked).toBe(false)
  })

  it("propaga o erro do body quando o fetch aborta o stream", async () => {
    const { stream, fail } = controlledStream()
    const controller = new AbortController()
    const pending = collect(stream, controller.signal)

    controller.abort()
    fail(new DOMException("The operation was aborted.", "AbortError"))

    await expect(pending).rejects.toThrow(/aborted/i)
    expect(stream.locked).toBe(false)
  })
})
