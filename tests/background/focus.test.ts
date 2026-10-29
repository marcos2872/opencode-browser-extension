import { describe, expect, it, vi } from "vitest"
import { activateTab, shouldBringTabsToFront } from "../../src/background/focus"
import { chromeMock } from "../setup"

async function setConfig(patch: Record<string, unknown> = {}): Promise<void> {
  await chromeMock.storage.local.set({
    "opencode.config": {
      baseUrl: "http://127.0.0.1:4096",
      token: "t",
      permissionMode: "ask",
      ...patch,
    },
  })
}

describe("background/focus", () => {
  describe("shouldBringTabsToFront", () => {
    it("é falso sem configuração", async () => {
      await expect(shouldBringTabsToFront()).resolves.toBe(false)
    })

    it("é falso quando a configuração está desligada", async () => {
      await setConfig({ bringTabsToFront: false })
      await expect(shouldBringTabsToFront()).resolves.toBe(false)
    })

    it("é verdadeiro quando o usuário libera a ativação", async () => {
      await setConfig({ bringTabsToFront: true })
      await expect(shouldBringTabsToFront()).resolves.toBe(true)
    })
  })

  describe("activateTab", () => {
    it("não ativa sem a configuração liberada", async () => {
      await setConfig({ bringTabsToFront: false })
      chromeMock.__state.addTab({ id: 1, active: false })

      await expect(activateTab(1, "teste")).resolves.toBe(false)
      expect(chromeMock.tabs.update).not.toHaveBeenCalled()
      expect(chromeMock.__state.tabs.get(1)?.active).toBe(false)
    })

    it("ativa quando a configuração permite", async () => {
      await setConfig({ bringTabsToFront: true })
      chromeMock.__state.addTab({ id: 1, active: false })

      await expect(activateTab(1, "teste")).resolves.toBe(true)
      expect(chromeMock.tabs.update).toHaveBeenCalledWith(1, { active: true })
      expect(chromeMock.__state.tabs.get(1)?.active).toBe(true)
    })

    it("não chama update quando a aba já está ativa", async () => {
      await setConfig({ bringTabsToFront: true })
      chromeMock.__state.addTab({ id: 1, active: true })

      await expect(activateTab(1, "teste")).resolves.toBe(true)
      expect(chromeMock.tabs.update).not.toHaveBeenCalled()
    })

    it("devolve falso quando a aba não existe", async () => {
      await setConfig({ bringTabsToFront: true })

      await expect(activateTab(99, "teste")).resolves.toBe(false)
      expect(chromeMock.tabs.update).not.toHaveBeenCalled()
    })

    it("devolve falso quando a ativação falha", async () => {
      await setConfig({ bringTabsToFront: true })
      chromeMock.__state.addTab({ id: 1, active: false })
      chromeMock.tabs.update.mockRejectedValueOnce(new Error("sem foco"))

      await expect(activateTab(1, "teste")).resolves.toBe(false)
      expect(chromeMock.__state.tabs.get(1)?.active).toBe(false)
    })
  })
})
