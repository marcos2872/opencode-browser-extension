import { describe, expect, it } from "vitest"
import {
  getAllowList,
  getConfig,
  getDenyList,
  setAllowList,
  setConfig,
  setDenyList,
} from "../../src/shared/storage"

describe("shared/storage", () => {
  it("retorna null quando não há configuração salva", async () => {
    await expect(getConfig()).resolves.toBeNull()
  })

  it("salva e recupera a configuração", async () => {
    await setConfig({
      baseUrl: "http://127.0.0.1:49374",
      token: "token-123",
      permissionMode: "ask",
    })
    await expect(getConfig()).resolves.toMatchObject({
      baseUrl: "http://127.0.0.1:49374",
      token: "token-123",
      permissionMode: "ask",
    })
  })

  it("remove a configuração com null", async () => {
    await setConfig({ baseUrl: "http://x", token: "t", permissionMode: "ask" })
    await setConfig(null)
    await expect(getConfig()).resolves.toBeNull()
  })

  it("ignora configuração incompleta", async () => {
    await chrome.storage.local.set({ "opencode.config": { baseUrl: "http://x" } })
    await expect(getConfig()).resolves.toBeNull()
  })

  it("gerencia listas de permitidos e bloqueados sem duplicar", async () => {
    await setAllowList(["example.com", "example.com", "github.com"])
    await expect(getAllowList()).resolves.toEqual(["example.com", "github.com"])

    await setDenyList(["banco.com", "banco.com"])
    await expect(getDenyList()).resolves.toEqual(["banco.com"])
  })

  it("retorna listas vazias quando os valores são inválidos", async () => {
    await chrome.storage.local.set({ "permissions.allow": "não é lista", "permissions.deny": [1, "ok.com"] })
    await expect(getAllowList()).resolves.toEqual([])
    await expect(getDenyList()).resolves.toEqual(["ok.com"])
  })
})
