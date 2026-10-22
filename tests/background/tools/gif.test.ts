import { beforeEach, describe, expect, it, vi } from "vitest"
import { gifTools } from "../../../src/background/tools/gif"
import { Recording } from "../../../src/background/recording"
import type { Cdp } from "../../../src/background/cdp"
import { makeToolContext } from "../../helpers/factories"

function makeRecording() {
  const cdp = { screenshot: vi.fn(async () => "ZnJhbWU=") }
  const recording = new Recording(cdp as unknown as Cdp)
  return { recording, cdp }
}

async function recordingWithFrames(count: number) {
  const { recording, cdp } = makeRecording()
  recording.start("ses_test")
  for (let index = 0; index < count; index += 1) {
    await recording.capture(1, `quadro ${index + 1}`)
  }
  return { recording, cdp }
}

beforeEach(() => {
  chrome.__state.addTab({ id: 1, url: "https://example.com/", title: "Exemplo", status: "complete" })
})

describe("background/tools/gif", () => {
  describe("start", () => {
    it("inicia a gravação e captura o quadro inicial", async () => {
      const { recording, cdp } = makeRecording()
      const tools = gifTools(recording)
      const { ctx, tabs } = makeToolContext()

      const result = await tools.gif_creator({ action: "start" }, ctx)

      expect(recording.active).toBe(true)
      expect(recording.count).toBe(1)
      expect(tabs.resolveTab).toHaveBeenCalledWith("ses_test")
      expect(cdp.screenshot).toHaveBeenCalledWith(1)
      expect(result.content).toBe("Gravação iniciada. Cada ação do agente gera um quadro (máx. 30).")
    })
  })

  describe("stop", () => {
    it("para a gravação e informa a contagem de quadros", async () => {
      const { recording } = await recordingWithFrames(2)
      const tools = gifTools(recording)
      const { ctx } = makeToolContext()

      const result = await tools.gif_creator({ action: "stop" }, ctx)

      expect(recording.active).toBe(false)
      expect(result.content).toBe("Gravação parada (2 quadro(s)). Use action=export para gerar o GIF.")
    })
  })

  describe("export", () => {
    it("exige quadros gravados", async () => {
      const { recording } = makeRecording()
      const tools = gifTools(recording)
      const { ctx } = makeToolContext()

      await expect(tools.gif_creator({ action: "export" }, ctx)).rejects.toThrow(
        "Nenhum quadro gravado. Use action=start antes de navegar/interagir.",
      )
      expect(chrome.runtime.sendMessage).not.toHaveBeenCalled()
    })

    it("respeita a negação do usuário", async () => {
      const { recording } = await recordingWithFrames(1)
      const tools = gifTools(recording)
      const { ctx, ask } = makeToolContext()
      ask.mockResolvedValue(false)

      const result = await tools.gif_creator({ action: "export" }, ctx)

      expect(ask).toHaveBeenCalledWith({
        kind: "action",
        tool: "gif_creator",
        title: "Exportar GIF da gravação",
        detail: "1 quadros",
        url: "https://example.com/",
      })
      expect(result.content).toBe("Exportação negada pelo usuário.")
      expect(chrome.runtime.sendMessage).not.toHaveBeenCalled()
      expect(recording.count).toBe(1)
    })

    it("propaga o erro devolvido pelo codificador", async () => {
      const { recording } = await recordingWithFrames(1)
      const tools = gifTools(recording)
      const { ctx } = makeToolContext()
      chrome.runtime.sendMessage.mockResolvedValue({ error: "offscreen explodiu" })

      await expect(tools.gif_creator({ action: "export" }, ctx)).rejects.toThrow("offscreen explodiu")
      expect(chrome.downloads.download).not.toHaveBeenCalled()
    })

    it("usa mensagem padrão quando o codificador não responde", async () => {
      const { recording } = await recordingWithFrames(1)
      const tools = gifTools(recording)
      const { ctx } = makeToolContext()
      chrome.runtime.sendMessage.mockResolvedValue(undefined)

      await expect(tools.gif_creator({ action: "export" }, ctx)).rejects.toThrow(
        "Falha ao gerar o GIF (offscreen indisponível).",
      )
    })

    it("gera o GIF, baixa o arquivo e limpa os quadros", async () => {
      const { recording } = await recordingWithFrames(2)
      const tools = gifTools(recording)
      const { ctx } = makeToolContext()
      chrome.runtime.sendMessage.mockResolvedValue({ data: "R0lGODlhAQABAAAAACw=" })
      chrome.downloads.download.mockResolvedValue(7)

      const result = await tools.gif_creator({ action: "export" }, ctx)

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: "ENCODE_GIF",
        frames: [
          { data: "ZnJhbWU=", label: "quadro 1" },
          { data: "ZnJhbWU=", label: "quadro 2" },
        ],
        delay: 600,
      })
      expect(chrome.downloads.download).toHaveBeenCalledWith({
        url: "data:image/gif;base64,R0lGODlhAQABAAAAACw=",
        filename: expect.stringMatching(/^opencode-browser-\d+\.gif$/),
        saveAs: false,
      })
      expect(result.images).toEqual([
        {
          name: expect.stringMatching(/^opencode-browser-\d+\.gif$/),
          mime: "image/gif",
          data: "R0lGODlhAQABAAAAACw=",
        },
      ])
      expect(result.metadata).toMatchObject({ frames: 2 })
      expect(result.content).toContain("GIF gerado (2 quadros")
      expect(recording.count).toBe(0)
    })

    it("devolve o GIF mesmo quando o download falha", async () => {
      const { recording } = await recordingWithFrames(1)
      const tools = gifTools(recording)
      const { ctx } = makeToolContext()
      chrome.runtime.sendMessage.mockResolvedValue({ data: "R0lGODlh" })
      chrome.downloads.download.mockRejectedValue(new Error("download bloqueado"))

      const result = await tools.gif_creator({ action: "export" }, ctx)

      expect(result.images?.[0].data).toBe("R0lGODlh")
      expect(recording.count).toBe(0)
    })

    it("resolve a aba informada em tabId", async () => {
      const { recording } = await recordingWithFrames(1)
      const tools = gifTools(recording)
      const { ctx, tabs } = makeToolContext()
      chrome.runtime.sendMessage.mockResolvedValue({ data: "R0lGODlh" })

      await tools.gif_creator({ action: "export", tabId: 9 }, ctx)

      expect(tabs.resolveTab).toHaveBeenCalledWith("ses_test", 9)
    })

    it("exporta mesmo quando a aba não existe mais", async () => {
      const { recording } = await recordingWithFrames(1)
      const tools = gifTools(recording)
      const { ctx, ask } = makeToolContext()
      chrome.tabs.get.mockRejectedValue(new Error("No tab with id: 1"))
      chrome.runtime.sendMessage.mockResolvedValue({ data: "R0lGODlh" })

      const result = await tools.gif_creator({ action: "export" }, ctx)

      expect(ask).toHaveBeenCalledWith(expect.objectContaining({ url: undefined }))
      expect(result.images?.[0].data).toBe("R0lGODlh")
    })
  })

  it("lança erro para ação desconhecida", async () => {
    const { recording } = makeRecording()
    const tools = gifTools(recording)
    const { ctx } = makeToolContext()

    await expect(tools.gif_creator({ action: "pause" }, ctx)).rejects.toThrow(
      "Ação desconhecida: pause. Use start, stop ou export.",
    )
  })

  it("exige action", async () => {
    const { recording } = makeRecording()
    const tools = gifTools(recording)
    const { ctx } = makeToolContext()

    await expect(tools.gif_creator({}, ctx)).rejects.toThrow("Parâmetro obrigatório ausente: action.")
  })
})
