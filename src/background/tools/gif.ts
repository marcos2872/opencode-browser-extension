import type { Recording } from "../recording"
import type { ToolMap, ToolResult } from "./types"
import { requireString } from "./types"

export function gifTools(recording: Recording): ToolMap {
  return {
    async gif_creator(args, ctx): Promise<ToolResult> {
      const action = requireString(args, "action")
      if (action === "start") {
        recording.start(ctx.sessionID)
        const { tabId } = await ctx.tabs.resolveTab(ctx.sessionID)
        await recording.capture(tabId, "início da gravação")
        return { content: "Gravação iniciada. Cada ação do agente gera um quadro (máx. 30)." }
      }
      if (action === "stop") {
        await recording.stop()
        return {
          content: `Gravação parada (${recording.count} quadro(s)). Use action=export para gerar o GIF.`,
        }
      }
      if (action === "export") {
        const frames = await recording.take()
        if (frames.length === 0) {
          throw new Error("Nenhum quadro gravado. Use action=start antes de navegar/interagir.")
        }
        const requested = typeof args.tabId === "number" ? args.tabId : undefined
        const tab = await chrome.tabs
          .get((await ctx.tabs.resolveTab(ctx.sessionID, requested)).tabId)
          .catch(() => undefined)
        const allowed = await ctx.ask({
          kind: "action",
          tool: "gif_creator",
          title: "Exportar GIF da gravação",
          detail: `${frames.length} quadros`,
          url: tab?.url,
        })
        if (!allowed) return { content: "Exportação negada pelo usuário." }
        const response = (await chrome.runtime.sendMessage({
          type: "ENCODE_GIF",
          frames,
          delay: 600,
        })) as { data?: string; error?: string } | undefined
        if (!response?.data) {
          throw new Error(response?.error ?? "Falha ao gerar o GIF (offscreen indisponível).")
        }
        const filename = `opencode-browser-${Date.now()}.gif`
        try {
          await chrome.downloads.download({
            url: `data:image/gif;base64,${response.data}`,
            filename,
            saveAs: false,
          })
        } catch {
          // O download pode falhar; o GIF ainda é devolvido no resultado.
        }
        recording.clear()
        const size = Math.round((response.data.length * 3) / 4 / 1024)
        return {
          content: `GIF gerado (${frames.length} quadros, ~${size} KB) e salvo em Downloads/${filename}.`,
          images: [{ name: filename, mime: "image/gif", data: response.data }],
          metadata: { frames: frames.length, filename },
        }
      }
      throw new Error(`Ação desconhecida: ${action}. Use start, stop ou export.`)
    },
  }
}
