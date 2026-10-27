import { describe, expect, it } from "vitest"
import { sessionStats } from "../../src/sidepanel/sessionStats"
import type { ChatMessage } from "../../src/shared/types"
import { makeMessage, makeModel } from "../helpers/factories"

const model = makeModel({ limit: { context: 200_000 } })

function conversation(...messages: ChatMessage[]): ChatMessage[] {
  return [{ kind: "user", id: "u1", text: "oi", time: 1 }, ...messages]
}

describe("sessionStats", () => {
  it("usa o input da última mensagem e soma o custo", () => {
    const stats = sessionStats(
      conversation(
        makeMessage({
          id: "a1",
          usage: { input: 1_000, output: 100, cost: 0.01 },
        }),
        makeMessage({
          id: "a2",
          usage: { input: 12_000, output: 200, cost: 0.02 },
        }),
      ),
      model,
    )

    expect(stats.contextUsed).toBe(12_000)
    expect(stats.contextLimit).toBe(200_000)
    expect(stats.percent).toBe(6)
    expect(stats.cost).toBeCloseTo(0.03)
  })

  it("cai para o total quando o input não vem", () => {
    const stats = sessionStats(
      conversation(makeMessage({ usage: { total: 900 } })),
      model,
    )
    expect(stats.contextUsed).toBe(900)
  })

  it("omite a porcentagem sem a janela do modelo", () => {
    const stats = sessionStats(
      conversation(makeMessage({ usage: { input: 500 } })),
      null,
    )
    expect(stats.contextUsed).toBe(500)
    expect(stats.contextLimit).toBeUndefined()
    expect(stats.percent).toBeUndefined()
  })

  it("devolve vazio sem mensagens de assistente", () => {
    const stats = sessionStats([], model)
    expect(stats.contextUsed).toBeUndefined()
    expect(stats.cost).toBeUndefined()
    expect(stats.percent).toBeUndefined()
  })

  it("limita a porcentagem a 100", () => {
    const stats = sessionStats(
      conversation(makeMessage({ usage: { input: 250_000 } })),
      model,
    )
    expect(stats.percent).toBe(100)
  })
})
