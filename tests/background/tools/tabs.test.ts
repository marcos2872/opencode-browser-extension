import { describe, expect, it, vi } from "vitest"
import { tabContext, tabsTools, withIndicator } from "../../../src/background/tools/tabs"
import { makeToolContext } from "../../helpers/factories"

describe("background/tools/tabs", () => {
  describe("tabContext", () => {
    it("inclui o grupo da sessão e a lista de abas", async () => {
      const { ctx } = makeToolContext()
      const output = JSON.parse(await tabContext(ctx, 42))

      expect(output).toEqual({
        currentTabId: 42,
        tabGroupId: 100,
        availableTabs: [{ tabId: 1, title: "Aba", url: "https://example.com/" }],
        tabCount: 1,
      })
    })

    it("omite o grupo quando não é finito", async () => {
      const { ctx, tabs } = makeToolContext()
      tabs.groupOf.mockResolvedValue(Number.NaN)

      const output = JSON.parse(await tabContext(ctx, 1))
      expect(output).not.toHaveProperty("tabGroupId")
      expect(output.currentTabId).toBe(1)
    })
  })

  describe("tabs_context", () => {
    it("lista as abas e escolhe a aba ativa", async () => {
      const { ctx, tabs } = makeToolContext()
      tabs.list.mockResolvedValue([
        { id: 1, title: "Primeira", url: "https://a.com/", active: false },
        { id: 2, title: "Ativa", url: "https://b.com/", active: true },
      ])

      const result = await tabsTools.tabs_context({}, ctx)
      const output = JSON.parse(result.content)

      expect(output.tabGroupId).toBe(100)
      expect(output.currentTabId).toBe(2)
      expect(output.tabCount).toBe(2)
      expect(output.availableTabs).toEqual([
        { tabId: 1, title: "Primeira", url: "https://a.com/" },
        { tabId: 2, title: "Ativa", url: "https://b.com/" },
      ])
      expect(tabs.ensure).not.toHaveBeenCalled()
    })

    it("usa a primeira aba quando nenhuma está ativa", async () => {
      const { ctx, tabs } = makeToolContext()
      tabs.list.mockResolvedValue([{ id: 9, title: "X", url: "https://x.com/", active: false }])

      const output = JSON.parse((await tabsTools.tabs_context({}, ctx)).content)
      expect(output.currentTabId).toBe(9)
    })

    it("omite currentTabId quando não há abas", async () => {
      const { ctx, tabs } = makeToolContext()
      tabs.list.mockResolvedValue([])
      tabs.groupOf.mockResolvedValue(null)

      const output = JSON.parse((await tabsTools.tabs_context({}, ctx)).content)
      expect(output).not.toHaveProperty("currentTabId")
      expect(output).not.toHaveProperty("tabGroupId")
      expect(output.tabCount).toBe(0)
    })

    it("cria a aba quando createIfEmpty e o grupo está vazio", async () => {
      const { ctx, tabs } = makeToolContext()
      tabs.list
        .mockResolvedValueOnce([])
        .mockResolvedValue([{ id: 5, title: "Nova", url: "about:blank", active: true }])

      const output = JSON.parse((await tabsTools.tabs_context({ createIfEmpty: true }, ctx)).content)

      expect(tabs.ensure).toHaveBeenCalledWith("ses_test")
      expect(tabs.list).toHaveBeenCalledTimes(2)
      expect(output.currentTabId).toBe(5)
      expect(output.tabCount).toBe(1)
    })

    it("aceita o alias create_if_empty", async () => {
      const { ctx, tabs } = makeToolContext()
      tabs.list.mockResolvedValueOnce([]).mockResolvedValue([{ id: 6, title: "Nova", url: "about:blank", active: true }])

      await tabsTools.tabs_context({ create_if_empty: true }, ctx)
      expect(tabs.ensure).toHaveBeenCalledTimes(1)
    })
  })

  describe("tabs_create", () => {
    it("cria aba em about:blank ativa por padrão", async () => {
      const { ctx, tabs } = makeToolContext()

      const result = await tabsTools.tabs_create({}, ctx)

      expect(tabs.createTab).toHaveBeenCalledWith("ses_test", "about:blank", true)
      expect(result.metadata).toEqual({ tabId: 2 })
      expect(result.content).toContain("Aba criada. Tab ID: 2")
    })

    it("respeita url e active=false", async () => {
      const { ctx, tabs } = makeToolContext()

      await tabsTools.tabs_create({ url: "https://nova.com/", active: false }, ctx)

      expect(tabs.createTab).toHaveBeenCalledWith("ses_test", "https://nova.com/", false)
    })

    it("ignora url vazia", async () => {
      const { ctx, tabs } = makeToolContext()
      await tabsTools.tabs_create({ url: "" }, ctx)
      expect(tabs.createTab).toHaveBeenCalledWith("ses_test", "about:blank", true)
    })
  })

  describe("tabs_close", () => {
    it("exige tabId", async () => {
      const { ctx } = makeToolContext()
      await expect(tabsTools.tabs_close({}, ctx)).rejects.toThrow("Parâmetro obrigatório ausente: tabId.")
    })

    it("respeita a negação do usuário", async () => {
      const { ctx, ask, tabs } = makeToolContext()
      chrome.__state.addTab({ id: 5, title: "Alvo", url: "https://alvo.com/" })
      ask.mockResolvedValue(false)

      const result = await tabsTools.tabs_close({ tabId: 5 }, ctx)

      expect(result.content).toBe("Ação negada pelo usuário. Nenhuma aba foi fechada.")
      expect(tabs.closeTab).not.toHaveBeenCalled()
    })

    it("fecha a aba aprovada e lista as restantes", async () => {
      const { ctx, ask, tabs } = makeToolContext()
      const target = chrome.__state.addTab({ title: "Alvo", url: "https://alvo.com/" })

      const result = await tabsTools.tabs_close({ tabId: target.id }, ctx)

      expect(ask).toHaveBeenCalledWith({
        kind: "action",
        tool: "tabs_close",
        title: "Fechar aba",
        detail: "Alvo",
        url: "https://alvo.com/",
      })
      expect(tabs.closeTab).toHaveBeenCalledWith("ses_test", target.id)
      expect(result.content).toContain(`Aba ${target.id} fechada. 1 aba(s) restante(s).`)
      expect(JSON.parse(result.content.split("\n\n")[1])).toEqual({
        availableTabs: [{ tabId: 1, title: "Aba", url: "https://example.com/" }],
        tabCount: 1,
      })
    })

    it("usa o título padrão quando a aba não existe", async () => {
      const { ctx, ask } = makeToolContext()
      await tabsTools.tabs_close({ tabId: 77 }, ctx)
      expect(ask).toHaveBeenCalledWith(expect.objectContaining({ detail: "Aba 77", url: undefined }))
    })

    it("propaga erro de aba fora do grupo", async () => {
      const { ctx, tabs } = makeToolContext()
      tabs.closeTab.mockRejectedValue(new Error("A aba não pertence ao grupo desta sessão."))

      await expect(tabsTools.tabs_close({ tabId: 5 }, ctx)).rejects.toThrow(
        "A aba não pertence ao grupo desta sessão.",
      )
    })
  })

  describe("tabs_attach", () => {
    it("anexa a aba informada após aprovação", async () => {
      const { ctx, ask, tabs } = makeToolContext()
      const target = chrome.__state.addTab({ title: "Docs", url: "https://docs.example.com/" })

      const result = await tabsTools.tabs_attach({ tabId: target.id }, ctx)

      expect(ask).toHaveBeenCalledWith({
        kind: "action",
        tool: "tabs_attach",
        title: "Dar acesso a esta aba ao agente",
        detail: "Docs",
        url: "https://docs.example.com/",
      })
      expect(tabs.addTab).toHaveBeenCalledWith("ses_test", target.id)
      expect(result.metadata).toEqual({ tabId: target.id })
      expect(result.content).toContain("Aba anexada ao grupo desta sessão.")
    })

    it("usa a aba ativa quando tabId não é informado", async () => {
      const { ctx, tabs } = makeToolContext()
      chrome.__state.addTab({ url: "https://inativa.com/", active: false })
      const active = chrome.__state.addTab({ url: "https://ativa.com/", active: true })

      const result = await tabsTools.tabs_attach({}, ctx)

      expect(chrome.tabs.query).toHaveBeenCalledWith({ active: true, lastFocusedWindow: true })
      expect(tabs.addTab).toHaveBeenCalledWith("ses_test", active.id)
      expect(result.metadata).toEqual({ tabId: active.id })
    })

    it("lança erro quando não há aba ativa", async () => {
      const { ctx } = makeToolContext()
      chrome.tabs.query.mockResolvedValue([])

      await expect(tabsTools.tabs_attach({}, ctx)).rejects.toThrow("Nenhuma aba ativa encontrada para anexar.")
    })

    it("lança erro quando a aba não existe", async () => {
      const { ctx } = makeToolContext()
      await expect(tabsTools.tabs_attach({ tabId: 404 }, ctx)).rejects.toThrow("Aba não encontrada.")
    })

    it("recusa abas que não são http(s)", async () => {
      const { ctx } = makeToolContext()
      const tab = chrome.__state.addTab({ url: "chrome://extensions" })

      await expect(tabsTools.tabs_attach({ tabId: tab.id }, ctx)).rejects.toThrow(
        "Só é possível anexar abas http(s).",
      )
    })

    it("respeita a negação do usuário", async () => {
      const { ctx, ask, tabs } = makeToolContext()
      const tab = chrome.__state.addTab({ url: "https://x.com/" })
      ask.mockResolvedValue(false)

      const result = await tabsTools.tabs_attach({ tabId: tab.id }, ctx)

      expect(result.content).toBe("Anexação negada pelo usuário.")
      expect(tabs.addTab).not.toHaveBeenCalled()
    })
  })

  describe("navigate", () => {
    it("adiciona https:// quando falta o protocolo", async () => {
      const { ctx } = makeToolContext()
      chrome.__state.addTab({ id: 1, url: "https://exemplo.com/", status: "complete" })

      const result = await tabsTools.navigate({ url: "exemplo.com/pagina" }, ctx)

      expect(chrome.tabs.update).toHaveBeenCalledWith(1, { url: "https://exemplo.com/pagina" })
      expect(result.content).toContain("Navegou para https://exemplo.com/pagina")
    })

    it("mantém a URL com protocolo explícito", async () => {
      const { ctx } = makeToolContext()
      chrome.__state.addTab({ id: 1, url: "https://exemplo.com/", status: "complete" })

      await tabsTools.navigate({ url: "http://outro.com/x" }, ctx)

      expect(chrome.tabs.update).toHaveBeenCalledWith(1, { url: "http://outro.com/x" })
    })

    it("rejeita URL inválida", async () => {
      const { ctx } = makeToolContext()
      await expect(tabsTools.navigate({ url: "https://[invalido" }, ctx)).rejects.toThrow(
        "URL inválida: https://[invalido",
      )
      expect(chrome.tabs.update).not.toHaveBeenCalled()
    })

    it("rejeita protocolos que não são http(s)", async () => {
      const { ctx } = makeToolContext()
      await expect(tabsTools.navigate({ url: "chrome://settings" }, ctx)).rejects.toThrow(
        "Só é permitido navegar para http(s).",
      )
    })

    it("exige url ou direction", async () => {
      const { ctx } = makeToolContext()
      await expect(tabsTools.navigate({}, ctx)).rejects.toThrow("Informe `url` ou `direction` (back/forward).")
      await expect(tabsTools.navigate({ url: "   " }, ctx)).rejects.toThrow(
        "Informe `url` ou `direction` (back/forward).",
      )
    })

    it("usa kind action quando o domínio não muda", async () => {
      const { ctx, ask } = makeToolContext()
      chrome.__state.addTab({ id: 1, url: "https://exemplo.com/a", status: "complete" })

      await tabsTools.navigate({ url: "https://exemplo.com/b" }, ctx)

      expect(ask).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "action",
          tool: "navigate",
          title: "Navegar para exemplo.com",
          fromDomain: "exemplo.com",
          toDomain: "exemplo.com",
        }),
      )
    })

    it("pede aprovação de domínio quando o host muda", async () => {
      const { ctx, ask } = makeToolContext()
      chrome.__state.addTab({ id: 1, url: "https://antigo.com/a", status: "complete" })

      await tabsTools.navigate({ url: "https://novo.com/b" }, ctx)

      expect(ask).toHaveBeenCalledWith({
        kind: "domain",
        tool: "navigate",
        title: "Navegar de antigo.com para novo.com",
        detail: "https://novo.com/b",
        url: "https://novo.com/b",
        fromDomain: "antigo.com",
        toDomain: "novo.com",
      })
    })

    it("respeita a negação do usuário", async () => {
      const { ctx, ask } = makeToolContext()
      ask.mockResolvedValue(false)

      const result = await tabsTools.navigate({ url: "https://exemplo.com/" }, ctx)

      expect(result.content).toBe("Navegação negada pelo usuário.")
      expect(chrome.tabs.update).not.toHaveBeenCalled()
    })

    it("navega para trás", async () => {
      const { ctx } = makeToolContext()
      chrome.__state.addTab({ id: 1, url: "https://exemplo.com/", status: "complete" })

      const result = await tabsTools.navigate({ direction: "back" }, ctx)

      expect(chrome.tabs.goBack).toHaveBeenCalledWith(1)
      expect(chrome.tabs.goForward).not.toHaveBeenCalled()
      expect(result.content).toBe("Navegou para trás a partir de https://exemplo.com/.")
    })

    it("navega para frente", async () => {
      const { ctx } = makeToolContext()
      chrome.__state.addTab({ id: 1, url: "https://exemplo.com/", status: "complete" })

      const result = await tabsTools.navigate({ direction: "forward" }, ctx)

      expect(chrome.tabs.goForward).toHaveBeenCalledWith(1)
      expect(result.content).toBe("Navegou para frente a partir de https://exemplo.com/.")
    })

    it("aguarda o evento onUpdated até status complete", async () => {
      const { ctx } = makeToolContext()
      chrome.__state.addTab({ id: 1, url: "https://exemplo.com/", status: "loading" })

      const promise = tabsTools.navigate({ url: "https://exemplo.com/proxima" }, ctx)
      await vi.waitFor(() => expect(chrome.tabs.onUpdated.listeners).toHaveLength(1))
      chrome.tabs.onUpdated.emit(999, { status: "loading" })
      chrome.tabs.onUpdated.emit(1, { status: "complete" })
      const result = await promise

      expect(chrome.tabs.update).toHaveBeenCalledWith(1, { url: "https://exemplo.com/proxima" })
      expect(chrome.tabs.onUpdated.listeners).toHaveLength(0)
      expect(result.content).toContain("Navegou para https://exemplo.com/proxima")
    })

    it("propaga erro quando a atualização da aba falha", async () => {
      const { ctx } = makeToolContext()
      chrome.tabs.update.mockRejectedValue(new Error("sem permissão"))

      await expect(tabsTools.navigate({ url: "https://x.com/" }, ctx)).rejects.toThrow("sem permissão")
    })

    it("segue em frente quando a aba desaparece e o carregamento expira", async () => {
      vi.useFakeTimers()
      try {
        const { ctx } = makeToolContext()
        const tab = chrome.__state.addTab({ url: "https://exemplo.com/", status: "complete" })
        chrome.tabs.get.mockResolvedValueOnce(tab).mockRejectedValueOnce(new Error("aba sumiu"))

        const promise = tabsTools.navigate({ direction: "back" }, ctx)
        await vi.advanceTimersByTimeAsync(0)
        await vi.runAllTimersAsync()
        const result = await promise

        expect(chrome.tabs.goBack).toHaveBeenCalledWith(1)
        expect(result.content).toBe("Navegou para trás a partir de https://exemplo.com/.")
        expect(chrome.tabs.onUpdated.listeners).toHaveLength(0)
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe("resize_window", () => {
    it("redimensiona arredondando largura e altura", async () => {
      const { ctx } = makeToolContext()
      chrome.__state.addTab({ id: 1, url: "https://x.com/", windowId: 7 })

      const result = await tabsTools.resize_window({ width: 800.4, height: 600.6 }, ctx)

      expect(chrome.windows.update).toHaveBeenCalledWith(7, { width: 800, height: 601 })
      expect(result.content).toBe("Janela redimensionada para 800x601.")
    })

    it("exige width e height", async () => {
      const { ctx } = makeToolContext()
      chrome.__state.addTab({ id: 1, windowId: 7 })

      await expect(tabsTools.resize_window({ width: 800 }, ctx)).rejects.toThrow("Informe width e height.")
      await expect(tabsTools.resize_window({ height: 600 }, ctx)).rejects.toThrow("Informe width e height.")
      await expect(tabsTools.resize_window({}, ctx)).rejects.toThrow("Informe width e height.")
      expect(chrome.windows.update).not.toHaveBeenCalled()
    })

    it("lança erro para aba sem janela", async () => {
      const { ctx } = makeToolContext()
      chrome.__state.addTab({ id: 1, windowId: 0 })

      await expect(tabsTools.resize_window({ width: 800, height: 600 }, ctx)).rejects.toThrow("Aba sem janela.")
    })

    it("propaga erro quando a aba não existe", async () => {
      const { ctx } = makeToolContext()
      await expect(tabsTools.resize_window({ width: 800, height: 600 }, ctx)).rejects.toThrow("No tab with id: 1")
    })
  })

  describe("withIndicator", () => {
    it("mostra e esconde o indicador ao redor da tarefa", async () => {
      const { ctx, indicator, hideIndicator } = makeToolContext()

      const result = await withIndicator(ctx, 3, "Trabalhando", async () => "valor")

      expect(indicator).toHaveBeenCalledWith(3, "Trabalhando", true)
      expect(hideIndicator).toHaveBeenCalledWith(3)
      expect(result).toBe("valor")
    })

    it("esconde o indicador mesmo com erro", async () => {
      const { ctx, hideIndicator } = makeToolContext()

      await expect(
        withIndicator(ctx, 3, "Trabalhando", async () => {
          throw new Error("falhou")
        }),
      ).rejects.toThrow("falhou")
      expect(hideIndicator).toHaveBeenCalledWith(3)
    })
  })
})
