import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const gifenc = vi.hoisted(() => {
  const encoder = {
    writeFrame: vi.fn(),
    finish: vi.fn(),
    bytes: vi.fn(() => new Uint8Array([1, 2, 3])),
  }
  return {
    encoder,
    GIFEncoder: vi.fn(() => encoder),
    quantize: vi.fn(() => [[0, 0, 0]]),
    applyPalette: vi.fn(() => new Uint8Array([0])),
  }
})

vi.mock("gifenc", () => ({
  GIFEncoder: gifenc.GIFEncoder,
  quantize: gifenc.quantize,
  applyPalette: gifenc.applyPalette,
}))

type MessageListener = (message: any, sender?: unknown, sendResponse?: (response: any) => void) => unknown

interface FakeBitmap {
  width: number
  height: number
  close: ReturnType<typeof vi.fn>
}

interface FakeAudioContext {
  context: {
    currentTime: number
    destination: unknown
    createOscillator: ReturnType<typeof vi.fn>
    createGain: ReturnType<typeof vi.fn>
  }
  oscillators: Array<{
    type: string
    frequency: { value: number }
    connect: ReturnType<typeof vi.fn>
    start: ReturnType<typeof vi.fn>
    stop: ReturnType<typeof vi.fn>
  }>
  gains: Array<{
    gain: {
      setValueAtTime: ReturnType<typeof vi.fn>
      exponentialRampToValueAtTime: ReturnType<typeof vi.fn>
    }
    connect: ReturnType<typeof vi.fn>
  }>
}

let listener: MessageListener
let canvasContext: Record<string, unknown>
let canvasGetContext: ReturnType<typeof vi.fn>
let createImageBitmap: ReturnType<typeof vi.fn>
let fetchMock: ReturnType<typeof vi.fn>
let audioContextCtor: ReturnType<typeof vi.fn>
let audio: FakeAudioContext
let bitmaps: FakeBitmap[]
let bitmapSize: { width: number; height: number }

function makeAudioContext(): FakeAudioContext {
  const oscillators: FakeAudioContext["oscillators"] = []
  const gains: FakeAudioContext["gains"] = []
  const context = {
    currentTime: 1.5,
    destination: { name: "destination" },
    createOscillator: vi.fn(() => {
      const oscillator = {
        type: "",
        frequency: { value: 0 },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      }
      oscillators.push(oscillator)
      return oscillator
    }),
    createGain: vi.fn(() => {
      const gain = {
        gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        connect: vi.fn(),
      }
      gains.push(gain)
      return gain
    }),
  }
  return { context, oscillators, gains }
}

/** Deixa microtasks e timers fake pendentes assentarem. */
async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0)
}

beforeEach(async () => {
  vi.useFakeTimers()
  vi.resetModules()

  gifenc.GIFEncoder.mockImplementation(() => gifenc.encoder)
  gifenc.encoder.bytes.mockImplementation(() => new Uint8Array([1, 2, 3]))
  gifenc.quantize.mockImplementation(() => [[0, 0, 0]])
  gifenc.applyPalette.mockImplementation(() => new Uint8Array([0]))

  canvasContext = {
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    roundRect: vi.fn(),
    fill: vi.fn(),
    fillText: vi.fn(),
    measureText: vi.fn(() => ({ width: 10 })),
    font: "",
    fillStyle: "",
    textBaseline: "",
  }
  canvasGetContext = vi.fn(() => canvasContext)
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    canvasGetContext as unknown as HTMLCanvasElement["getContext"],
  )

  bitmaps = []
  bitmapSize = { width: 100, height: 50 }
  createImageBitmap = vi.fn(async () => {
    const bitmap: FakeBitmap = { ...bitmapSize, close: vi.fn() }
    bitmaps.push(bitmap)
    return bitmap
  })
  vi.stubGlobal("createImageBitmap", createImageBitmap)

  fetchMock = vi.fn(async () => ({ blob: async () => new Blob() }))
  vi.stubGlobal("fetch", fetchMock)

  audio = makeAudioContext()
  // `function` é necessário para que o mock funcione com `new` (ver aviso do vitest)
  audioContextCtor = vi.fn(function FakeAudioContextConstructor() {
    return audio.context
  })
  vi.stubGlobal("AudioContext", audioContextCtor)

  await import("../src/offscreen")
  listener = chrome.runtime.onMessage.listeners[0] as MessageListener
})

afterEach(() => {
  vi.useRealTimers()
})

describe("offscreen — keepalive", () => {
  it("envia SW_KEEPALIVE a cada 20 segundos", () => {
    vi.advanceTimersByTime(19_999)
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(1)
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: "SW_KEEPALIVE" })

    vi.advanceTimersByTime(40_000)
    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(3)
  })

  it("continua tentando quando sendMessage falha", async () => {
    chrome.runtime.sendMessage.mockRejectedValueOnce(new Error("service worker reiniciando"))

    await vi.advanceTimersByTimeAsync(20_000)
    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(20_000)
    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(2)
  })

  it("registra o listener de mensagens", () => {
    expect(chrome.runtime.onMessage.listeners).toHaveLength(1)
    expect(typeof listener).toBe("function")
  })
})

describe("offscreen — PLAY_NOTIFICATION", () => {
  it("toca dois tons no AudioContext", () => {
    expect(listener({ type: "PLAY_NOTIFICATION" }, {}, vi.fn())).toBeUndefined()

    expect(audioContextCtor).toHaveBeenCalledTimes(1)
    expect(audio.oscillators).toHaveLength(2)
    expect(audio.oscillators.map((oscillator) => oscillator.frequency.value)).toEqual([880, 660])
    expect(audio.oscillators.every((oscillator) => oscillator.type === "sine")).toBe(true)
    expect(audio.oscillators[0]!.start).toHaveBeenCalledWith(1.5)
    expect(audio.oscillators[1]!.start).toHaveBeenCalledWith(1.66)
    expect(audio.oscillators[0]!.stop).toHaveBeenCalledWith(1.66)
    expect(audio.gains).toHaveLength(2)
    expect(audio.gains[0]!.gain.setValueAtTime).toHaveBeenCalledWith(0.0001, 1.5)
    expect(audio.gains[0]!.gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.08, expect.closeTo(1.52, 6))
    expect(audio.gains[0]!.gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.0001, expect.closeTo(1.64, 6))
    expect(audio.oscillators[0]!.connect).toHaveBeenCalledWith(audio.gains[0])
    expect(audio.gains[0]!.connect).toHaveBeenCalledWith(audio.context.destination)
  })

  it("reaproveita o AudioContext entre beeps", () => {
    listener({ type: "PLAY_NOTIFICATION" }, {}, vi.fn())
    listener({ type: "PLAY_NOTIFICATION" }, {}, vi.fn())

    expect(audioContextCtor).toHaveBeenCalledTimes(1)
    expect(audio.oscillators).toHaveLength(4)
  })

  it("não quebra quando o áudio está indisponível", () => {
    vi.stubGlobal(
      "AudioContext",
      vi.fn(function FakeAudioContextConstructor() {
        throw new Error("Autoplay bloqueado")
      }),
    )

    expect(() => listener({ type: "PLAY_NOTIFICATION" }, {}, vi.fn())).not.toThrow()
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled()
  })
})

describe("offscreen — ENCODE_GIF", () => {
  it("devolve erro quando não há quadros", async () => {
    const sendResponse = vi.fn()

    const result = listener({ type: "ENCODE_GIF", frames: [] }, {}, sendResponse)

    expect(result).toBe(true)
    expect(sendResponse).not.toHaveBeenCalled()
    await settle()
    expect(sendResponse).toHaveBeenCalledTimes(1)
    expect(sendResponse).toHaveBeenCalledWith({ error: "Nenhum quadro para codificar." })
    expect(gifenc.GIFEncoder).not.toHaveBeenCalled()
  })

  it("ignora frames que não são uma lista", async () => {
    const sendResponse = vi.fn()

    listener({ type: "ENCODE_GIF", frames: "nada" }, {}, sendResponse)
    await settle()

    expect(sendResponse).toHaveBeenCalledWith({ error: "Nenhum quadro para codificar." })
  })

  it("codifica os quadros e devolve o GIF em base64", async () => {
    const sendResponse = vi.fn()
    const frames = [
      { data: "QUJD", label: "Rótulo do quadro" },
      { data: "REVG" },
    ]

    const result = listener({ type: "ENCODE_GIF", frames, delay: 500 }, {}, sendResponse)

    expect(result).toBe(true)
    expect(sendResponse).not.toHaveBeenCalled()

    await settle()

    expect(sendResponse).toHaveBeenCalledTimes(1)
    const response = sendResponse.mock.calls[0]![0] as { data?: string; error?: string }
    expect(response.error).toBeUndefined()
    expect(atob(response.data ?? "")).toBe(String.fromCharCode(1, 2, 3))

    expect(fetchMock).toHaveBeenCalledWith("data:image/png;base64,QUJD")
    expect(fetchMock).toHaveBeenCalledWith("data:image/png;base64,REVG")
    expect(createImageBitmap).toHaveBeenCalledTimes(2)

    expect(canvasGetContext).toHaveBeenCalledWith("2d", { willReadFrequently: true })
    expect(canvasContext.clearRect).toHaveBeenCalledWith(0, 0, 100, 50)
    expect(canvasContext.drawImage).toHaveBeenCalledWith(bitmaps[0], 0, 0, 100, 50)
    expect(canvasContext.getImageData).toHaveBeenCalledWith(0, 0, 100, 50)

    expect(gifenc.quantize).toHaveBeenCalledWith(new Uint8ClampedArray(4), 256)
    expect(gifenc.applyPalette).toHaveBeenCalledWith(new Uint8ClampedArray(4), [[0, 0, 0]])
    expect(gifenc.encoder.writeFrame).toHaveBeenCalledTimes(2)
    expect(gifenc.encoder.writeFrame).toHaveBeenNthCalledWith(1, new Uint8Array([0]), 100, 50, {
      palette: [[0, 0, 0]],
      delay: 500,
    })
    expect(gifenc.encoder.finish).toHaveBeenCalledTimes(1)

    // rótulo desenhado apenas no primeiro quadro
    expect(canvasContext.measureText).toHaveBeenCalledTimes(1)
    expect(canvasContext.fillText).toHaveBeenCalledTimes(1)
    expect(canvasContext.fillText).toHaveBeenCalledWith("Rótulo do quadro", 16, 30, 10)
    expect(canvasContext.roundRect).toHaveBeenCalledTimes(1)
    expect(canvasContext.save).toHaveBeenCalledTimes(1)
    expect(canvasContext.restore).toHaveBeenCalledTimes(1)

    expect(bitmaps.every((bitmap) => bitmap.close.mock.calls.length === 1)).toBe(true)
  })

  it("usa delay padrão de 600 quando não informado", async () => {
    listener({ type: "ENCODE_GIF", frames: [{ data: "QUJD" }] }, {}, vi.fn())

    await settle()

    expect(gifenc.encoder.writeFrame).toHaveBeenCalledWith(expect.anything(), 100, 50, {
      palette: [[0, 0, 0]],
      delay: 600,
    })
  })

  it("corta o rótulo em 60 caracteres", async () => {
    const label = "l".repeat(80)

    listener({ type: "ENCODE_GIF", frames: [{ data: "QUJD", label }] }, {}, vi.fn())
    await settle()

    expect(canvasContext.fillText).toHaveBeenCalledWith("l".repeat(60), 16, 30, 10)
  })

  it("reduz a escala para caber em 800px de largura", async () => {
    bitmapSize = { width: 1600, height: 900 }

    listener({ type: "ENCODE_GIF", frames: [{ data: "QUJD" }] }, {}, vi.fn())
    await settle()

    expect(gifenc.encoder.writeFrame).toHaveBeenCalledWith(expect.anything(), 800, 450, expect.anything())
  })

  it("usa no mínimo 2px de largura/altura", async () => {
    bitmapSize = { width: 1, height: 1 }

    listener({ type: "ENCODE_GIF", frames: [{ data: "QUJD" }] }, {}, vi.fn())
    await settle()

    expect(gifenc.encoder.writeFrame).toHaveBeenCalledWith(expect.anything(), 2, 2, expect.anything())
  })

  it("codifica em blocos quando os bytes passam de 0x8000", async () => {
    gifenc.encoder.bytes.mockImplementation(() => new Uint8Array(0x8000 + 10).fill(65))
    const sendResponse = vi.fn()

    listener({ type: "ENCODE_GIF", frames: [{ data: "QUJD" }] }, {}, sendResponse)
    await settle()

    const response = sendResponse.mock.calls[0]![0] as { data?: string }
    expect(atob(response.data ?? "")).toHaveLength(0x8000 + 10)
  })

  it("devolve erro quando o canvas não está disponível", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null)
    const sendResponse = vi.fn()

    listener({ type: "ENCODE_GIF", frames: [{ data: "QUJD" }] }, {}, sendResponse)
    await settle()

    expect(sendResponse).toHaveBeenCalledWith({ error: "Canvas indisponível." })
    expect(gifenc.GIFEncoder).not.toHaveBeenCalled()
    expect(bitmaps[0]!.close).toHaveBeenCalledTimes(1)
  })

  it("devolve erro quando createImageBitmap falha", async () => {
    createImageBitmap.mockRejectedValue(new Error("bitmap inválido"))
    const sendResponse = vi.fn()

    listener({ type: "ENCODE_GIF", frames: [{ data: "QUJD" }] }, {}, sendResponse)
    await settle()

    expect(sendResponse).toHaveBeenCalledWith({ error: "bitmap inválido" })
  })

  it("devolve erro quando o fetch falha", async () => {
    fetchMock.mockRejectedValue(new Error("rede caiu"))
    const sendResponse = vi.fn()

    listener({ type: "ENCODE_GIF", frames: [{ data: "QUJD" }] }, {}, sendResponse)
    await settle()

    expect(sendResponse).toHaveBeenCalledWith({ error: "rede caiu" })
  })

  it("devolve erro genérico quando a falha não é um Error", async () => {
    fetchMock.mockRejectedValue("falha estranha")
    const sendResponse = vi.fn()

    listener({ type: "ENCODE_GIF", frames: [{ data: "QUJD" }] }, {}, sendResponse)
    await settle()

    expect(sendResponse).toHaveBeenCalledWith({ error: "Falha ao gerar o GIF." })
  })

  it("fecha os bitmaps já criados quando um quadro posterior falha", async () => {
    createImageBitmap
      .mockImplementationOnce(async () => {
        const bitmap: FakeBitmap = { width: 100, height: 50, close: vi.fn() }
        bitmaps.push(bitmap)
        return bitmap
      })
      .mockRejectedValueOnce(new Error("segundo quadro inválido"))
    const sendResponse = vi.fn()

    listener({ type: "ENCODE_GIF", frames: [{ data: "QUJD" }, { data: "REVG" }] }, {}, sendResponse)
    await settle()

    expect(sendResponse).toHaveBeenCalledWith({ error: "segundo quadro inválido" })
    expect(bitmaps[0]!.close).toHaveBeenCalledTimes(1)
  })
})

describe("offscreen — mensagens desconhecidas", () => {
  it("ignora tipos desconhecidos e mensagens vazias", () => {
    expect(listener({ type: "OUTRO" }, {}, vi.fn())).toBeUndefined()
    expect(listener({}, {}, vi.fn())).toBeUndefined()
    expect(listener(undefined, {}, vi.fn())).toBeUndefined()

    expect(gifenc.GIFEncoder).not.toHaveBeenCalled()
    expect(audioContextCtor).not.toHaveBeenCalled()
  })
})
