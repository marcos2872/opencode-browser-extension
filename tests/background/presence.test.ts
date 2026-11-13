import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_STATUS, Presence, type PresenceMessage } from "../../src/background/presence"

let sent: Array<[number, PresenceMessage]>
let delivered: boolean
let busy: Set<string>
let slept: number[]
let presence: Presence

function types(tabId?: number): string[] {
  return sent.filter(([id]) => tabId === undefined || id === tabId).map(([, message]) => message.type)
}

beforeEach(() => {
  vi.useFakeTimers()
  sent = []
  delivered = true
  busy = new Set()
  slept = []
  presence = new Presence({
    send: async (tabId, message) => {
      sent.push([tabId, message])
      return delivered
    },
    isBusy: (sessionID) => busy.has(sessionID),
    idleMs: 1000,
    busyMs: 10_000,
    moveMs: 300,
    sleep: async (ms) => {
      slept.push(ms)
    },
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe("background/presence — show e release", () => {
  it("mostra e atualiza o rótulo da aba", async () => {
    await presence.show(1, "Clicando", true, "s1")

    expect(sent).toEqual([
      [1, { type: "indicator:show" }],
      [1, { type: "indicator:status", text: "Clicando", busy: true }],
    ])
    expect(presence.has(1)).toBe(true)
  })

  it("não esconde logo após a ação: espera o tempo ocioso", async () => {
    await presence.show(1, "Clicando", true, "s1")
    sent.length = 0

    presence.release(1)
    expect(sent).toEqual([[1, { type: "indicator:status", text: "Clicando", busy: false }]])

    await vi.advanceTimersByTimeAsync(999)
    expect(types()).not.toContain("indicator:hide")

    await vi.advanceTimersByTimeAsync(2)
    expect(types()).toContain("indicator:hide")
    expect(presence.has(1)).toBe(false)
  })

  it("nova ação antes do prazo cancela a saída (sem piscar)", async () => {
    await presence.show(1, "Clicando", true, "s1")
    presence.release(1)
    await vi.advanceTimersByTimeAsync(800)

    await presence.show(1, "Digitando", true, "s1")
    await vi.advanceTimersByTimeAsync(5000)

    expect(types()).not.toContain("indicator:hide")
    expect(presence.has(1)).toBe(true)
  })

  it("com a sessão ocupada, aguarda o prazo longo (modelo pensando)", async () => {
    busy.add("s1")
    await presence.show(1, "Clicando", true, "s1")
    presence.release(1)

    await vi.advanceTimersByTimeAsync(5000)
    expect(types()).not.toContain("indicator:hide")

    await vi.advanceTimersByTimeAsync(5100)
    expect(types()).toContain("indicator:hide")
  })

  it("release de aba desconhecida é ignorado", () => {
    presence.release(99)

    expect(sent).toEqual([])
  })
})

describe("background/presence — cursor", () => {
  it("abre o overlay antes de mover quando a aba ainda não estava ativa", async () => {
    await presence.cursor(1, 10, 20, "s1")

    expect(sent.map(([, m]) => m)).toEqual([
      { type: "indicator:show" },
      { type: "indicator:status", text: DEFAULT_STATUS, busy: true },
      { type: "indicator:cursor", x: 10, y: 20 },
    ])
    expect(slept).toEqual([300])
  })

  it("não reabre o overlay quando a aba já está ativa", async () => {
    await presence.show(1, "Lendo", true, "s1")
    sent.length = 0

    await presence.cursor(1, 10, 20, "s1")

    expect(types()).toEqual(["indicator:cursor"])
  })

  it("no clique, espera a viagem e só então anima o clique", async () => {
    const order: string[] = []
    presence = new Presence({
      send: async (_tabId, message) => {
        order.push(message.type)
        return true
      },
      moveMs: 300,
      sleep: async () => {
        order.push("sleep")
      },
    })

    await presence.cursor(1, 10, 20, "s1", true)

    expect(order.slice(-3)).toEqual(["indicator:cursor", "sleep", "indicator:click"])
  })

  it("sem clique, não envia indicator:click", async () => {
    await presence.cursor(1, 10, 20, "s1")

    expect(types()).not.toContain("indicator:click")
  })

  it("sem content script na aba, não espera nem anima", async () => {
    delivered = false

    await presence.cursor(1, 10, 20, "s1", true)

    expect(slept).toEqual([])
    expect(types()).not.toContain("indicator:click")
  })

  it("agenda a saída sozinho (hover não chama release)", async () => {
    await presence.cursor(1, 10, 20, "s1")

    await vi.advanceTimersByTimeAsync(1100)

    expect(types()).toContain("indicator:hide")
    expect(presence.has(1)).toBe(false)
  })

  it("o show seguinte ao cursor cancela a saída agendada", async () => {
    await presence.cursor(1, 10, 20, "s1", true)
    await presence.show(1, "Clicando", true, "s1")

    await vi.advanceTimersByTimeAsync(5000)

    expect(types()).not.toContain("indicator:hide")
  })
})

describe("background/presence — restore, hide e forget", () => {
  it("restaura borda e rótulo depois de navegar", async () => {
    await presence.show(1, "Digitando", true, "s1")
    sent.length = 0

    await presence.restore(1)

    expect(sent.map(([, m]) => m)).toEqual([
      { type: "indicator:show" },
      { type: "indicator:status", text: "Digitando", busy: true },
    ])
  })

  it("restore de aba desconhecida não envia nada", async () => {
    await presence.restore(5)

    expect(sent).toEqual([])
  })

  it("hide esconde na hora e cancela o timer", async () => {
    await presence.show(1, "Clicando", true, "s1")
    presence.release(1)
    sent.length = 0

    await presence.hide(1)
    await vi.advanceTimersByTimeAsync(20_000)

    expect(types()).toEqual(["indicator:hide"])
    expect(presence.has(1)).toBe(false)
  })

  it("hide de aba desconhecida não envia nada", async () => {
    await presence.hide(7)

    expect(sent).toEqual([])
  })

  it("hideSession esconde só as abas da sessão", async () => {
    await presence.show(1, "a", true, "s1")
    await presence.show(2, "b", true, "s2")
    await presence.show(3, "c", true, "s1")
    sent.length = 0

    await presence.hideSession("s1")

    expect(sent.map(([id]) => id).sort()).toEqual([1, 3])
    expect(presence.has(2)).toBe(true)
  })

  it("hideAll esconde todas as abas", async () => {
    await presence.show(1, "a", true, "s1")
    await presence.show(2, "b", true, "s2")
    sent.length = 0

    await presence.hideAll()

    expect(types()).toEqual(["indicator:hide", "indicator:hide"])
  })

  it("forget descarta a aba sem enviar nada", async () => {
    await presence.show(1, "a", true, "s1")
    presence.release(1)
    sent.length = 0

    presence.forget(1)
    await vi.advanceTimersByTimeAsync(20_000)

    expect(sent).toEqual([])
    expect(presence.has(1)).toBe(false)
  })
})
