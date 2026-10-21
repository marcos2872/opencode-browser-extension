import { beforeEach, describe, expect, it } from "vitest"
import {
  assertScriptable,
  clickRef,
  ensureBridge,
  focusRef,
  frameTarget,
  generateTree,
  generateTreeFrames,
  hoverRef,
  isMainFrameRef,
  listElements,
  listElementsFrames,
  pageText,
  pageTextFrames,
  parseRef,
  resolveRef,
  scrollRef,
  setValue,
  uploadFiles,
} from "../../../src/background/tools/a11y"

const FRAME_URL = "https://example.com/pagina"
let TAB_ID = 0

interface ScriptCall {
  target: { tabId: number; frameIds?: number[]; allFrames?: boolean }
  func?: unknown
  args?: unknown[]
  files?: string[]
}

let calls: ScriptCall[] = []
/** Resultado das sondagens de ponte (`func` sem `args`). */
let bridgePresent = true
/** Se a injeção de assets/content.js faz a ponte aparecer. */
let injectionRestoresBridge = true
/** Resultado das chamadas de ferramenta (`args` presente). */
let scriptResults: Array<{ frameId?: number; result?: unknown }> = []

const toolCalls = () => calls.filter((call) => call.args !== undefined)
const toolCall = () => toolCalls().at(-1) as ScriptCall
const probeCalls = () => calls.filter((call) => call.args === undefined && call.files === undefined)
const injectCall = () => calls.find((call) => call.files !== undefined)

beforeEach(() => {
  calls = []
  bridgePresent = true
  injectionRestoresBridge = true
  scriptResults = []
  TAB_ID = chrome.__state.addTab({ url: FRAME_URL, title: "Exemplo" }).id
  chrome.scripting.executeScript.mockImplementation(async (options: ScriptCall) => {
    calls.push(options)
    if (options.files) {
      if (injectionRestoresBridge) bridgePresent = true
      return []
    }
    if (options.args) return scriptResults
    return [{ result: bridgePresent }]
  })
})

describe("background/tools/a11y", () => {
  describe("parseRef / isMainFrameRef / frameTarget", () => {
    it("extrai frameId e ref local de refs de iframe", () => {
      expect(parseRef("f2_ref_10")).toEqual({ frameId: 2, localRef: "ref_10" })
      expect(parseRef("f0_ref_1")).toEqual({ frameId: 0, localRef: "ref_1" })
    })

    it("trata refs sem prefixo como frame principal", () => {
      expect(parseRef("ref_3")).toEqual({ frameId: 0, localRef: "ref_3" })
      expect(parseRef("f2_outra")).toEqual({ frameId: 0, localRef: "f2_outra" })
      expect(parseRef("f_ref_1")).toEqual({ frameId: 0, localRef: "f_ref_1" })
    })

    it("identifica refs do frame principal", () => {
      expect(isMainFrameRef("ref_1")).toBe(true)
      expect(isMainFrameRef("f0_ref_1")).toBe(true)
      expect(isMainFrameRef("f1_ref_1")).toBe(false)
      expect(isMainFrameRef("f12_ref_300")).toBe(false)
    })

    it("monta o alvo de injeção com frameIds", () => {
      expect(frameTarget(5, 0)).toEqual({ tabId: 5, frameIds: [0] })
      expect(frameTarget(5, 3)).toEqual({ tabId: 5, frameIds: [3] })
    })
  })

  describe("assertScriptable", () => {
    it("aceita http(s)", async () => {
      await expect(assertScriptable(TAB_ID)).resolves.toBeUndefined()
      const http = chrome.__state.addTab({ url: "http://exemplo.com/x" })
      await expect(assertScriptable(http.id)).resolves.toBeUndefined()
    })

    it("aceita file://", async () => {
      const file = chrome.__state.addTab({ url: "file:///tmp/pagina.html" })
      await expect(assertScriptable(file.id)).resolves.toBeUndefined()
    })

    it("recusa about:blank com mensagem explicativa", async () => {
      const tab = chrome.__state.addTab({ url: "about:blank" })
      await expect(assertScriptable(tab.id)).rejects.toThrow(
        'A aba está em "about:blank". Use a ferramenta navigate para abrir uma página http(s) antes de ler ou interagir com o conteúdo.',
      )
    })

    it("recusa páginas chrome://", async () => {
      const tab = chrome.__state.addTab({ url: "chrome://settings" })
      await expect(assertScriptable(tab.id)).rejects.toThrow('A aba está em "chrome://settings".')
    })

    it("recusa aba sem URL (aba inexistente)", async () => {
      await expect(assertScriptable(999)).rejects.toThrow('A aba está em "sem URL".')
    })
  })

  describe("ensureBridge", () => {
    it("não injeta quando a ponte já existe", async () => {
      await ensureBridge(TAB_ID, 0)
      expect(probeCalls()).toHaveLength(1)
      expect(injectCall()).toBeUndefined()
      expect(toolCalls()).toHaveLength(0)
    })

    it("injeta assets/content.js quando a ponte está ausente", async () => {
      bridgePresent = false
      await ensureBridge(TAB_ID, 0)
      expect(injectCall()?.files).toEqual(["assets/content.js"])
      expect(injectCall()?.target).toEqual({ tabId: TAB_ID, frameIds: [0] })
      expect(probeCalls()).toHaveLength(2)
    })

    it("lança erro quando a ponte continua ausente após a injeção", async () => {
      bridgePresent = false
      injectionRestoresBridge = false
      await expect(ensureBridge(TAB_ID, 0)).rejects.toThrow(
        "Não foi possível preparar a página. Recarregue a aba e tente novamente (páginas chrome:// e a Chrome Web Store são bloqueadas).",
      )
      expect(injectCall()).toBeDefined()
    })

    it("lança erro específico do frame quando a injeção falha em iframe", async () => {
      bridgePresent = false
      injectionRestoresBridge = false
      await expect(ensureBridge(TAB_ID, 3)).rejects.toThrow("Não foi possível preparar o frame 3.")
      expect(injectCall()?.target).toEqual({ tabId: TAB_ID, frameIds: [3] })
    })

    it("propaga erro de injeção bloqueada", async () => {
      chrome.scripting.executeScript.mockImplementation(async (options: ScriptCall) => {
        calls.push(options)
        if (options.files) throw new Error("Cannot access contents of the page")
        return [{ result: false }]
      })
      await expect(ensureBridge(TAB_ID, 0)).rejects.toThrow("Não foi possível preparar a página.")
    })

    it("não exige página http(s) para frames internos", async () => {
      bridgePresent = false
      injectionRestoresBridge = false
      await expect(ensureBridge(TAB_ID, 2)).rejects.toThrow("Não foi possível preparar o frame 2.")
      expect(injectCall()).toBeDefined()
    })

    it("trata sondagem sem resultado como ponte ausente", async () => {
      chrome.scripting.executeScript.mockImplementation(async (options: ScriptCall) => {
        calls.push(options)
        if (options.args) return scriptResults
        return []
      })

      await expect(ensureBridge(TAB_ID, 2)).rejects.toThrow("Não foi possível preparar o frame 2.")
      expect(injectCall()).toBeDefined()
    })
  })

  describe("chamadas de ferramenta", () => {
    it("lança erro quando a página não devolve dados", async () => {
      scriptResults = []
      await expect(generateTree(TAB_ID, 0, {})).rejects.toThrow("A página não retornou dados.")
    })

    it("lança erro quando result é undefined", async () => {
      scriptResults = [{ frameId: 0, result: undefined }]
      await expect(listElements(TAB_ID, 0)).rejects.toThrow("A página não retornou dados.")
    })

    it("generateTree envia a função generate com as opções", async () => {
      const tree = { pageContent: "[ref_1] Botão", viewport: { width: 800, height: 600 }, count: 1, url: FRAME_URL }
      scriptResults = [{ frameId: 0, result: tree }]

      await expect(generateTree(TAB_ID, 0, { filter: "interactive", depth: 2 })).resolves.toEqual(tree)
      expect(toolCall().target).toEqual({ tabId: TAB_ID, frameIds: [0] })
      expect(toolCall().args).toEqual(["generate", [{ filter: "interactive", depth: 2 }]])
    })

    it("listElements envia a função elements", async () => {
      const elements = [{ ref: "ref_1", role: "button", name: "Ok", tag: "button", rect: { x: 0, y: 0, width: 1, height: 1 } }]
      scriptResults = [{ frameId: 0, result: elements }]

      await expect(listElements(TAB_ID, 0)).resolves.toEqual(elements)
      expect(toolCall().args).toEqual(["elements", []])
    })

    it("pageText envia maxChars", async () => {
      const page = { text: "conteúdo", title: "T", url: FRAME_URL, source: "dom" }
      scriptResults = [{ frameId: 0, result: page }]

      await expect(pageText(TAB_ID, 0, 1234)).resolves.toEqual(page)
      expect(toolCall().args).toEqual(["pageText", [1234]])
    })

    it("resolveRef usa a ref local no frame principal", async () => {
      const element = { ref: "ref_1", role: "button", name: "Ok", tag: "button", rect: { x: 1, y: 2, width: 3, height: 4 }, x: 1, y: 2 }
      scriptResults = [{ frameId: 0, result: element }]

      await expect(resolveRef(TAB_ID, "ref_1")).resolves.toEqual(element)
      expect(toolCall().target).toEqual({ tabId: TAB_ID, frameIds: [0] })
      expect(toolCall().args).toEqual(["resolve", ["ref_1"]])
    })

    it("resolveRef de iframe rejeita com erro explicativo", async () => {
      await expect(resolveRef(TAB_ID, "f2_ref_1")).rejects.toThrow(
        "A ref f2_ref_1 está dentro de um iframe e não tem coordenadas no frame principal. Use ações por ref (click, form_input, type) em vez de coordenadas.",
      )
      expect(toolCalls()).toHaveLength(0)
    })

    it("roteia ações por ref para o frame do prefixo", async () => {
      scriptResults = [{ frameId: 3, result: { ok: true } }]
      const files = [{ data: "YmFzZTY0", name: "a.png" }]

      const cases: Array<{ label: string; run: () => Promise<unknown>; expected: unknown[] }> = [
        { label: "setValue", run: () => setValue(TAB_ID, "f3_ref_9", "texto"), expected: ["setValue", ["ref_9", "texto"]] },
        { label: "clickRef", run: () => clickRef(TAB_ID, "f3_ref_9"), expected: ["clickRef", ["ref_9"]] },
        { label: "hoverRef", run: () => hoverRef(TAB_ID, "f3_ref_9"), expected: ["hoverRef", ["ref_9"]] },
        { label: "scrollRef", run: () => scrollRef(TAB_ID, "f3_ref_9"), expected: ["scrollRef", ["ref_9"]] },
        { label: "focusRef", run: () => focusRef(TAB_ID, "f3_ref_9"), expected: ["focusRef", ["ref_9"]] },
        { label: "uploadFiles", run: () => uploadFiles(TAB_ID, "f3_ref_9", files), expected: ["uploadFiles", ["ref_9", files]] },
      ]

      for (const item of cases) {
        await item.run()
        expect(toolCall().target, item.label).toEqual({ tabId: TAB_ID, frameIds: [3] })
        expect(toolCall().args, item.label).toEqual(item.expected)
      }
    })

    it("roteia ações de refs sem prefixo para o frame principal", async () => {
      scriptResults = [{ frameId: 0, result: { ok: true } }]

      await clickRef(TAB_ID, "ref_2")
      expect(toolCall().target).toEqual({ tabId: TAB_ID, frameIds: [0] })
      expect(toolCall().args).toEqual(["clickRef", ["ref_2"]])

      await setValue(TAB_ID, "ref_2", "v")
      expect(toolCall().target).toEqual({ tabId: TAB_ID, frameIds: [0] })

      await uploadFiles(TAB_ID, "ref_2", [{ data: "x", name: "n" }])
      expect(toolCall().args).toEqual(["uploadFiles", ["ref_2", [{ data: "x", name: "n" }]]])
    })
  })

  describe("generateTreeFrames", () => {
    it("prefixa refs de iframes, ordena por frameId, monta combined e soma count", async () => {
      scriptResults = [
        {
          frameId: 2,
          result: { pageContent: "[ref_1] link", viewport: { width: 100, height: 100 }, count: 1, url: "https://frame.example/" },
        },
        {
          frameId: 0,
          result: { pageContent: "[ref_1] botão", viewport: { width: 800, height: 600 }, count: 2, url: FRAME_URL },
        },
        {
          frameId: 1,
          result: { pageContent: "[ref_9] texto", viewport: { width: 100, height: 100 }, count: 3, url: "https://f1.example/" },
        },
        { frameId: 3, result: undefined },
      ]

      const result = await generateTreeFrames(TAB_ID, { filter: "all" })

      expect(result.frames.map((frame) => frame.frameId)).toEqual([0, 1, 2])
      expect(result.frames[0].pageContent).toBe("[ref_1] botão")
      expect(result.frames[1].pageContent).toBe("[f1_ref_9] texto")
      expect(result.frames[2].pageContent).toBe("[f2_ref_1] link")
      expect(result.count).toBe(6)
      expect(result.combined).toBe(
        [
          "[ref_1] botão",
          "",
          "[frame 1: https://f1.example/]",
          "[f1_ref_9] texto",
          "",
          "[frame 2: https://frame.example/]",
          "[f2_ref_1] link",
        ].join("\n"),
      )
      expect(toolCall().target).toEqual({ tabId: TAB_ID, allFrames: true })
      expect(toolCall().args).toEqual(["generate", [{ filter: "all" }]])
    })

    it("devolve listas vazias quando nenhum frame responde", async () => {
      scriptResults = []
      await expect(generateTreeFrames(TAB_ID, {})).resolves.toEqual({ frames: [], combined: "", count: 0 })
    })
  })

  describe("listElementsFrames", () => {
    it("prefixa refs de frames internos e preserva o principal", async () => {
      scriptResults = [
        { frameId: 0, result: [{ ref: "ref_1", role: "button", name: "Ok", tag: "button", rect: { x: 0, y: 0, width: 1, height: 1 } }] },
        { frameId: 4, result: [{ ref: "ref_1", role: "link", name: "Ir", tag: "a", rect: { x: 0, y: 0, width: 1, height: 1 } }] },
      ]

      const elements = await listElementsFrames(TAB_ID)

      expect(elements.map((element) => element.ref)).toEqual(["ref_1", "f4_ref_1"])
      expect(elements[1].name).toBe("Ir")
      expect(toolCall().target).toEqual({ tabId: TAB_ID, allFrames: true })
      expect(toolCall().args).toEqual(["elements", []])
    })

    it("trata resultados sem frameId como frame principal", async () => {
      scriptResults = [
        { result: [{ ref: "ref_7", role: "button", name: "Ok", tag: "button", rect: { x: 0, y: 0, width: 1, height: 1 } }] },
      ]

      const elements = await listElementsFrames(TAB_ID)

      expect(elements.map((element) => element.ref)).toEqual(["ref_7"])
    })
  })

  describe("pageTextFrames", () => {
    it("concatena o frame principal com os iframes", async () => {
      scriptResults = [
        { frameId: 0, result: { text: "principal", title: "Título", url: FRAME_URL, source: "dom" } },
        { frameId: 2, result: { text: "extra", title: "Frame", url: "https://frame.example/", source: "dom" } },
      ]

      const result = await pageTextFrames(TAB_ID, 5000)

      expect(result.title).toBe("Título")
      expect(result.url).toBe(FRAME_URL)
      expect(result.source).toBe("dom")
      expect(result.text).toBe("principal\n\n---\n\n[frame 2: https://frame.example/]\nextra")
      expect(toolCall().args).toEqual(["pageText", [5000]])
    })

    it("ignora frames com texto vazio", async () => {
      scriptResults = [
        { frameId: 0, result: { text: "principal", title: "T", url: FRAME_URL, source: "dom" } },
        { frameId: 2, result: { text: "   ", title: "Vazio", url: "https://vazio.example/", source: "dom" } },
      ]

      await expect(pageTextFrames(TAB_ID, 1000)).resolves.toMatchObject({ text: "principal" })
    })

    it("usa o primeiro resultado como principal quando não há frame 0, sem duplicar", async () => {
      scriptResults = [{ frameId: 3, result: { text: "só", title: "T", url: "https://f3.example/", source: "dom" } }]

      const result = await pageTextFrames(TAB_ID, 1000)

      expect(result.title).toBe("T")
      expect(result.text).toBe("só")
    })

    it("lança erro quando não há resultados", async () => {
      scriptResults = []
      await expect(pageTextFrames(TAB_ID, 1000)).rejects.toThrow("A página não tem texto legível.")
    })
  })
})
