import { describe, expect, it, vi } from "vitest"
import { request } from "../../src/sidepanel/api"

describe("sidepanel/api", () => {
  it("devolve a resposta do service worker", async () => {
    chrome.runtime.sendMessage.mockResolvedValueOnce({ ok: true, snapshot: null })
    await expect(request({ type: "state:get" })).resolves.toEqual({ ok: true, snapshot: null })
  })

  it("trata resposta vazia", async () => {
    chrome.runtime.sendMessage.mockResolvedValueOnce(undefined)
    await expect(request({ type: "state:get" })).resolves.toEqual({
      ok: false,
      error: "O service worker não respondeu.",
    })
  })

  it("converte exceção em erro amigável", async () => {
    chrome.runtime.sendMessage.mockRejectedValueOnce(new Error("porta fechada"))
    await expect(request({ type: "state:get" })).resolves.toEqual({ ok: false, error: "porta fechada" })
  })

  it("converte valores não-Error em texto", async () => {
    chrome.runtime.sendMessage.mockRejectedValueOnce("falha crua")
    await expect(request({ type: "state:get" })).resolves.toEqual({ ok: false, error: "falha crua" })
  })

  it("repassa o pedido para o service worker", async () => {
    chrome.runtime.sendMessage.mockResolvedValueOnce({ ok: true })
    await request({ type: "prompt", text: "olá" })
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: "prompt", text: "olá" })
    vi.restoreAllMocks()
  })
})
