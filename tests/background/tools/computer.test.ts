import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { a11yMock, resetA11yMock } from "./helpers/a11y-mock"
import { computerTools } from "../../../src/background/tools/computer"
import { makeToolContext, type ToolContextMocks } from "../../helpers/factories"

vi.mock("../../../src/background/tools/a11y", () => a11yMock)

const ELEMENT = {
  ref: "ref_1",
  role: "button",
  name: "Botão",
  tag: "button",
  rect: { x: 10, y: 20, width: 30, height: 40 },
  x: 10,
  y: 20,
}

function makeMocks(): ToolContextMocks {
  return makeToolContext()
}

beforeEach(() => {
  resetA11yMock()
  chrome.__state.addTab({ id: 1, url: "https://example.com/", title: "Exemplo", status: "complete" })
})

afterEach(() => {
  vi.useRealTimers()
})

describe("background/tools/computer", () => {
  describe("wait", () => {
    async function runWait(args: Record<string, unknown>, mocks: ToolContextMocks) {
      vi.useFakeTimers()
      const promise = computerTools.computer(args, mocks.ctx)
      await vi.advanceTimersByTimeAsync(11_000)
      return promise
    }

    it("usa 1s por padrão", async () => {
      const mocks = makeMocks()
      const result = await runWait({ action: "wait" }, mocks)
      expect(result.content).toBe("Aguardou 1s.")
      expect(mocks.indicator).toHaveBeenCalledWith(1, "Aguardando 1s", true)
      expect(mocks.hideIndicator).toHaveBeenCalledWith(1)
    })

    it("limita a duração mínima em 0.1s", async () => {
      const mocks = makeMocks()
      await expect(runWait({ action: "wait", duration: 0.01 }, mocks)).resolves.toEqual({
        content: "Aguardou 0.1s.",
      })
      await expect(runWait({ action: "wait", duration: -5 }, mocks)).resolves.toEqual({
        content: "Aguardou 0.1s.",
      })
    })

    it("limita a duração máxima em 10s", async () => {
      const mocks = makeMocks()
      const result = await runWait({ action: "wait", duration: 99 }, mocks)
      expect(result.content).toBe("Aguardou 10s.")
      expect(mocks.indicator).toHaveBeenCalledWith(1, "Aguardando 10s", true)
    })

    it("ignora durações inválidas", async () => {
      const mocks = makeMocks()
      await expect(runWait({ action: "wait", duration: "5" }, mocks)).resolves.toEqual({
        content: "Aguardou 1s.",
      })
    })
  })

  describe("screenshot", () => {
    it("captura e devolve a imagem", async () => {
      const mocks = makeMocks()
      mocks.cdp.screenshot.mockResolvedValue("YmFzZTY0")

      const result = await computerTools.computer({ action: "screenshot" }, mocks.ctx)

      expect(mocks.ask).toHaveBeenCalledWith({
        kind: "action",
        tool: "computer",
        title: "Tirar screenshot",
        detail: "Exemplo",
        url: "https://example.com/",
      })
      expect(mocks.cdp.screenshot).toHaveBeenCalledWith(1)
      expect(result.content).toBe("Screenshot capturado (Exemplo).")
      expect(result.images).toEqual([
        { name: expect.stringMatching(/^screenshot-\d+\.png$/), mime: "image/png", data: "YmFzZTY0" },
      ])
    })

    it("respeita a negação do usuário", async () => {
      const mocks = makeMocks()
      mocks.ask.mockResolvedValue(false)

      const result = await computerTools.computer({ action: "screenshot" }, mocks.ctx)

      expect(result.content).toBe("Screenshot negado pelo usuário.")
      expect(mocks.cdp.screenshot).not.toHaveBeenCalled()
    })
  })

  describe("zoom", () => {
    it("captura a região informada com escala 2", async () => {
      const mocks = makeMocks()
      mocks.cdp.screenshot.mockResolvedValue("emNvb20=")

      const result = await computerTools.computer({ action: "zoom", region: [200, 300, 100, 150] }, mocks.ctx)

      expect(mocks.cdp.screenshot).toHaveBeenCalledWith(1, {
        clip: { x: 100, y: 150, width: 100, height: 150, scale: 2 },
      })
      expect(result.content).toBe("Região capturada.")
      expect(result.images?.[0].data).toBe("emNvb20=")
      expect(mocks.ask).toHaveBeenCalledWith(expect.objectContaining({ title: "Capturar região ampliada" }))
    })

    it("captura a página inteira sem região", async () => {
      const mocks = makeMocks()
      mocks.cdp.screenshot.mockResolvedValue("dG9kbw==")

      await computerTools.computer({ action: "zoom" }, mocks.ctx)

      expect(mocks.cdp.screenshot).toHaveBeenCalledWith(1, {})
    })

    it("respeita a negação do usuário", async () => {
      const mocks = makeMocks()
      mocks.ask.mockResolvedValue(false)

      const result = await computerTools.computer({ action: "zoom", region: [0, 0, 10, 10] }, mocks.ctx)

      expect(result.content).toBe("Captura negada pelo usuário.")
      expect(mocks.cdp.screenshot).not.toHaveBeenCalled()
    })
  })

  describe("click", () => {
    it("clica por ref do frame principal usando o CDP", async () => {
      a11yMock.resolveRef.mockResolvedValue(ELEMENT)
      const mocks = makeMocks()

      const result = await computerTools.computer({ action: "click", ref: "ref_1" }, mocks.ctx)

      expect(a11yMock.resolveRef).toHaveBeenCalledWith(1, "ref_1")
      expect(mocks.cursor).toHaveBeenCalledWith(1, 10, 20)
      expect(mocks.cdp.mouse.mock.calls).toEqual([
        [1, "mouseMoved", 10, 20],
        [1, "mousePressed", 10, 20, { button: "left", clickCount: 1 }],
        [1, "mouseReleased", 10, 20, { button: "left", clickCount: 1 }],
      ])
      expect(result.content).toBe("Clique em (10, 20).")
      expect(mocks.hideIndicator).toHaveBeenCalledWith(1)
    })

    it("clica por coordenada sem consultar refs", async () => {
      const mocks = makeMocks()

      const result = await computerTools.computer({ action: "click", coordinate: [100.4, 200.6] }, mocks.ctx)

      expect(a11yMock.resolveRef).not.toHaveBeenCalled()
      expect(mocks.cursor).toHaveBeenCalledWith(1, 100.4, 200.6)
      expect(mocks.cdp.mouse).toHaveBeenNthCalledWith(1, 1, "mouseMoved", 100.4, 200.6)
      expect(result.content).toBe("Clique em (100, 201).")
    })

    it("respeita botão e click_count com limite 3", async () => {
      const mocks = makeMocks()

      await computerTools.computer(
        { action: "click", coordinate: [5, 5], button: "right", click_count: 2 },
        mocks.ctx,
      )
      expect(mocks.cdp.mouse.mock.calls).toEqual([
        [1, "mouseMoved", 5, 5],
        [1, "mousePressed", 5, 5, { button: "right", clickCount: 1 }],
        [1, "mouseReleased", 5, 5, { button: "right", clickCount: 1 }],
        [1, "mousePressed", 5, 5, { button: "right", clickCount: 2 }],
        [1, "mouseReleased", 5, 5, { button: "right", clickCount: 2 }],
      ])

      mocks.cdp.mouse.mockClear()
      await computerTools.computer({ action: "click", coordinate: [5, 5], clickCount: 99 }, mocks.ctx)
      expect(mocks.cdp.mouse.mock.calls).toHaveLength(7)
    })

    it("clica em iframe via eventos de DOM", async () => {
      const mocks = makeMocks()

      const result = await computerTools.computer({ action: "click", ref: "f2_ref_1" }, mocks.ctx)

      expect(a11yMock.clickRef).toHaveBeenCalledWith(1, "f2_ref_1")
      expect(mocks.cdp.mouse).not.toHaveBeenCalled()
      expect(result.content).toBe("Clique em f2_ref_1 (iframe, via eventos de DOM).")
    })

    it("respeita a negação do usuário", async () => {
      const mocks = makeMocks()
      mocks.ask.mockResolvedValue(false)

      const result = await computerTools.computer({ action: "click", coordinate: [1, 1] }, mocks.ctx)

      expect(result.content).toBe("Ação negada pelo usuário.")
      expect(mocks.cdp.mouse).not.toHaveBeenCalled()
    })

    it("cai no clique por ref quando o CDP falha", async () => {
      a11yMock.resolveRef.mockResolvedValue(ELEMENT)
      const mocks = makeMocks()
      mocks.cdp.mouse.mockRejectedValue(new Error("DevTools aberto"))

      const result = await computerTools.computer({ action: "click", ref: "ref_1" }, mocks.ctx)

      expect(a11yMock.clickRef).toHaveBeenCalledWith(1, "ref_1")
      expect(result.content).toBe("Clique em (10, 20).")
    })

    it("propaga erro do fallback", async () => {
      a11yMock.resolveRef.mockResolvedValue(ELEMENT)
      a11yMock.clickRef.mockResolvedValue({ ok: false, error: "sem elemento" })
      const mocks = makeMocks()
      mocks.cdp.mouse.mockRejectedValue(new Error("DevTools aberto"))

      await expect(computerTools.computer({ action: "click", ref: "ref_1" }, mocks.ctx)).rejects.toThrow(
        "sem elemento",
      )
    })

    it("propaga erro do CDP quando não há ref", async () => {
      const mocks = makeMocks()
      mocks.cdp.mouse.mockRejectedValue(new Error("DevTools aberto"))

      await expect(computerTools.computer({ action: "click", coordinate: [1, 1] }, mocks.ctx)).rejects.toThrow(
        "DevTools aberto",
      )
      expect(a11yMock.clickRef).not.toHaveBeenCalled()
    })

    it("lança erro quando não há ref nem coordenada", async () => {
      const mocks = makeMocks()
      await expect(computerTools.computer({ action: "click" }, mocks.ctx)).rejects.toThrow(
        "Informe `ref` ou `coordinate`.",
      )
    })

    it("lança erro para coordenada inválida", async () => {
      const mocks = makeMocks()
      await expect(
        computerTools.computer({ action: "click", coordinate: ["a", "b"] }, mocks.ctx),
      ).rejects.toThrow("Coordenada inválida.")
      await expect(computerTools.computer({ action: "click", coordinate: [1] }, mocks.ctx)).rejects.toThrow(
        "Informe `ref` ou `coordinate`.",
      )
    })

    it("lança erro quando a ref não é encontrada", async () => {
      a11yMock.resolveRef.mockResolvedValue(null)
      const mocks = makeMocks()
      await expect(computerTools.computer({ action: "click", ref: "ref_9" }, mocks.ctx)).rejects.toThrow(
        "Ref ref_9 não encontrada.",
      )
    })

    it("adota abas abertas pela página", async () => {
      const mocks = makeMocks()
      const opened = chrome.__state.addTab({
        url: "https://nova.com/",
        windowId: 1,
        groupId: -1,
        openerTabId: 1,
      })

      const result = await computerTools.computer({ action: "click", coordinate: [1, 1] }, mocks.ctx)

      expect(mocks.tabs.addTab).toHaveBeenCalledWith("ses_test", opened.id)
      expect(result.content).toContain(
        `A nova aba abriu como Tab ID ${opened.id} e entrou no grupo desta sessão.`,
      )
    })

    it("não adota abas já pertencentes ao grupo", async () => {
      const mocks = makeMocks()
      chrome.__state.addTab({ url: "https://nova.com/", windowId: 1, groupId: 100, openerTabId: 1 })

      const result = await computerTools.computer({ action: "click", coordinate: [1, 1] }, mocks.ctx)

      expect(mocks.tabs.addTab).not.toHaveBeenCalled()
      expect(result.content).toBe("Clique em (1, 1).")
    })

    it("não adota abas sem grupo na sessão", async () => {
      const mocks = makeMocks()
      mocks.tabs.groupOf.mockResolvedValue(null)
      chrome.__state.addTab({ url: "https://nova.com/", windowId: 1, groupId: -1, openerTabId: 1 })

      await computerTools.computer({ action: "click", coordinate: [1, 1] }, mocks.ctx)

      expect(mocks.tabs.addTab).not.toHaveBeenCalled()
    })

    it("também adota abas no clique por iframe", async () => {
      const mocks = makeMocks()
      const opened = chrome.__state.addTab({ url: "https://nova.com/", windowId: 1, groupId: -1, openerTabId: 1 })

      const result = await computerTools.computer({ action: "click", ref: "f1_ref_2" }, mocks.ctx)

      expect(mocks.tabs.addTab).toHaveBeenCalledWith("ses_test", opened.id)
      expect(result.content).toContain(`Tab ID ${opened.id}`)
    })
  })

  describe("hover", () => {
    it("move o mouse até a ref do frame principal", async () => {
      a11yMock.resolveRef.mockResolvedValue(ELEMENT)
      const mocks = makeMocks()

      const result = await computerTools.computer({ action: "hover", ref: "ref_1" }, mocks.ctx)

      expect(mocks.cursor).toHaveBeenCalledWith(1, 10, 20)
      expect(mocks.cdp.mouse).toHaveBeenCalledWith(1, "mouseMoved", 10, 20)
      expect(result.content).toBe("Hover em (10, 20).")
    })

    it("usa hoverRef em iframes", async () => {
      const mocks = makeMocks()

      const result = await computerTools.computer({ action: "hover", ref: "f2_ref_1" }, mocks.ctx)

      expect(a11yMock.hoverRef).toHaveBeenCalledWith(1, "f2_ref_1")
      expect(mocks.cdp.mouse).not.toHaveBeenCalled()
      expect(result.content).toBe("Hover em f2_ref_1 (iframe, via eventos de DOM).")
    })

    it("propaga erro do hoverRef em iframe", async () => {
      a11yMock.hoverRef.mockResolvedValue({ ok: false, error: "sem alvo" })
      const mocks = makeMocks()

      await expect(computerTools.computer({ action: "hover", ref: "f2_ref_1" }, mocks.ctx)).rejects.toThrow(
        "sem alvo",
      )
    })

    it("cai no hoverRef quando o CDP falha", async () => {
      a11yMock.resolveRef.mockResolvedValue(ELEMENT)
      const mocks = makeMocks()
      mocks.cdp.mouse.mockRejectedValue(new Error("DevTools aberto"))

      await computerTools.computer({ action: "hover", ref: "ref_1" }, mocks.ctx)

      expect(a11yMock.hoverRef).toHaveBeenCalledWith(1, "ref_1")
    })

    it("propaga erro do CDP sem ref", async () => {
      const mocks = makeMocks()
      mocks.cdp.mouse.mockRejectedValue(new Error("DevTools aberto"))

      await expect(computerTools.computer({ action: "hover", coordinate: [1, 1] }, mocks.ctx)).rejects.toThrow(
        "DevTools aberto",
      )
    })
  })

  describe("type", () => {
    it("clica na ref do frame principal antes de digitar", async () => {
      a11yMock.resolveRef.mockResolvedValue(ELEMENT)
      const mocks = makeMocks()

      const result = await computerTools.computer({ action: "type", ref: "ref_1", text: "olá" }, mocks.ctx)

      expect(mocks.cursor).toHaveBeenCalledWith(1, 10, 20)
      expect(mocks.cdp.mouse.mock.calls).toEqual([
        [1, "mousePressed", 10, 20, { button: "left", clickCount: 1 }],
        [1, "mouseReleased", 10, 20, { button: "left", clickCount: 1 }],
      ])
      expect(mocks.cdp.text).toHaveBeenCalledWith(1, "olá")
      expect(result.content).toBe("Digitou 3 caractere(s).")
    })

    it("foca o campo quando a ref está em iframe", async () => {
      const mocks = makeMocks()

      await computerTools.computer({ action: "type", ref: "f2_ref_1", text: "abc" }, mocks.ctx)

      expect(a11yMock.focusRef).toHaveBeenCalledWith(1, "f2_ref_1")
      expect(mocks.cdp.mouse).not.toHaveBeenCalled()
      expect(mocks.cdp.text).toHaveBeenCalledWith(1, "abc")
    })

    it("propaga erro do focusRef", async () => {
      a11yMock.focusRef.mockResolvedValue({ ok: false, error: "campo ausente" })
      const mocks = makeMocks()

      await expect(computerTools.computer({ action: "type", ref: "f2_ref_1", text: "x" }, mocks.ctx)).rejects.toThrow(
        "campo ausente",
      )
    })

    it("digita sem ref", async () => {
      const mocks = makeMocks()

      const result = await computerTools.computer({ action: "type", text: "texto solto" }, mocks.ctx)

      expect(mocks.cdp.mouse).not.toHaveBeenCalled()
      expect(mocks.cdp.text).toHaveBeenCalledWith(1, "texto solto")
      expect(result.content).toBe("Digitou 11 caractere(s).")
    })

    it("envia Enter quando submit é true", async () => {
      const mocks = makeMocks()

      const result = await computerTools.computer(
        { action: "type", text: "busca", submit: true },
        mocks.ctx,
      )

      expect(mocks.cdp.key.mock.calls).toEqual([
        [1, "keyDown", "Enter", { code: "Enter", windowsVirtualKeyCode: 13 }],
        [1, "keyUp", "Enter", { code: "Enter", windowsVirtualKeyCode: 13 }],
      ])
      expect(result.content).toBe("Digitou 5 caractere(s) e pressionou Enter.")
    })

    it("exige text", async () => {
      const mocks = makeMocks()
      await expect(computerTools.computer({ action: "type" }, mocks.ctx)).rejects.toThrow("Informe `text`.")
      await expect(computerTools.computer({ action: "type", text: "" }, mocks.ctx)).rejects.toThrow(
        "Informe `text`.",
      )
    })
  })

  describe("key", () => {
    it("interpreta modificadores como Ctrl+A", async () => {
      const mocks = makeMocks()

      const result = await computerTools.computer({ action: "key", keys: "Ctrl+A" }, mocks.ctx)

      expect(mocks.cdp.key.mock.calls).toEqual([
        [1, "keyDown", "A", { modifiers: 2, code: "A" }],
        [1, "keyUp", "A", { modifiers: 2, code: "A" }],
      ])
      expect(result.content).toBe("Tecla Ctrl+A pressionada.")
    })

    it("combina vários modificadores", async () => {
      const mocks = makeMocks()

      await computerTools.computer({ action: "key", keys: "Meta + Shift + Z" }, mocks.ctx)

      expect(mocks.cdp.key).toHaveBeenNthCalledWith(1, 1, "keyDown", "Z", { modifiers: 12, code: "Z" })
    })

    it("envia teclas sem modificadores", async () => {
      const mocks = makeMocks()

      await computerTools.computer({ action: "key", keys: "Enter" }, mocks.ctx)

      expect(mocks.cdp.key).toHaveBeenNthCalledWith(1, 1, "keyDown", "Enter", { modifiers: 0, code: "Enter" })
    })

    it("exige keys", async () => {
      const mocks = makeMocks()
      await expect(computerTools.computer({ action: "key" }, mocks.ctx)).rejects.toThrow(
        "Parâmetro obrigatório ausente: keys.",
      )
    })
  })

  describe("scroll", () => {
    it("rejeita direção de scroll desconhecida", async () => {
    const mocks = makeToolContext()

    await expect(
      computerTools.computer({ action: "scroll", scroll_direction: "diagonal" }, mocks.ctx),
    ).rejects.toThrow("Direção de scroll inválida: diagonal. Use up, down, left ou right.")
  })

  it("rola a partir do centro da janela", async () => {
      const mocks = makeMocks()

      const result = await computerTools.computer({ action: "scroll" }, mocks.ctx)

      expect(mocks.cdp.wheel).toHaveBeenCalledWith(1, 400, 300, 0, 600)
      expect(result.content).toBe("Scroll down de 600px.")
      expect(mocks.indicator).toHaveBeenCalledWith(1, "Rolando", true)
      expect(mocks.hideIndicator).toHaveBeenCalledWith(1)
    })

    it("usa o centro devolvido pelo content script quando disponível", async () => {
      chrome.scripting.executeScript.mockResolvedValue([{ result: { x: 640, y: 360 } }])
      const mocks = makeMocks()

      await computerTools.computer({ action: "scroll" }, mocks.ctx)

      expect(mocks.cdp.wheel).toHaveBeenCalledWith(1, 640, 360, 0, 600)
    })

    it("respeita direção e valor com limites", async () => {
      const mocks = makeMocks()

      await computerTools.computer({ action: "scroll", scroll_direction: "up", scroll_amount: 100 }, mocks.ctx)
      expect(mocks.cdp.wheel).toHaveBeenLastCalledWith(1, 400, 300, 0, -100)

      await computerTools.computer({ action: "scroll", scroll_direction: "left", scroll_amount: 1 }, mocks.ctx)
      expect(mocks.cdp.wheel).toHaveBeenLastCalledWith(1, 400, 300, -50, 0)

      await computerTools.computer({ action: "scroll", scroll_direction: "right", scroll_amount: 99999 }, mocks.ctx)
      expect(mocks.cdp.wheel).toHaveBeenLastCalledWith(1, 400, 300, 5000, 0)

      await computerTools.computer({ action: "scroll", scroll_direction: "down", scroll_amount: 250 }, mocks.ctx)
      expect(mocks.cdp.wheel).toHaveBeenLastCalledWith(1, 400, 300, 0, 250)
    })

    it("rola até a ref em iframe", async () => {
      const mocks = makeMocks()

      const result = await computerTools.computer({ action: "scroll", ref: "f2_ref_1" }, mocks.ctx)

      expect(a11yMock.scrollRef).toHaveBeenCalledWith(1, "f2_ref_1")
      expect(mocks.cdp.wheel).not.toHaveBeenCalled()
      expect(result.content).toBe("Rolou até f2_ref_1 (iframe).")
    })

    it("propaga erro do scrollRef", async () => {
      a11yMock.scrollRef.mockResolvedValue({ ok: false, error: "elemento sumiu" })
      const mocks = makeMocks()

      await expect(computerTools.computer({ action: "scroll", ref: "f2_ref_1" }, mocks.ctx)).rejects.toThrow(
        "elemento sumiu",
      )
      expect(mocks.hideIndicator).toHaveBeenCalledWith(1)
    })

    it("rola até a ref do frame principal", async () => {
      a11yMock.resolveRef.mockResolvedValue(ELEMENT)
      const mocks = makeMocks()

      const result = await computerTools.computer(
        { action: "scroll", ref: "ref_1", scroll_direction: "down" },
        mocks.ctx,
      )

      expect(a11yMock.resolveRef).toHaveBeenCalledWith(1, "ref_1")
      expect(mocks.cdp.wheel).toHaveBeenCalledWith(1, 10, 20, 0, 600)
      expect(result.content).toBe("Scroll down de 600px.")
    })
  })

  it("lança erro para ação desconhecida", async () => {
    const mocks = makeMocks()
    await expect(computerTools.computer({ action: "teleport" }, mocks.ctx)).rejects.toThrow(
      "Ação desconhecida: teleport",
    )
    expect(mocks.ask).toHaveBeenCalledWith(expect.objectContaining({ title: "Ação: teleport" }))
  })

  it("exige action", async () => {
    const mocks = makeMocks()
    await expect(computerTools.computer({}, mocks.ctx)).rejects.toThrow(
      "Parâmetro obrigatório ausente: action.",
    )
  })

  describe("javascript_tool", () => {
    it("executa e devolve string", async () => {
      const mocks = makeMocks()
      mocks.cdp.evaluate.mockResolvedValue({ value: "resultado" })

      const result = await computerTools.javascript_tool({ text: "1+1" }, mocks.ctx)

      expect(mocks.ask).toHaveBeenCalledWith(
        expect.objectContaining({ tool: "javascript_tool", title: "Executar JavaScript na página", text: "1+1" }),
      )
      expect(mocks.cdp.evaluate).toHaveBeenCalledWith(1, "1+1", { awaitPromise: true, timeoutMs: 10_000 })
      expect(result.content).toBe("resultado")
      expect(result.metadata).toEqual({ tabId: 1 })
    })

    it("serializa objetos", async () => {
      const mocks = makeMocks()
      mocks.cdp.evaluate.mockResolvedValue({ value: { a: 1, b: [2] } })

      const result = await computerTools.javascript_tool({ text: "({a:1,b:[2]})" }, mocks.ctx)

      expect(result.content).toBe('{\n  "a": 1,\n  "b": [\n    2\n  ]\n}')
    })

    it("mostra undefined", async () => {
      const mocks = makeMocks()
      mocks.cdp.evaluate.mockResolvedValue({ value: undefined })

      await expect(computerTools.javascript_tool({ text: "void 0" }, mocks.ctx)).resolves.toEqual({
        content: "undefined",
        metadata: { tabId: 1 },
      })
    })

    it("devolve erro de execução", async () => {
      const mocks = makeMocks()
      mocks.cdp.evaluate.mockResolvedValue({ exception: "SyntaxError: inesperado" })

      const result = await computerTools.javascript_tool({ text: "1+" }, mocks.ctx)

      expect(result.content).toBe("Erro de execução: SyntaxError: inesperado")
    })

    it("respeita a negação do usuário", async () => {
      const mocks = makeMocks()
      mocks.ask.mockResolvedValue(false)

      const result = await computerTools.javascript_tool({ text: "1" }, mocks.ctx)

      expect(result.content).toBe("Execução negada pelo usuário.")
      expect(mocks.cdp.evaluate).not.toHaveBeenCalled()
    })

    it("exige text", async () => {
      const mocks = makeMocks()
      await expect(computerTools.javascript_tool({}, mocks.ctx)).rejects.toThrow(
        "Parâmetro obrigatório ausente: text.",
      )
    })
  })

  describe("read_console_messages", () => {
    const entries = [
      { type: "log", text: "iniciando", timestamp: 1, domain: "example.com" },
      { type: "error", text: "Falha ao carregar", timestamp: 2, url: "https://example.com/app.js", lineNumber: 10, domain: "example.com" },
      { type: "exception", text: "TypeError", timestamp: 3, domain: "" },
    ]

    it("lista as mensagens com tipo e origem", async () => {
      const mocks = makeMocks()
      mocks.cdp.consoleMessages.mockReturnValue(entries)

      const result = await computerTools.read_console_messages({}, mocks.ctx)

      expect(mocks.cdp.enableRuntime).toHaveBeenCalledWith(1)
      expect(result.content).toContain("Encontradas 3 mensagem(ns):")
      expect(result.content).toContain("[1] [LOG]\niniciando")
      expect(result.content).toContain("[2] [ERROR] (https://example.com/app.js:10)\nFalha ao carregar")
      expect(result.content).toContain("[3] [EXCEPTION]\nTypeError")
      expect(mocks.cdp.clearConsole).not.toHaveBeenCalled()
    })

    it("filtra por pattern sem diferenciar maiúsculas", async () => {
      const mocks = makeMocks()
      mocks.cdp.consoleMessages.mockReturnValue(entries)

      const result = await computerTools.read_console_messages({ pattern: "FALHA" }, mocks.ctx)

      expect(result.content).toContain("Encontradas 1 mensagem(ns):")
      expect(result.content).toContain("Falha ao carregar")
    })

    it("filtra apenas erros e exceções", async () => {
      const mocks = makeMocks()
      mocks.cdp.consoleMessages.mockReturnValue(entries)

      const result = await computerTools.read_console_messages({ onlyErrors: true }, mocks.ctx)

      expect(result.content).toContain("Encontradas 2 mensagem(ns):")
      expect(result.content).not.toContain("iniciando")
    })

    it("aceita o alias only_errors", async () => {
      const mocks = makeMocks()
      mocks.cdp.consoleMessages.mockReturnValue(entries)

      const result = await computerTools.read_console_messages({ only_errors: true }, mocks.ctx)

      expect(result.content).toContain("Encontradas 2 mensagem(ns):")
    })

    it("limita e informa quantas foram mostradas", async () => {
      const mocks = makeMocks()
      mocks.cdp.consoleMessages.mockReturnValue(entries)

      const result = await computerTools.read_console_messages({ limit: 1 }, mocks.ctx)

      expect(result.content).toContain("Encontradas 3 mensagem(ns) (mostrando 1):")
      expect(result.content).toContain("TypeError")
      expect(result.content).not.toContain("iniciando")
    })

    it("ignora mensagens de outros domínios", async () => {
      const mocks = makeMocks()
      mocks.cdp.consoleMessages.mockReturnValue([
        { type: "log", text: "da página", timestamp: 1, domain: "example.com" },
        { type: "log", text: "de outro domínio", timestamp: 2, domain: "outro.com" },
      ])

      const result = await computerTools.read_console_messages({}, mocks.ctx)

      expect(result.content).toContain("da página")
      expect(result.content).not.toContain("de outro domínio")
    })

    it("limpa o buffer quando clear é true", async () => {
      const mocks = makeMocks()
      mocks.cdp.consoleMessages.mockReturnValue(entries)

      await computerTools.read_console_messages({ clear: true }, mocks.ctx)

      expect(mocks.cdp.clearConsole).toHaveBeenCalledWith(1)
    })

    it("explica quando não há mensagens", async () => {
      const mocks = makeMocks()

      const result = await computerTools.read_console_messages({}, mocks.ctx)

      expect(result.content).toContain("Nenhuma mensagem de console encontrada.")
      expect(result.content).toContain("recarregue a página")
    })
  })

  describe("read_network_requests", () => {
    const entries = [
      { requestId: "1", url: "https://example.com/api/user", method: "GET", status: 200, domain: "example.com", timestamp: 1 },
      { requestId: "2", url: "https://example.com/api/logo.png", method: "GET", domain: "example.com", timestamp: 2 },
    ]

    it("lista as requisições com método e status", async () => {
      const mocks = makeMocks()
      mocks.cdp.networkRequests.mockReturnValue(entries)

      const result = await computerTools.read_network_requests({}, mocks.ctx)

      expect(mocks.cdp.enableNetwork).toHaveBeenCalledWith(1)
      expect(result.content).toContain("Encontradas 2 requisição(ões):")
      expect(result.content).toContain("1. url: https://example.com/api/user\n   method: GET\n   statusCode: 200")
      expect(result.content).toContain("statusCode: pending")
    })

    it("filtra por urlPattern", async () => {
      const mocks = makeMocks()
      mocks.cdp.networkRequests.mockReturnValue(entries)

      const result = await computerTools.read_network_requests({ urlPattern: "LOGO" }, mocks.ctx)

      expect(result.content).toContain("Encontradas 1 requisição(ões):")
      expect(result.content).toContain("logo.png")
    })

    it("aceita o alias url_pattern", async () => {
      const mocks = makeMocks()
      mocks.cdp.networkRequests.mockReturnValue(entries)

      const result = await computerTools.read_network_requests({ url_pattern: "user" }, mocks.ctx)

      expect(result.content).toContain("Encontradas 1 requisição(ões):")
    })

    it("limita a quantidade exibida", async () => {
      const mocks = makeMocks()
      mocks.cdp.networkRequests.mockReturnValue(entries)

      const result = await computerTools.read_network_requests({ limit: 1 }, mocks.ctx)

      expect(result.content).toContain("Encontradas 2 requisição(ões) (mostrando 1):")
      expect(result.content).toContain("logo.png")
      expect(result.content).not.toContain("api/user")
    })

    it("limpa o buffer quando clear é true", async () => {
      const mocks = makeMocks()
      mocks.cdp.networkRequests.mockReturnValue(entries)

      await computerTools.read_network_requests({ clear: true }, mocks.ctx)

      expect(mocks.cdp.clearNetwork).toHaveBeenCalledWith(1)
    })

    it("explica quando não há requisições", async () => {
      const mocks = makeMocks()

      const result = await computerTools.read_network_requests({}, mocks.ctx)

      expect(result.content).toContain("Nenhuma requisição encontrada.")
      expect(result.content).toContain("recarregue a página")
    })
  })
})
