import { describe, expect, it } from "vitest"

describe("content/index", () => {
  it("instala a ponte de acessibilidade e o indicador", async () => {
    await import("../../src/content/index")

    const api = (window as unknown as { __opencodeA11y?: unknown }).__opencodeA11y
    expect(api).toBeTruthy()
    expect(chrome.runtime.onMessage.listeners.length).toBeGreaterThan(0)
  })
})
