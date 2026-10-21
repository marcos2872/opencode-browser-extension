import { describe, expect, it, vi } from "vitest"
import { Cdp } from "../../src/background/cdp"
import { chromeMock } from "../setup"

function stubCommands(results: Record<string, unknown> = {}): void {
  chromeMock.debugger.sendCommand.mockImplementation(
    (_target: unknown, method: string, _params: unknown, callback?: (result: unknown) => void) => {
      callback?.(results[method])
    },
  )
}

function sentMethods(): string[] {
  return chromeMock.debugger.sendCommand.mock.calls.map((call) => call[1] as string)
}

function lastParams(method: string): unknown {
  const calls = chromeMock.debugger.sendCommand.mock.calls.filter((call) => call[1] === method)
  return calls.at(-1)?.[2]
}

describe("background/cdp", () => {
  describe("attach/detach", () => {
    it("anexa a aba e não repete para a mesma aba", async () => {
      const cdp = new Cdp()
      await cdp.attach(1)

      expect(chromeMock.debugger.attach).toHaveBeenCalledWith({ tabId: 1 }, "1.3", expect.any(Function))
      await cdp.attach(1)
      expect(chromeMock.debugger.attach).toHaveBeenCalledTimes(1)
    })

    it("traduz o erro de DevTools aberto", async () => {
      const cdp = new Cdp()
      chromeMock.runtime.lastError = { message: "Another debugger is already attached to the tab." }

      await expect(cdp.attach(1)).rejects.toThrow(
        "O DevTools está aberto nesta aba. Feche o DevTools e tente novamente.",
      )
    })

    it("propaga outros erros de attach e permite nova tentativa", async () => {
      const cdp = new Cdp()
      chromeMock.runtime.lastError = { message: "Permission denied" }
      await expect(cdp.attach(1)).rejects.toThrow("Não foi possível anexar o depurador: Permission denied")

      chromeMock.runtime.lastError = undefined
      await cdp.attach(1)
      expect(chromeMock.debugger.attach).toHaveBeenCalledTimes(2)
    })

    it("deduplica attaches concorrentes", async () => {
      const cdp = new Cdp()
      let callback: (() => void) | undefined
      chromeMock.debugger.attach.mockImplementationOnce(
        (_target: unknown, _version: string, cb?: () => void) => {
          callback = cb
        },
      )

      const first = cdp.attach(1)
      const second = cdp.attach(1)
      expect(chromeMock.debugger.attach).toHaveBeenCalledTimes(1)

      callback?.()
      await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined])
      expect(chromeMock.debugger.attach).toHaveBeenCalledTimes(1)
    })

    it("detach é no-op para aba não anexada", async () => {
      const cdp = new Cdp()
      await cdp.detach(42)
      expect(chromeMock.debugger.detach).not.toHaveBeenCalled()
    })

    it("detach libera a aba e detachAll libera todas", async () => {
      const cdp = new Cdp()
      await cdp.attach(1)
      await cdp.attach(2)

      await cdp.detach(1)
      expect(chromeMock.debugger.detach).toHaveBeenCalledWith({ tabId: 1 }, expect.any(Function))

      await cdp.attach(1)
      expect(chromeMock.debugger.attach).toHaveBeenCalledTimes(3)

      await cdp.detachAll()
      expect(chromeMock.debugger.detach.mock.calls.map((call) => call[0])).toEqual([
        { tabId: 1 },
        { tabId: 1 },
        { tabId: 2 },
      ])

      await cdp.detach(1)
      expect(chromeMock.debugger.detach).toHaveBeenCalledTimes(3)
    })
  })

  describe("command", () => {
    it("rejeita com o método no texto do erro", async () => {
      const cdp = new Cdp()
      await cdp.attach(1)
      chromeMock.runtime.lastError = { message: "Target closed" }

      await expect(cdp.command(1, "Runtime.evaluate", { expression: "1" })).rejects.toThrow(
        "Runtime.evaluate: Target closed",
      )
    })

    it("envia params vazios quando não informados", async () => {
      const cdp = new Cdp()
      stubCommands()
      await cdp.command(1, "Page.reload")

      expect(chromeMock.debugger.sendCommand).toHaveBeenCalledWith(
        { tabId: 1 },
        "Page.reload",
        {},
        expect.any(Function),
      )
    })
  })

  describe("enable*", () => {
    it("só habilita Runtime, Page e Network uma vez", async () => {
      const cdp = new Cdp()
      stubCommands()

      await cdp.enableRuntime(1)
      await cdp.enableRuntime(1)
      await cdp.enablePage(1)
      await cdp.enablePage(1)
      await cdp.enableNetwork(1)
      await cdp.enableNetwork(1)

      expect(sentMethods().filter((method) => method.endsWith(".enable"))).toEqual([
        "Runtime.enable",
        "Page.enable",
        "Network.enable",
      ])
    })
  })

  describe("evaluate", () => {
    it("devolve o valor e usa as opções padrão", async () => {
      const cdp = new Cdp()
      stubCommands({ "Runtime.evaluate": { result: { value: 42 } } })

      await expect(cdp.evaluate(1, "6*7")).resolves.toEqual({ value: 42 })
      expect(lastParams("Runtime.evaluate")).toEqual({
        expression: "6*7",
        awaitPromise: true,
        returnByValue: true,
        userGesture: true,
        timeout: undefined,
      })
    })

    it("respeita awaitPromise e timeout customizados", async () => {
      const cdp = new Cdp()
      stubCommands({ "Runtime.evaluate": { result: { value: "ok" } } })

      await expect(cdp.evaluate(1, "Promise.resolve('ok')", { awaitPromise: false, timeoutMs: 5_000 })).resolves.toEqual({
        value: "ok",
      })
      expect(lastParams("Runtime.evaluate")).toMatchObject({ awaitPromise: false, timeout: 5_000 })
    })

    it("trata exceptionDetails com description", async () => {
      const cdp = new Cdp()
      stubCommands({
        "Runtime.evaluate": {
          exceptionDetails: {
            text: "Uncaught",
            exception: { description: "ReferenceError: x is not defined" },
          },
        },
      })

      await expect(cdp.evaluate(1, "x")).resolves.toEqual({
        value: undefined,
        exception: "ReferenceError: x is not defined",
      })
    })

    it("usa text quando não há description e a mensagem padrão quando não há nada", async () => {
      const cdp = new Cdp()
      stubCommands({ "Runtime.evaluate": { exceptionDetails: { text: "Uncaught" } } })
      await expect(cdp.evaluate(1, "x")).resolves.toEqual({ value: undefined, exception: "Uncaught" })

      stubCommands({ "Runtime.evaluate": { exceptionDetails: {} } })
      await expect(cdp.evaluate(1, "x")).resolves.toEqual({
        value: undefined,
        exception: "Erro desconhecido ao executar JavaScript.",
      })
    })
  })

  describe("screenshot", () => {
    it("devolve os dados e envia clip apenas quando informado", async () => {
      const cdp = new Cdp()
      stubCommands({ "Page.captureScreenshot": { data: "AAAA" } })

      await expect(cdp.screenshot(1)).resolves.toBe("AAAA")
      await cdp.screenshot(1, { clip: { x: 1, y: 2, width: 10, height: 20 } })

      expect(lastParams("Page.captureScreenshot")).toEqual({
        format: "png",
        captureBeyondViewport: false,
        fromSurface: true,
        clip: { x: 1, y: 2, width: 10, height: 20 },
      })
    })

    it("falha quando o Chrome não devolve data", async () => {
      const cdp = new Cdp()
      stubCommands({ "Page.captureScreenshot": {} })
      await expect(cdp.screenshot(1)).rejects.toThrow("O Chrome não retornou a imagem.")
    })
  })

  describe("entrada", () => {
    it("mouse envia os parâmetros corretos", async () => {
      const cdp = new Cdp()
      stubCommands()

      await cdp.mouse(1, "mousePressed", 10, 20, { button: "right", clickCount: 2, modifiers: 1 })
      expect(lastParams("Input.dispatchMouseEvent")).toEqual({
        type: "mousePressed",
        x: 10,
        y: 20,
        button: "right",
        clickCount: 2,
        modifiers: 1,
      })

      await cdp.mouse(1, "mouseReleased", 1, 2)
      expect(lastParams("Input.dispatchMouseEvent")).toEqual({
        type: "mouseReleased",
        x: 1,
        y: 2,
        button: "left",
        clickCount: 1,
        modifiers: 0,
      })
    })

    it("key envia os parâmetros corretos", async () => {
      const cdp = new Cdp()
      stubCommands()

      await cdp.key(1, "keyDown", "Enter", { code: "Enter", windowsVirtualKeyCode: 13, modifiers: 8 })
      expect(lastParams("Input.dispatchKeyEvent")).toEqual({
        type: "keyDown",
        key: "Enter",
        code: "Enter",
        windowsVirtualKeyCode: 13,
        modifiers: 8,
      })

      await cdp.key(1, "keyUp", "a")
      expect(lastParams("Input.dispatchKeyEvent")).toEqual({
        type: "keyUp",
        key: "a",
        code: "a",
        windowsVirtualKeyCode: undefined,
        modifiers: 0,
      })
    })

    it("text e wheel enviam os parâmetros corretos", async () => {
      const cdp = new Cdp()
      stubCommands()

      await cdp.text(1, "olá")
      expect(lastParams("Input.insertText")).toEqual({ text: "olá" })

      await cdp.wheel(1, 5, 6, 0, 120)
      expect(lastParams("Input.dispatchMouseEvent")).toEqual({
        type: "mouseWheel",
        x: 5,
        y: 6,
        deltaX: 0,
        deltaY: 120,
      })
    })
  })

  describe("eventos", () => {
    it("registra consoleAPICalled com value, description e type", () => {
      const cdp = new Cdp()
      chromeMock.debugger.onEvent.emit({ tabId: 7 }, "Runtime.consoleAPICalled", {
        type: "warning",
        timestamp: 123,
        args: [
          { value: "texto" },
          { value: 42 },
          { value: { a: 1 } },
          { description: "Objeto" },
          { type: "undefined" },
        ],
      })

      expect(cdp.consoleMessages(7)).toEqual([
        {
          type: "warning",
          text: 'texto 42 {"a":1} Objeto undefined',
          timestamp: 123,
          domain: "",
        },
      ])
    })

    it("usa valores padrão quando type/timestamp/args não vêm", () => {
      const cdp = new Cdp()
      const before = Date.now()
      chromeMock.debugger.onEvent.emit({ tabId: 7 }, "Runtime.consoleAPICalled", {})
      const after = Date.now()

      const [entry] = cdp.consoleMessages(7)
      expect(entry).toMatchObject({ type: "log", text: "" })
      expect(entry?.timestamp).toBeGreaterThanOrEqual(before)
      expect(entry?.timestamp).toBeLessThanOrEqual(after)
    })

    it("registra exceptionThrown", () => {
      const cdp = new Cdp()

      chromeMock.debugger.onEvent.emit({ tabId: 7 }, "Runtime.exceptionThrown", {
        exceptionDetails: {
          exception: { description: "TypeError: boom" },
          url: "https://x.com/a.js",
          lineNumber: 3,
        },
      })
      expect(cdp.consoleMessages(7)[0]).toMatchObject({
        type: "exception",
        text: "TypeError: boom",
        url: "https://x.com/a.js",
        lineNumber: 3,
        domain: "",
      })

      chromeMock.debugger.onEvent.emit({ tabId: 7 }, "Runtime.exceptionThrown", {
        exceptionDetails: { text: "Uncaught" },
      })
      expect(cdp.consoleMessages(7)[1]).toMatchObject({ text: "Uncaught" })

      chromeMock.debugger.onEvent.emit({ tabId: 7 }, "Runtime.exceptionThrown", {})
      expect(cdp.consoleMessages(7)[2]).toMatchObject({ text: "Exceção" })
    })

    it("Network.requestWillBeSent filtra domínio divergente", () => {
      const cdp = new Cdp()
      chromeMock.debugger.onEvent.emit({ tabId: 7 }, "Page.frameNavigated", {
        frame: { url: "https://site.com/" },
      })

      chromeMock.debugger.onEvent.emit({ tabId: 7 }, "Network.requestWillBeSent", {
        requestId: "1",
        request: { url: "https://site.com/api", method: "POST" },
      })
      chromeMock.debugger.onEvent.emit({ tabId: 7 }, "Network.requestWillBeSent", {
        requestId: "2",
        request: { url: "https://outro.com/x" },
      })
      chromeMock.debugger.onEvent.emit({ tabId: 7 }, "Network.requestWillBeSent", {})
      chromeMock.debugger.onEvent.emit({ tabId: 7 }, "Network.requestWillBeSent", {
        requestId: "3",
        request: { url: "não é url" },
      })

      const requests = cdp.networkRequests(7)
      expect(requests).toHaveLength(3)
      expect(requests[0]).toMatchObject({
        requestId: "1",
        url: "https://site.com/api",
        method: "POST",
        domain: "site.com",
      })
      expect(requests[1]).toMatchObject({ requestId: "", url: "", method: "GET", domain: "" })
      expect(requests[2]).toMatchObject({ requestId: "3", url: "não é url", domain: "" })
    })

    it("Network.responseReceived atualiza o status do pedido", () => {
      const cdp = new Cdp()
      chromeMock.debugger.onEvent.emit({ tabId: 7 }, "Network.requestWillBeSent", {
        requestId: "1",
        request: { url: "https://site.com/api" },
      })

      chromeMock.debugger.onEvent.emit({ tabId: 7 }, "Network.responseReceived", {
        requestId: "1",
        response: { status: 204 },
      })
      expect(cdp.networkRequests(7)[0]?.status).toBe(204)

      chromeMock.debugger.onEvent.emit({ tabId: 7 }, "Network.responseReceived", {
        requestId: "1",
        response: { status: "200" },
      })
      expect(cdp.networkRequests(7)[0]?.status).toBe(204)

      chromeMock.debugger.onEvent.emit({ tabId: 7 }, "Network.responseReceived", {
        requestId: "desconhecido",
        response: { status: 500 },
      })
      expect(cdp.networkRequests(7)).toHaveLength(1)
    })

    it("Page.frameNavigated troca o domínio e limpa o buffer de rede", () => {
      const cdp = new Cdp()
      chromeMock.debugger.onEvent.emit({ tabId: 7 }, "Page.frameNavigated", {
        frame: { url: "https://a.com/" },
      })
      chromeMock.debugger.onEvent.emit({ tabId: 7 }, "Network.requestWillBeSent", {
        requestId: "1",
        request: { url: "https://a.com/1" },
      })
      expect(cdp.networkRequests(7)).toHaveLength(1)

      chromeMock.debugger.onEvent.emit({ tabId: 7 }, "Page.frameNavigated", {
        frame: { url: "https://b.com/" },
      })
      expect(cdp.networkRequests(7)).toEqual([])

      chromeMock.debugger.onEvent.emit({ tabId: 7 }, "Network.requestWillBeSent", {
        requestId: "2",
        request: { url: "https://b.com/2" },
      })
      chromeMock.debugger.onEvent.emit({ tabId: 7 }, "Page.frameNavigated", {
        frame: { url: "https://b.com/outra" },
      })
      expect(cdp.networkRequests(7)).toHaveLength(1)

      chromeMock.debugger.onEvent.emit({ tabId: 7 }, "Page.frameNavigated", {
        frame: { url: "https://iframe.com/", parentId: "frame-pai" },
      })
      expect(cdp.networkRequests(7)).toHaveLength(1)

      chromeMock.debugger.onEvent.emit({ tabId: 7 }, "Runtime.consoleAPICalled", {
        args: [{ value: "log" }],
      })
      expect(cdp.consoleMessages(7)[0]?.domain).toBe("b.com")
    })

    it("limita o buffer de console a 500 entradas", () => {
      const cdp = new Cdp()
      for (let index = 0; index < 501; index += 1) {
        chromeMock.debugger.onEvent.emit({ tabId: 7 }, "Runtime.consoleAPICalled", {
          args: [{ value: `linha-${index}` }],
        })
      }

      const messages = cdp.consoleMessages(7)
      expect(messages).toHaveLength(500)
      expect(messages[0]?.text).toBe("linha-1")
      expect(messages.at(-1)?.text).toBe("linha-500")
    })

    it("limita o buffer de rede a 500 entradas", () => {
      const cdp = new Cdp()
      for (let index = 0; index < 501; index += 1) {
        chromeMock.debugger.onEvent.emit({ tabId: 7 }, "Network.requestWillBeSent", {
          requestId: String(index),
          request: { url: `https://site.com/${index}` },
        })
      }

      const requests = cdp.networkRequests(7)
      expect(requests).toHaveLength(500)
      expect(requests[0]?.requestId).toBe("1")
      expect(requests.at(-1)?.requestId).toBe("500")
    })

    it("clearConsole e clearNetwork esvaziam os buffers", () => {
      const cdp = new Cdp()
      chromeMock.debugger.onEvent.emit({ tabId: 7 }, "Runtime.consoleAPICalled", { args: [{ value: "x" }] })
      chromeMock.debugger.onEvent.emit({ tabId: 7 }, "Network.requestWillBeSent", {
        requestId: "1",
        request: { url: "https://site.com/" },
      })

      cdp.clearConsole(7)
      cdp.clearNetwork(7)

      expect(cdp.consoleMessages(7)).toEqual([])
      expect(cdp.networkRequests(7)).toEqual([])
    })

    it("ignora eventos sem tabId", () => {
      const cdp = new Cdp()
      expect(() =>
        chromeMock.debugger.onEvent.emit({}, "Runtime.consoleAPICalled", { args: [{ value: "x" }] }),
      ).not.toThrow()
      expect(() => chromeMock.debugger.onDetach.emit({}, "canceled_by_user")).not.toThrow()
      expect(cdp.consoleMessages(99)).toEqual([])
    })
  })

  describe("limpeza de estado", () => {
    it("tabs.onRemoved apaga o estado da aba", async () => {
      const cdp = new Cdp()
      stubCommands()
      await cdp.attach(7)
      await cdp.enableRuntime(7)
      chromeMock.debugger.onEvent.emit({ tabId: 7 }, "Runtime.consoleAPICalled", { args: [{ value: "x" }] })
      expect(cdp.consoleMessages(7)).toHaveLength(1)

      chromeMock.tabs.onRemoved.emit(7, { windowId: 1, isWindowClosing: false })

      expect(cdp.consoleMessages(7)).toEqual([])
      await cdp.enableRuntime(7)
      expect(chromeMock.debugger.attach).toHaveBeenCalledTimes(2)
    })

    it("debugger.onDetach reseta as flags de domínio", async () => {
      const cdp = new Cdp()
      stubCommands()
      await cdp.enableRuntime(7)
      await cdp.enablePage(7)
      await cdp.enableNetwork(7)

      chromeMock.debugger.onDetach.emit({ tabId: 7 }, "canceled_by_user")

      await cdp.detach(7)
      expect(chromeMock.debugger.detach).not.toHaveBeenCalled()

      await cdp.enableRuntime(7)
      await cdp.enablePage(7)
      await cdp.enableNetwork(7)

      expect(sentMethods().filter((method) => method.endsWith(".enable"))).toEqual([
        "Runtime.enable",
        "Page.enable",
        "Network.enable",
        "Runtime.enable",
        "Page.enable",
        "Network.enable",
      ])
      expect(chromeMock.debugger.attach).toHaveBeenCalledTimes(2)
    })
  })
})
