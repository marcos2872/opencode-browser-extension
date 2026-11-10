import { beforeEach, describe, expect, it, vi } from "vitest"
import { SessionOwnership } from "../../src/background/sessionOwnership"
import { chromeMock } from "../setup"

const STORAGE_KEY = "sessionOwnership"

function storedIds(): string[] {
  return (chromeMock.storage.session.data.get(STORAGE_KEY) as string[] | undefined) ?? []
}

describe("background/sessionOwnership", () => {
  let ownership: SessionOwnership

  beforeEach(() => {
    ownership = new SessionOwnership()
  })

  it("não considera nenhuma sessão antes do init", () => {
    expect(ownership.isOwned("ses_1")).toBe(false)
  })

  it("carrega apenas ids válidos do storage", async () => {
    chromeMock.storage.session.data.set(STORAGE_KEY, ["ses_1", 42, "", null, "ses_2"])
    await ownership.init()

    expect(ownership.isOwned("ses_1")).toBe(true)
    expect(ownership.isOwned("ses_2")).toBe(true)
    expect(ownership.isOwned("42")).toBe(false)
  })

  it("adiciona e persiste sem duplicar", async () => {
    await ownership.add("ses_1")
    await ownership.add("ses_1")

    expect(ownership.isOwned("ses_1")).toBe(true)
    expect(storedIds()).toEqual(["ses_1"])
  })

  it("remove e persiste a remoção", async () => {
    await ownership.add("ses_1")
    await ownership.add("ses_2")
    await ownership.remove("ses_1")

    expect(ownership.isOwned("ses_1")).toBe(false)
    expect(ownership.isOwned("ses_2")).toBe(true)
    expect(storedIds()).toEqual(["ses_2"])
  })

  it("limpa a lista", async () => {
    await ownership.add("ses_1")
    await ownership.clear()

    expect(ownership.isOwned("ses_1")).toBe(false)
    expect(storedIds()).toEqual([])
  })

  it("tolera falha de leitura e de gravação", async () => {
    vi.spyOn(chromeMock.storage.session, "get").mockRejectedValueOnce(new Error("boom"))
    await ownership.init()
    expect(ownership.isOwned("ses_1")).toBe(false)

    vi.spyOn(chromeMock.storage.session, "set").mockRejectedValueOnce(new Error("boom"))
    await expect(ownership.add("ses_1")).resolves.toBeUndefined()
    expect(ownership.isOwned("ses_1")).toBe(true)
  })

  it("repete a leitura depois de uma falha, sem perder ids gravados", async () => {
    vi.spyOn(chromeMock.storage.session, "get").mockRejectedValueOnce(new Error("boom"))
    await ownership.init()
    expect(ownership.isOwned("ses_1")).toBe(false)

    chromeMock.storage.session.data.set(STORAGE_KEY, ["ses_1"])
    await ownership.add("ses_2")

    expect(ownership.isOwned("ses_1")).toBe(true)
    expect(ownership.isOwned("ses_2")).toBe(true)
  })
})
