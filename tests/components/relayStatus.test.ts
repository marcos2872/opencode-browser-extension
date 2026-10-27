import { describe, expect, it } from "vitest"
import { describeRelay } from "../../src/components/relayStatus"
import type { RelayState } from "../../src/shared/types"

function state(partial: Partial<RelayState>): RelayState {
  return { connected: false, url: "ws://127.0.0.1:8799", ...partial }
}

describe("describeRelay", () => {
  it("indica o plugin conectado", () => {
    expect(describeRelay(state({ connected: true }))).toBe("Plugin conectado")
  })

  it("explica cada motivo de queda", () => {
    expect(describeRelay(state({ reason: "missing_plugin" }))).toMatch(
      /Plugin não encontrado/,
    )
    expect(describeRelay(state({ reason: "rejected" }))).toMatch(
      /Plugin recusou a conexão/,
    )
    expect(describeRelay(state({ reason: "silent" }))).toMatch(
      /Plugin parou de responder/,
    )
    expect(describeRelay(state({ reason: "closed" }))).toMatch(
      /Plugin desconectado/,
    )
  })

  it("cai no lastError e no texto padrão", () => {
    expect(describeRelay(state({ lastError: "Conexão encerrada (1006)." }))).toBe(
      "Conexão encerrada (1006).",
    )
    expect(describeRelay(state({}))).toBe("Plugin desconectado")
  })
})
