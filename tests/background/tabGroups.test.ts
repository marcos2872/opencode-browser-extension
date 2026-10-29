import { beforeEach, describe, expect, it, vi } from "vitest"
import { TabGroups } from "../../src/background/tabGroups"
import { chromeMock } from "../setup"

const STORAGE_KEY = "tabGroups"

interface StoredRecord {
  sessionID: string
  groupId: number
  mainTabId: number
}

function storedRecords(): StoredRecord[] {
  return (chromeMock.storage.session.data.get(STORAGE_KEY) as StoredRecord[] | undefined) ?? []
}

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

function activationUpdates(tabId: number): unknown[] {
  return chromeMock.tabs.update.mock.calls.filter(
    (call) => call[0] === tabId && (call[1] as { active?: boolean }).active === true,
  )
}

describe("background/tabGroups", () => {
  let groups: TabGroups

  beforeEach(() => {
    groups = new TabGroups()
  })

  describe("ensure", () => {
    it("cria aba e grupo com título e cor padrão", async () => {
      const record = await groups.ensure("ses_1")

      expect(record).toEqual({ sessionID: "ses_1", groupId: 100, mainTabId: 1 })
      // A aba reserva nasce em segundo plano para não roubar o foco.
      expect(chromeMock.tabs.create).toHaveBeenCalledWith({
        windowId: 1,
        url: "about:blank",
        active: false,
      })
      expect(chromeMock.__state.tabs.get(record.mainTabId)?.active).toBe(false)
      expect(chromeMock.tabs.group).toHaveBeenCalledWith({ tabIds: [record.mainTabId] })
      expect(chromeMock.tabGroups.update).toHaveBeenCalledWith(record.groupId, {
        title: "OpenCode",
        color: "blue",
        collapsed: false,
      })
      expect(chromeMock.__state.groups.get(record.groupId)).toMatchObject({
        title: "OpenCode",
        color: "blue",
        collapsed: false,
      })
      expect(storedRecords()).toEqual([record])
    })

    it("aceita título customizado e cicla cores", async () => {
      const first = await groups.ensure("ses_1")
      const second = await groups.ensure("ses_2", "Meu Grupo")

      expect(chromeMock.__state.groups.get(first.groupId)?.color).toBe("blue")
      expect(chromeMock.__state.groups.get(second.groupId)).toMatchObject({
        title: "OpenCode · Meu Grupo",
        color: "cyan",
      })
    })

    it("reutiliza o registro e o grupo existentes", async () => {
      const first = await groups.ensure("ses_1")
      const creates = chromeMock.tabs.create.mock.calls.length

      const second = await groups.ensure("ses_1")
      expect(second).toEqual(first)
      expect(chromeMock.tabs.create.mock.calls.length).toBe(creates)
      expect(storedRecords()).toEqual([first])
    })

    it("recria o grupo quando ele sumiu", async () => {
      const first = await groups.ensure("ses_1")
      chromeMock.__state.groups.delete(first.groupId)

      const second = await groups.ensure("ses_1")
      expect(second.groupId).not.toBe(first.groupId)
      expect(chromeMock.__state.groups.get(second.groupId)).toMatchObject({ title: "OpenCode" })
      expect(storedRecords()).toEqual([second])
    })

    it("reatribui a aba principal quando ela sumiu", async () => {
      const first = await groups.ensure("ses_1")
      const other = chromeMock.__state.addTab({ groupId: first.groupId, url: "https://other.com/" })
      chromeMock.__state.tabs.delete(first.mainTabId)

      const again = await groups.ensure("ses_1")
      expect(again.mainTabId).toBe(other.id)
      expect(storedRecords()[0]?.mainTabId).toBe(other.id)
    })

    it("falha quando a aba não pôde ser criada", async () => {
      chromeMock.tabs.create.mockResolvedValueOnce({ id: undefined })
      await expect(groups.ensure("ses_1")).rejects.toThrow("Não foi possível criar a aba do grupo.")
    })

    it("recria sem duplicar o registro quando o grupo existe sem abas", async () => {
      const first = await groups.ensure("ses_1")
      chromeMock.tabs.query.mockResolvedValue([])

      const second = await groups.ensure("ses_1")
      expect(second.groupId).not.toBe(first.groupId)
      expect(storedRecords().filter((record) => record.sessionID === "ses_1")).toHaveLength(1)
      expect(await groups.get("ses_1")).toEqual(second)
    })
  })

  describe("list", () => {
    it("devolve as abas do grupo da sessão", async () => {
      const record = await groups.ensure("ses_1")
      const extra = chromeMock.__state.addTab({
        groupId: record.groupId,
        url: "https://extra.com/",
        title: "Extra",
        active: false,
      })

      const tabs = await groups.list("ses_1")
      expect(tabs).toHaveLength(2)
      expect(tabs[0]).toEqual({
        id: record.mainTabId,
        title: "",
        url: "about:blank",
        active: false,
      })
      expect(tabs[1]).toEqual({ id: extra.id, title: "Extra", url: "https://extra.com/", active: false })
    })

    it("usa pendingUrl quando url está ausente e string vazia quando não há nenhuma", async () => {
      const record = await groups.ensure("ses_1")
      const pending = chromeMock.__state.addTab({ groupId: record.groupId })
      pending.url = null as unknown as string
      pending.pendingUrl = "https://pending.com/"
      const empty = chromeMock.__state.addTab({ groupId: record.groupId })
      empty.url = null as unknown as string

      const tabs = await groups.list("ses_1")
      expect(tabs[1]?.url).toBe("https://pending.com/")
      expect(tabs[2]?.url).toBe("")
    })

    it("devolve vazio sem registro da sessão", async () => {
      await expect(groups.list("ses_x")).resolves.toEqual([])
    })

    it("devolve vazio quando o grupo sumiu", async () => {
      const record = await groups.ensure("ses_1")
      chromeMock.__state.groups.delete(record.groupId)
      await expect(groups.list("ses_1")).resolves.toEqual([])
    })
  })

  describe("resolveTab", () => {
    it("usa a aba principal quando tabId não é informado", async () => {
      const record = await groups.ensure("ses_1")
      await expect(groups.resolveTab("ses_1")).resolves.toEqual({
        tabId: record.mainTabId,
        groupId: record.groupId,
      })
    })

    it("aceita tabId que pertence ao grupo", async () => {
      const record = await groups.ensure("ses_1")
      const other = chromeMock.__state.addTab({ groupId: record.groupId })
      await expect(groups.resolveTab("ses_1", other.id)).resolves.toEqual({
        tabId: other.id,
        groupId: record.groupId,
      })
    })

    it("falha para tabId fora do grupo", async () => {
      await groups.ensure("ses_1")
      const outsider = chromeMock.__state.addTab({ groupId: -1 })
      await expect(groups.resolveTab("ses_1", outsider.id)).rejects.toThrow(
        `A aba ${outsider.id} não pertence ao grupo desta sessão.`,
      )
    })

    it("expande o grupo colapsado antes de resolver a aba", async () => {
      const record = await groups.ensure("ses_1")
      chromeMock.__state.groups.get(record.groupId)!.collapsed = true
      chromeMock.tabGroups.update.mockClear()

      await groups.resolveTab("ses_1")

      expect(chromeMock.tabGroups.update).toHaveBeenCalledWith(record.groupId, {
        collapsed: false,
      })
      // Expandir não ativa a aba.
      expect(activationUpdates(record.mainTabId)).toEqual([])
    })

    it("não mexe no grupo quando ele já está expandido", async () => {
      const record = await groups.ensure("ses_1")
      chromeMock.tabGroups.update.mockClear()

      await groups.resolveTab("ses_1")

      expect(chromeMock.tabGroups.update).not.toHaveBeenCalledWith(record.groupId, {
        collapsed: false,
      })
    })

    it("falha quando o grupo não tem abas", async () => {
      await groups.ensure("ses_1")
      chromeMock.tabs.query.mockResolvedValue([])
      await expect(groups.resolveTab("ses_1")).rejects.toThrow("O grupo desta sessão não tem abas.")
    })
  })

  describe("addTab/createTab/closeTab", () => {
    it("addTab sem grupo cria o grupo com a própria aba, sem about:blank", async () => {
      const outsider = chromeMock.__state.addTab({ groupId: -1, url: "https://app.com/" })

      const groupId = await groups.addTab("ses_1", outsider.id, { makeMain: true })

      expect(chromeMock.tabs.create).not.toHaveBeenCalled()
      expect(chromeMock.__state.tabs.get(outsider.id)?.groupId).toBe(groupId)
      expect(chromeMock.tabGroups.update).toHaveBeenCalledWith(
        groupId,
        expect.objectContaining({ title: "OpenCode" }),
      )
      await expect(groups.currentTabId("ses_1")).resolves.toBe(outsider.id)
    })

    it("addTab com makeMain troca a aba principal sem ativar", async () => {
      await setConfig({ bringTabsToFront: true })
      const record = await groups.ensure("ses_1")
      const outsider = chromeMock.__state.addTab({ groupId: -1 })

      const groupId = await groups.addTab("ses_1", outsider.id, { makeMain: true })

      expect(groupId).toBe(record.groupId)
      expect(chromeMock.tabs.update).not.toHaveBeenCalledWith(outsider.id, { active: true })
      expect(chromeMock.tabs.update).not.toHaveBeenCalled()
      await expect(groups.currentTabId("ses_1")).resolves.toBe(outsider.id)
    })

    it("addTab de aba em outra janela lança e não agrupa", async () => {
      const record = await groups.ensure("ses_1")
      const outsider = chromeMock.__state.addTab({ groupId: -1, windowId: 2 })

      await expect(groups.addTab("ses_1", outsider.id)).rejects.toThrow(/^A aba está em outra janela\./)
      expect(chromeMock.__state.tabs.get(outsider.id)?.groupId).toBe(-1)
      expect(chromeMock.tabs.group).not.toHaveBeenCalledWith({ tabIds: [outsider.id], groupId: record.groupId })
    })

    it("assertAttachable recusa aba de outra janela antes de pedir permissão", async () => {
      const record = await groups.ensure("ses_1")
      const outsider = chromeMock.__state.addTab({ windowId: 2, active: false })

      await expect(groups.assertAttachable("ses_1", outsider.id)).rejects.toThrow(
        /A aba está em outra janela\./,
      )
      expect(record.groupId).toBe(100)
    })

    it("assertAttachable passa quando o grupo está vivo mas sem abas", async () => {
      await groups.ensure("ses_1")
      chromeMock.__state.tabs.clear()

      await expect(groups.assertAttachable("ses_1", 999)).resolves.toBeUndefined()
    })

    it("assertAttachable não bloqueia quando a sessão não tem grupo", async () => {
      await expect(groups.assertAttachable("ses_outra", 1)).resolves.toBeUndefined()
    })

    it("currentTabId é nulo sem sessão registrada", async () => {
      await expect(groups.currentTabId("ses_inexistente")).resolves.toBeNull()
    })

    it("addTab agrupa a aba informada e devolve o grupo", async () => {
      const record = await groups.ensure("ses_1")
      const outsider = chromeMock.__state.addTab({ groupId: -1 })

      const groupId = await groups.addTab("ses_1", outsider.id)
      expect(groupId).toBe(record.groupId)
      expect(chromeMock.tabs.group).toHaveBeenCalledWith({ tabIds: [outsider.id], groupId: record.groupId })
      expect(chromeMock.__state.tabs.get(outsider.id)?.groupId).toBe(record.groupId)
    })

    it("createTab reaproveita a aba em branco do grupo", async () => {
      const record = await groups.ensure("ses_1")
      chromeMock.tabs.create.mockClear()
      const id = await groups.createTab("ses_1", "https://nova.com/", false)

      expect(id).toBe(record.mainTabId)
      expect(chromeMock.tabs.create).not.toHaveBeenCalled()
      expect(chromeMock.tabs.update).toHaveBeenCalledWith(record.mainTabId, {
        url: "https://nova.com/",
      })
      expect(chromeMock.__state.tabs.get(id)).toMatchObject({
        url: "https://nova.com/",
        active: false,
        groupId: record.groupId,
        windowId: 1,
      })
    })

    it("createTab reaproveita a aba principal da mesma base", async () => {
      const record = await groups.ensure("ses_1")
      await chromeMock.tabs.update(record.mainTabId, {
        url: "https://app.com/uma",
      })
      chromeMock.tabs.create.mockClear()
      chromeMock.tabs.update.mockClear()

      const id = await groups.createTab("ses_1", "https://app.com/outra", false)

      expect(id).toBe(record.mainTabId)
      expect(chromeMock.tabs.create).not.toHaveBeenCalled()
      expect(chromeMock.tabs.update).toHaveBeenCalledWith(record.mainTabId, {
        url: "https://app.com/outra",
      })
    })

    it("createTab abre outra aba quando a base é diferente", async () => {
      const record = await groups.ensure("ses_1")
      await chromeMock.tabs.update(record.mainTabId, {
        url: "https://a.com/",
      })
      chromeMock.tabs.create.mockClear()

      const id = await groups.createTab("ses_1", "https://b.com/", false)

      expect(id).not.toBe(record.mainTabId)
      expect(chromeMock.tabs.create).toHaveBeenCalledWith({
        windowId: 1,
        url: "https://b.com/",
        active: false,
      })
      expect(chromeMock.__state.tabs.get(id)?.groupId).toBe(record.groupId)
    })

    it("createTab sem grupo cria a aba já dentro dele sem ativar", async () => {
      const id = await groups.createTab("ses_1", "https://nova.com/", true)

      expect(chromeMock.tabs.create).toHaveBeenCalledWith({
        windowId: 1,
        url: "https://nova.com/",
        active: false,
      })
      expect(activationUpdates(id)).toEqual([])
      expect(chromeMock.__state.tabs.get(id)?.active).toBe(false)
      const record = await groups.get("ses_1")
      expect(record?.mainTabId).toBe(id)
      await expect(groups.currentTabId("ses_1")).resolves.toBe(id)
    })

    it("createTab sem active não ativa a aba mesmo com a config ligada", async () => {
      await setConfig({ bringTabsToFront: true })
      const id = await groups.createTab("ses_1", "https://nova.com/")

      expect(chromeMock.tabs.create).toHaveBeenCalledWith({
        windowId: 1,
        url: "https://nova.com/",
        active: false,
      })
      expect(activationUpdates(id)).toEqual([])
      expect(chromeMock.__state.tabs.get(id)?.active).toBe(false)
    })

    it("createTab com active e bringTabsToFront ligado ativa a aba", async () => {
      await setConfig({ bringTabsToFront: true })
      const id = await groups.createTab("ses_1", "https://nova.com/", true)

      expect(chromeMock.__state.tabs.get(id)?.active).toBe(true)
      expect(activationUpdates(id)).toEqual([[id, { active: true }]])
    })

    it("createTab com active mas sem bringTabsToFront não ativa", async () => {
      const id = await groups.createTab("ses_1", "https://nova.com/", true)

      expect(activationUpdates(id)).toEqual([])
      expect(chromeMock.__state.tabs.get(id)?.active).toBe(false)
    })

    it("createTab com active e bringTabsToFront=false não ativa", async () => {
      await setConfig({ bringTabsToFront: false })
      const id = await groups.createTab("ses_1", "https://nova.com/", true)

      expect(activationUpdates(id)).toEqual([])
      expect(chromeMock.__state.tabs.get(id)?.active).toBe(false)
    })

    it("createTab não reativa a aba que já estava ativa", async () => {
      await setConfig({ bringTabsToFront: true })
      const id = await groups.createTab("ses_1", "https://nova.com/", true)
      chromeMock.tabs.update.mockClear()

      await groups.createTab("ses_1", "https://nova.com/outra", true)

      expect(activationUpdates(id)).toEqual([])
      expect(chromeMock.__state.tabs.get(id)?.active).toBe(true)
    })

    it("createTab ativa a aba principal reaproveitada quando a config permite", async () => {
      await setConfig({ bringTabsToFront: true })
      const record = await groups.ensure("ses_1")

      const id = await groups.createTab("ses_1", "https://app.com/", true)

      expect(id).toBe(record.mainTabId)
      expect(chromeMock.tabs.update).toHaveBeenCalledWith(record.mainTabId, {
        url: "https://app.com/",
      })
      expect(activationUpdates(record.mainTabId)).toHaveLength(1)
      expect(chromeMock.__state.tabs.get(record.mainTabId)?.active).toBe(true)
    })

    it("createTab sem aba principal não passa windowId", async () => {
      const record = await groups.ensure("ses_1")
      await chromeMock.tabs.update(record.mainTabId, {
        url: "https://a.com/",
      })
      chromeMock.__state.addTab({ groupId: record.groupId, url: "https://b.com/" })
      chromeMock.tabs.get.mockRejectedValueOnce(new Error("aba sumiu"))

      const id = await groups.createTab("ses_1", "https://c.com/")
      expect(chromeMock.tabs.create).toHaveBeenCalledWith({
        windowId: undefined,
        url: "https://c.com/",
        active: false,
      })
      expect(chromeMock.__state.tabs.get(id)?.groupId).toBe(record.groupId)
    })

    it("createTab falha quando a aba não pôde ser criada", async () => {
      const record = await groups.ensure("ses_1")
      await chromeMock.tabs.update(record.mainTabId, {
        url: "https://a.com/",
      })
      chromeMock.tabs.create.mockResolvedValueOnce({ id: undefined })
      await expect(groups.createTab("ses_1", "https://b.com/")).rejects.toThrow("Não foi possível criar a aba.")
    })

    it("closeTab remove a aba do grupo", async () => {
      const record = await groups.ensure("ses_1")
      const other = chromeMock.__state.addTab({ groupId: record.groupId })

      await groups.closeTab("ses_1", other.id)
      expect(chromeMock.tabs.remove).toHaveBeenCalledWith(other.id)
      expect(chromeMock.__state.tabs.has(other.id)).toBe(false)
    })

    it("closeTab falha para aba fora do grupo", async () => {
      await groups.ensure("ses_1")
      const outsider = chromeMock.__state.addTab({ groupId: -1 })

      await expect(groups.closeTab("ses_1", outsider.id)).rejects.toThrow(
        "A aba não pertence ao grupo desta sessão.",
      )
      expect(chromeMock.tabs.remove).not.toHaveBeenCalled()
      expect(chromeMock.__state.tabs.has(outsider.id)).toBe(true)
    })
  })

  describe("groupOf", () => {
    it("devolve o id do grupo da sessão", async () => {
      const record = await groups.ensure("ses_1")
      await expect(groups.groupOf("ses_1")).resolves.toBe(record.groupId)
    })

    it("devolve null sem registro ou com grupo inexistente", async () => {
      await expect(groups.groupOf("ses_x")).resolves.toBeNull()

      const record = await groups.ensure("ses_1")
      chromeMock.__state.groups.delete(record.groupId)
      await expect(groups.groupOf("ses_1")).resolves.toBeNull()
    })

    it("devolve null para groupId não finito", async () => {
      await chromeMock.storage.session.set({
        [STORAGE_KEY]: [{ sessionID: "ses_1", groupId: Number.NaN, mainTabId: 1 }],
      })
      await expect(groups.groupOf("ses_1")).resolves.toBeNull()
    })
  })

  describe("load", () => {
    it("ignora registros inválidos no storage", async () => {
      await chromeMock.storage.session.set({
        [STORAGE_KEY]: [
          { sessionID: "ok", groupId: 5, mainTabId: 6 },
          { sessionID: 1, groupId: "x", mainTabId: 2 },
          null,
          "nope",
        ],
      })

      await expect(groups.get("ok")).resolves.toEqual({ sessionID: "ok", groupId: 5, mainTabId: 6 })
      await expect(groups.get("outro")).resolves.toBeNull()
      await expect(groups.list("ok")).resolves.toEqual([])
    })
  })

  describe("cleanup", () => {
    it("desagrupa a aba ativa em branco e remove as inativas de grupos órfãos", async () => {
      const known = await groups.ensure("ses_1")
      const orphan = chromeMock.__state.addGroup({ id: 500, title: "OpenCode" })
      const activeBlank = chromeMock.__state.addTab({
        groupId: orphan.id,
        url: "about:blank",
        active: true,
      })
      const inactiveBlank = chromeMock.__state.addTab({
        groupId: orphan.id,
        url: "chrome://newtab/",
        active: false,
      })
      const knownTab = chromeMock.__state.addTab({ groupId: known.groupId, url: "https://keep.com/" })

      await groups.cleanup()

      // A aba que o usuário está usando nunca é fechada, só sai do grupo.
      expect(chromeMock.tabs.ungroup).toHaveBeenCalledWith(activeBlank.id)
      expect(chromeMock.__state.tabs.get(activeBlank.id)?.groupId).toBe(-1)
      expect(chromeMock.tabs.remove).toHaveBeenCalledWith(inactiveBlank.id)
      expect(chromeMock.__state.tabs.has(inactiveBlank.id)).toBe(false)
      expect(chromeMock.tabs.remove).toHaveBeenCalledTimes(1)
      expect(chromeMock.__state.tabs.has(knownTab.id)).toBe(true)
      expect(chromeMock.__state.tabs.has(known.mainTabId)).toBe(true)
      expect(storedRecords()).toEqual([known])
    })

    it("desagrupa abas reais de grupos órfãos", async () => {
      await groups.ensure("ses_1")
      const orphan = chromeMock.__state.addGroup({ id: 501, title: "OpenCode" })
      const real = chromeMock.__state.addTab({ groupId: orphan.id, url: "https://real.com/" })
      const blank = chromeMock.__state.addTab({ groupId: orphan.id, url: "about:blank" })

      await groups.cleanup()

      expect(chromeMock.__state.tabs.get(real.id)?.groupId).toBe(-1)
      expect(chromeMock.tabs.remove).not.toHaveBeenCalled()
      expect(chromeMock.__state.tabs.has(blank.id)).toBe(true)
    })

    it("ignora grupos que não se chamam OpenCode", async () => {
      await groups.ensure("ses_1")
      const other = chromeMock.__state.addGroup({ id: 502, title: "Outro" })
      const blank = chromeMock.__state.addTab({ groupId: other.id, url: "about:blank" })

      await groups.cleanup()

      expect(chromeMock.__state.tabs.has(blank.id)).toBe(true)
      expect(chromeMock.tabs.remove).not.toHaveBeenCalled()
    })

    it("não quebra quando a consulta de grupos falha", async () => {
      const record = await groups.ensure("ses_1")
      chromeMock.tabGroups.query.mockRejectedValueOnce(new Error("falhou"))

      await expect(groups.cleanup()).resolves.toBeUndefined()
      expect(chromeMock.tabs.remove).not.toHaveBeenCalled()
      expect(chromeMock.__state.tabs.has(record.mainTabId)).toBe(true)
    })
  })

  describe("listeners", () => {
    it("tabs.onRemoved reatribui a aba principal e persiste", async () => {
      const record = await groups.ensure("ses_1")
      const other = chromeMock.__state.addTab({ groupId: record.groupId })
      chromeMock.__state.tabs.delete(record.mainTabId)

      chromeMock.tabs.onRemoved.emit(record.mainTabId, { windowId: 1, isWindowClosing: false })

      await vi.waitFor(() => expect(storedRecords()[0]?.mainTabId).toBe(other.id))
      expect((await groups.get("ses_1"))?.mainTabId).toBe(other.id)
    })

    it("tabs.onRemoved remove o registro quando o grupo ficou vazio", async () => {
      const record = await groups.ensure("ses_1")
      chromeMock.__state.tabs.delete(record.mainTabId)

      chromeMock.tabs.onRemoved.emit(record.mainTabId, { windowId: 1, isWindowClosing: false })

      await vi.waitFor(() => expect(storedRecords()).toEqual([]))
      expect(await groups.get("ses_1")).toBeNull()
    })

    it("tabs.onRemoved ignora abas que não são a principal", async () => {
      const record = await groups.ensure("ses_1")
      const other = chromeMock.__state.addTab({ groupId: record.groupId })

      chromeMock.tabs.onRemoved.emit(other.id, { windowId: 1, isWindowClosing: false })
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect((await groups.get("ses_1"))?.mainTabId).toBe(record.mainTabId)
      expect(storedRecords()).toEqual([record])
    })

    it("tabGroups.onRemoved remove o registro e persiste", async () => {
      const record = await groups.ensure("ses_1")

      chromeMock.tabGroups.onRemoved.emit({ id: record.groupId })

      await vi.waitFor(() => expect(storedRecords()).toEqual([]))
      expect(await groups.get("ses_1")).toBeNull()
    })

    it("tabGroups.onRemoved ignora grupos desconhecidos", async () => {
      const record = await groups.ensure("ses_1")

      chromeMock.tabGroups.onRemoved.emit({ id: 9999 })
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(storedRecords()).toEqual([record])
    })
  })
})

describe("background/tabGroups: sessões paralelas", () => {
  let groups: TabGroups

  beforeEach(() => {
    groups = new TabGroups()
  })

  it("resolve a sessão pelo grupo e pela aba", async () => {
    const record = await groups.ensure("ses_1")
    const page = chromeMock.__state.addTab({
      groupId: record.groupId,
      url: "https://a.example/",
    })

    expect(await groups.sessionOfGroup(record.groupId)).toBe("ses_1")
    expect(await groups.sessionOfTab(page.id)).toBe("ses_1")
  })

  it("devolve null para aba solta e grupo desconhecido", async () => {
    const loose = chromeMock.__state.addTab({ url: "https://solto.example/" })

    expect(await groups.sessionOfTab(loose.id)).toBeNull()
    expect(await groups.sessionOfTab(12345)).toBeNull()
    expect(await groups.sessionOfGroup(999)).toBeNull()
  })

  it("setLabel usa o nome da sessão no título do grupo", async () => {
    const record = await groups.ensure("ses_1")

    await groups.setLabel("ses_1", "  Revisão   do PR ")
    expect(chromeMock.__state.groups.get(record.groupId)?.title).toBe(
      "OpenCode · Revisão do PR",
    )

    await groups.setLabel("ses_1", undefined)
    expect(chromeMock.__state.groups.get(record.groupId)?.title).toBe("OpenCode")
  })

  it("release fecha abas em branco e desagrupa páginas", async () => {
    const record = await groups.ensure("ses_1")
    const page = chromeMock.__state.addTab({
      groupId: record.groupId,
      url: "https://a.example/",
    })

    await groups.release("ses_1")

    expect(chromeMock.__state.tabs.has(record.mainTabId)).toBe(false)
    expect(chromeMock.__state.tabs.get(page.id)?.groupId).toBe(-1)
    expect(storedRecords()).toEqual([])
  })

  it("cleanup reconhece grupos com nome de sessão e preserva os demais", async () => {
    const managed = chromeMock.__state.addGroup({ title: "OpenCode · Conversa" })
    const foreign = chromeMock.__state.addGroup({ title: "Trabalho" })
    const blank = chromeMock.__state.addTab({
      groupId: managed.id,
      url: "about:blank",
      active: false,
    })
    const page = chromeMock.__state.addTab({ groupId: foreign.id, url: "https://x.example/" })

    await groups.cleanup()

    expect(chromeMock.__state.tabs.has(blank.id)).toBe(false)
    expect(chromeMock.__state.tabs.has(page.id)).toBe(true)
  })
})

describe("background/tabGroups: falha ao criar grupo", () => {
  let groups: TabGroups

  beforeEach(() => {
    groups = new TabGroups()
  })

  it("remove a aba criada quando o grupo não consolida", async () => {
    chromeMock.tabGroups.update.mockRejectedValueOnce(new Error("falhou"))

    await expect(groups.ensure("ses_1")).rejects.toThrow("falhou")

    expect(chromeMock.__state.tabs.size).toBe(0)
    expect(storedRecords()).toEqual([])
  })
})
