import { describe, expect, it } from "vitest"
import { SessionStates, createSessionState } from "../../src/background/sessionState"

describe("background/sessionState", () => {
  it("cria estado vazio e reutiliza a mesma instância", () => {
    const states = new SessionStates()
    const first = states.get("ses_1")

    expect(first).toEqual(createSessionState())
    expect(states.get("ses_1")).toBe(first)
    expect(states.peek("ses_2")).toBeUndefined()
  })

  it("resume ocupado e não lido por sessão", () => {
    const states = new SessionStates()
    states.get("ses_1").busy = true
    states.get("ses_2").unread = true

    expect(states.meta()).toEqual([
      { sessionID: "ses_1", busy: true, unread: false },
      { sessionID: "ses_2", busy: false, unread: true },
    ])
    expect(states.anyBusy()).toBe(true)
  })

  it("descarta a sessão menos usada ao passar do limite", () => {
    const states = new SessionStates(2)
    states.get("ses_1")
    states.get("ses_2")
    states.get("ses_1")
    states.get("ses_3")

    expect(states.peek("ses_1")).toBeDefined()
    expect(states.peek("ses_2")).toBeUndefined()
    expect(states.peek("ses_3")).toBeDefined()
  })

  it("nunca descarta a sessão protegida nem uma execução em andamento", () => {
    const states = new SessionStates(1, (id) => id === "ses_ativa")
    states.get("ses_ativa")
    const busy = states.get("ses_ocupada")
    busy.busy = true
    states.get("ses_nova")

    expect(states.peek("ses_ativa")).toBeDefined()
    expect(states.peek("ses_ocupada")).toBeDefined()
    expect(states.peek("ses_nova")).toBeDefined()
  })

  it("retain remove sessões que não existem mais, preservando a protegida", () => {
    const states = new SessionStates(10, (id) => id === "ses_ativa")
    states.get("ses_ativa")
    states.get("ses_antiga")
    states.get("ses_nova")

    states.retain(["ses_ativa", "ses_nova"])

    expect(states.ids()).toEqual(["ses_ativa", "ses_nova"])
  })

  it("retain preserva uma sessão que ainda está executando", () => {
    const states = new SessionStates(10)
    const running = states.get("ses_executando")
    running.busy = true
    states.get("ses_antiga")

    states.retain(["ses_antiga"])

    expect(states.peek("ses_executando")).toBeDefined()
    expect(states.peek("ses_antiga")).toBeDefined()
  })

  it("não descarta uma sessão com resultado não lido", () => {
    const states = new SessionStates(1, (id) => id === "ses_ativa")
    states.get("ses_ativa")
    const unread = states.get("ses_lida")
    unread.unread = true
    states.get("ses_nova")

    expect(states.peek("ses_lida")).toBeDefined()
    expect(states.peek("ses_nova")).toBeDefined()
  })

  it("remove e limpa estados", () => {
    const states = new SessionStates()
    states.get("ses_1")
    states.get("ses_2")

    states.delete("ses_1")
    expect(states.ids()).toEqual(["ses_2"])

    states.clear()
    expect(states.ids()).toEqual([])
    expect(states.anyBusy()).toBe(false)
  })
})
