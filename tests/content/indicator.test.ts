import { beforeEach, describe, expect, it, vi } from "vitest"

const HOST_ID = "opencode-browser-indicator"

interface IndicatorMessage {
  type?: string
  text?: unknown
  busy?: unknown
  x?: unknown
  y?: unknown
}

type MessageListener = (message: IndicatorMessage, sender?: unknown, sendResponse?: unknown) => unknown

/** `attachShadow` é interceptado porque o shadow root do indicator é fechado. */
const nativeAttachShadow = Element.prototype.attachShadow

let listener: MessageListener
let shadowRoots: ShadowRoot[]

function host(): HTMLElement | null {
  return document.getElementById(HOST_ID)
}

function lastShadowRoot(): ShadowRoot {
  const root = shadowRoots.at(-1)
  if (!root) throw new Error("Shadow root do indicator não foi criado")
  return root
}

function ui() {
  const root = lastShadowRoot()
  const pill = root.querySelector<HTMLElement>(".pill")
  return {
    root,
    dot: root.querySelector<HTMLElement>('[data-role="dot"]'),
    label: pill?.querySelectorAll<HTMLSpanElement>("span")[1] ?? null,
    stop: root.querySelector<HTMLButtonElement>("button.stop"),
    cursor: root.querySelector<HTMLElement>(".cursor"),
  }
}

beforeEach(async () => {
  document.body.innerHTML = ""
  host()?.remove()
  delete (window as unknown as { __opencodeIndicatorInstalled?: boolean }).__opencodeIndicatorInstalled

  shadowRoots = []
  vi.spyOn(Element.prototype, "attachShadow").mockImplementation(function (this: Element, init: ShadowRootInit) {
    const root = nativeAttachShadow.call(this, init)
    shadowRoots.push(root)
    return root
  })

  vi.resetModules()
  const module = await import("../../src/content/indicator")
  module.installIndicator()
  listener = chrome.runtime.onMessage.listeners[0] as MessageListener
})

describe("content/indicator — instalação", () => {
  it("registra um único listener e marca a janela como instalada", () => {
    expect(chrome.runtime.onMessage.listeners).toHaveLength(1)
    expect(typeof listener).toBe("function")
    expect((window as unknown as { __opencodeIndicatorInstalled?: boolean }).__opencodeIndicatorInstalled).toBe(true)
  })

  it("é idempotente e não duplica o listener", async () => {
    const module = await import("../../src/content/indicator")

    module.installIndicator()
    module.installIndicator()

    expect(chrome.runtime.onMessage.listeners).toHaveLength(1)
  })

  it("não monta nada antes de receber indicator:show", () => {
    expect(host()).toBeNull()
    expect(shadowRoots).toHaveLength(0)
  })

  it("não monta o host quando a janela deixa de ser o frame de topo", () => {
    vi.stubGlobal("top", {})

    listener({ type: "indicator:show" })

    expect(host()).toBeNull()
    expect(shadowRoots).toHaveLength(0)
  })

  it("não instala quando a janela não é o frame de topo", async () => {
    // desfaz a instalação do beforeEach e simula um iframe (window.top !== window)
    chrome.runtime.onMessage.clear()
    delete (window as unknown as { __opencodeIndicatorInstalled?: boolean }).__opencodeIndicatorInstalled
    vi.stubGlobal("top", {})

    vi.resetModules()
    const module = await import("../../src/content/indicator")
    module.installIndicator()

    expect(chrome.runtime.onMessage.listeners).toHaveLength(0)
    expect((window as unknown as { __opencodeIndicatorInstalled?: boolean }).__opencodeIndicatorInstalled).toBeUndefined()
    expect(host()).toBeNull()
  })
})

describe("content/indicator — show/hide", () => {
  it("monta o host com shadow root fechado e a UI completa", () => {
    expect(listener({ type: "indicator:show" })).toBeUndefined()

    const mounted = host()
    expect(mounted).toBeTruthy()
    expect(mounted?.parentElement).toBe(document.documentElement)
    expect(mounted?.style.position).toBe("fixed")
    expect(mounted?.style.pointerEvents).toBe("none")
    // shadow root fechado: host.shadowRoot é null
    expect(mounted?.shadowRoot).toBeNull()

    const root = lastShadowRoot()
    expect(root.mode).toBe("closed")
    expect(root.querySelector(".frame")).toBeTruthy()
    expect(root.querySelector(".pill")).toBeTruthy()
    expect(root.querySelector('[data-role="dot"]')).toBeTruthy()
    expect(root.querySelector("style")?.textContent).toContain(".stop")
    expect(root.querySelector("button.stop")?.textContent).toBe("Parar")

    const { label } = ui()
    expect(label?.textContent).toBe("OpenCode está nesta aba")
  })

  it("não duplica o host em show repetido", () => {
    listener({ type: "indicator:show" })
    listener({ type: "indicator:show" })

    expect(document.querySelectorAll(`#${HOST_ID}`)).toHaveLength(1)
    expect(shadowRoots).toHaveLength(1)
  })

  it("remove o host no hide", () => {
    listener({ type: "indicator:show" })
    expect(host()).toBeTruthy()

    listener({ type: "indicator:hide" })

    expect(host()).toBeNull()
    expect(document.querySelectorAll(`#${HOST_ID}`)).toHaveLength(0)
  })

  it("ignora hide quando o host não existe", () => {
    expect(() => listener({ type: "indicator:hide" })).not.toThrow()
    expect(host()).toBeNull()
  })

  it("permite remontar depois do hide", () => {
    listener({ type: "indicator:show" })
    listener({ type: "indicator:hide" })
    listener({ type: "indicator:show" })

    expect(document.querySelectorAll(`#${HOST_ID}`)).toHaveLength(1)
    expect(host()?.parentElement).toBe(document.documentElement)
  })
})

describe("content/indicator — status", () => {
  it("atualiza o rótulo e a classe busy do dot", () => {
    listener({ type: "indicator:show" })
    const { dot, label } = ui()

    listener({ type: "indicator:status", text: "Lendo a página", busy: true })
    expect(label?.textContent).toBe("Lendo a página")
    expect(dot?.classList.contains("busy")).toBe(true)

    listener({ type: "indicator:status", busy: false })
    expect(label?.textContent).toBe("Lendo a página")
    expect(dot?.classList.contains("busy")).toBe(false)

    listener({ type: "indicator:status", busy: true })
    expect(dot?.classList.contains("busy")).toBe(true)
  })

  it("ignora text que não é string", () => {
    listener({ type: "indicator:show" })
    const { label } = ui()

    listener({ type: "indicator:status", text: 42 })

    expect(label?.textContent).toBe("OpenCode está nesta aba")
  })

  it("não quebra com status sem host montado", () => {
    expect(() => listener({ type: "indicator:status", text: "x", busy: true })).not.toThrow()
    expect(host()).toBeNull()
  })

  it("não quebra com status depois do hide", () => {
    listener({ type: "indicator:show" })
    listener({ type: "indicator:hide" })

    expect(() => listener({ type: "indicator:status", text: "x", busy: true })).not.toThrow()
  })
})

describe("content/indicator — cursor", () => {
  it("cria o cursor e move com translate3d, reaproveitando o elemento", () => {
    listener({ type: "indicator:show" })
    expect(ui().cursor).toBeNull()

    listener({ type: "indicator:cursor", x: 10, y: 20 })

    const { cursor } = ui()
    expect(cursor).toBeTruthy()
    expect(cursor?.style.transform).toBe("translate3d(10px, 20px, 0)")
    expect(cursor?.querySelector("svg")).toBeTruthy()

    listener({ type: "indicator:cursor", x: 33, y: 44 })

    expect(lastShadowRoot().querySelectorAll(".cursor")).toHaveLength(1)
    expect(ui().cursor?.style.transform).toBe("translate3d(33px, 44px, 0)")
  })

  it("cria o cursor mas não move quando as coordenadas não são números", () => {
    listener({ type: "indicator:show" })

    listener({ type: "indicator:cursor", x: "10", y: null })

    const { cursor } = ui()
    expect(cursor).toBeTruthy()
    expect(cursor?.style.transform).toBe("")
  })

  it("não cria cursor sem host montado", () => {
    expect(() => listener({ type: "indicator:cursor", x: 1, y: 2 })).not.toThrow()

    expect(host()).toBeNull()
    expect(shadowRoots).toHaveLength(0)
  })

  it("descarta o cursor ao remontar", () => {
    listener({ type: "indicator:show" })
    listener({ type: "indicator:cursor", x: 1, y: 2 })
    expect(ui().cursor).toBeTruthy()

    listener({ type: "indicator:hide" })
    listener({ type: "indicator:show" })

    expect(ui().cursor).toBeNull()
  })
})

describe("content/indicator — botão parar", () => {
  it("envia browser:stop ao clicar em Parar", () => {
    listener({ type: "indicator:show" })
    const { stop } = ui()

    stop?.dispatchEvent(new MouseEvent("click", { bubbles: true }))

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: "browser:stop" })
  })

  it("não envia nada sem clique", () => {
    listener({ type: "indicator:show" })

    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled()
  })
})

describe("content/indicator — mensagens desconhecidas", () => {
  it("ignora tipos desconhecidos, mensagens vazias e sem mensagem", () => {
    expect(listener({ type: "outro:comando" })).toBeUndefined()
    expect(listener({ type: "indicator:desconhecido" })).toBeUndefined()
    expect(listener({})).toBeUndefined()
    expect(listener(undefined as unknown as IndicatorMessage)).toBeUndefined()

    expect(host()).toBeNull()
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled()
  })
})
