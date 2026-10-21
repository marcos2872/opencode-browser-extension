import { resolveRef } from "./a11y"
import { tabContext, withIndicator } from "./tabs"
import type { ToolContext, ToolMap, ToolResult } from "./types"
import { num, requireString, truncate } from "./types"

async function resolveTab(args: Record<string, unknown>, ctx: ToolContext): Promise<number> {
  const requested = typeof args.tabId === "number" ? args.tabId : undefined
  return (await ctx.tabs.resolveTab(ctx.sessionID, requested)).tabId
}

const MODIFIERS: Record<string, number> = {
  alt: 1,
  option: 1,
  ctrl: 2,
  control: 2,
  meta: 4,
  cmd: 4,
  command: 4,
  win: 4,
  shift: 8,
}

function parseKey(input: string): { key: string; modifiers: number } {
  const parts = input.split("+").map((part) => part.trim()).filter(Boolean)
  let modifiers = 0
  const keys: string[] = []
  for (const part of parts) {
    const value = MODIFIERS[part.toLowerCase()]
    if (value !== undefined) modifiers |= value
    else keys.push(part)
  }
  return { key: keys.at(-1) ?? input, modifiers }
}

async function pointFor(
  args: Record<string, unknown>,
  ctx: ToolContext,
  tabId: number,
): Promise<{ x: number; y: number }> {
  const ref = typeof args.ref === "string" ? args.ref : undefined
  if (ref) {
    const element = await resolveRef(tabId, ref)
    if (!element) throw new Error(`Ref ${ref} não encontrada.`)
    return { x: element.x ?? 0, y: element.y ?? 0 }
  }
  const coordinate = args.coordinate
  if (Array.isArray(coordinate) && coordinate.length >= 2) {
    const x = Number(coordinate[0])
    const y = Number(coordinate[1])
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error("Coordenada inválida.")
    return { x, y }
  }
  throw new Error("Informe `ref` ou `coordinate`.")
}

async function adoptOpenerTabs(ctx: ToolContext, tabId: number): Promise<number[]> {
  const tab = await chrome.tabs.get(tabId).catch(() => undefined)
  if (!tab?.windowId) return []
  const groupId = await ctx.tabs.groupOf(ctx.sessionID)
  if (groupId === null) return []
  const tabs = await chrome.tabs.query({ windowId: tab.windowId })
  const adopted: number[] = []
  for (const candidate of tabs) {
    if (candidate.id === undefined || candidate.groupId === groupId) continue
    if (candidate.openerTabId !== tabId) continue
    await ctx.tabs.addTab(ctx.sessionID, candidate.id)
    adopted.push(candidate.id)
  }
  return adopted
}

export const computerTools: ToolMap = {
  async computer(args, ctx): Promise<ToolResult> {
    const tabId = await resolveTab(args, ctx)
    const action = requireString(args, "action")
    const tab = await chrome.tabs.get(tabId).catch(() => undefined)

    if (action === "wait") {
      const seconds = Math.min(Math.max(num(args.duration) ?? 1, 0.1), 10)
      await withIndicator(ctx, tabId, `Aguardando ${seconds}s`, () => sleep(seconds * 1000))
      return { content: `Aguardou ${seconds}s.` }
    }

    if (action === "screenshot") {
      const allowed = await ctx.ask({
        kind: "action",
        tool: "computer",
        title: "Tirar screenshot",
        detail: tab?.title,
        url: tab?.url,
      })
      if (!allowed) return { content: "Screenshot negado pelo usuário." }
      return withIndicator(ctx, tabId, "Capturando screenshot", async () => {
        const data = await ctx.cdp.screenshot(tabId)
        return {
          content: `Screenshot capturado (${tab?.title ?? "página"}).`,
          images: [{ name: `screenshot-${Date.now()}.png`, mime: "image/png", data }],
        }
      })
    }

    if (action === "zoom") {
      const allowed = await ctx.ask({
        kind: "action",
        tool: "computer",
        title: "Capturar região ampliada",
        detail: tab?.title,
        url: tab?.url,
      })
      if (!allowed) return { content: "Captura negada pelo usuário." }
      const region = args.region
      let clip: { x: number; y: number; width: number; height: number; scale: number } | undefined
      if (Array.isArray(region) && region.length >= 4) {
        const [x1, y1, x2, y2] = region.map(Number)
        clip = {
          x: Math.max(0, Math.min(x1, x2)),
          y: Math.max(0, Math.min(y1, y2)),
          width: Math.max(1, Math.abs(x2 - x1)),
          height: Math.max(1, Math.abs(y2 - y1)),
          scale: 2,
        }
      }
      return withIndicator(ctx, tabId, "Capturando região", async () => {
        const data = await ctx.cdp.screenshot(tabId, clip ? { clip } : {})
        return {
          content: "Região capturada.",
          images: [{ name: `zoom-${Date.now()}.png`, mime: "image/png", data }],
        }
      })
    }

    const allowed = await ctx.ask({
      kind: "action",
      tool: "computer",
      title: actionTitle(action),
      detail: actionDetail(args),
      url: tab?.url,
      text: typeof args.text === "string" ? args.text.slice(0, 2000) : undefined,
    })
    if (!allowed) return { content: "Ação negada pelo usuário." }

    if (action === "click") {
      const point = await pointFor(args, ctx, tabId)
      const button = args.button === "right" ? "right" : args.button === "middle" ? "middle" : "left"
      const count = Math.min(Math.max(num(args.click_count) ?? num(args.clickCount) ?? 1, 1), 3)
      await ctx.cursor(tabId, point.x, point.y)
      await ctx.indicator(tabId, "Clicando", true)
      await ctx.cdp.mouse(tabId, "mouseMoved", point.x, point.y)
      for (let index = 1; index <= count; index += 1) {
        await ctx.cdp.mouse(tabId, "mousePressed", point.x, point.y, { button, clickCount: index })
        await ctx.cdp.mouse(tabId, "mouseReleased", point.x, point.y, { button, clickCount: index })
      }
      await sleep(250)
      const adopted = await adoptOpenerTabs(ctx, tabId)
      await ctx.hideIndicator(tabId)
      const suffix =
        adopted.length > 0
          ? `\nA nova aba abriu como Tab ID ${adopted.join(", ")} e entrou no grupo desta sessão.`
          : ""
      return { content: `Clique em (${Math.round(point.x)}, ${Math.round(point.y)}).${suffix}` }
    }

    if (action === "hover") {
      const point = await pointFor(args, ctx, tabId)
      await ctx.cursor(tabId, point.x, point.y)
      await ctx.cdp.mouse(tabId, "mouseMoved", point.x, point.y)
      return { content: `Hover em (${Math.round(point.x)}, ${Math.round(point.y)}).` }
    }

    if (action === "type") {
      const text = typeof args.text === "string" ? args.text : ""
      if (!text) throw new Error("Informe `text`.")
      if (typeof args.ref === "string") {
        const point = await pointFor(args, ctx, tabId)
        await ctx.cursor(tabId, point.x, point.y)
        await ctx.cdp.mouse(tabId, "mousePressed", point.x, point.y, { button: "left", clickCount: 1 })
        await ctx.cdp.mouse(tabId, "mouseReleased", point.x, point.y, { button: "left", clickCount: 1 })
        await sleep(100)
      }
      await ctx.indicator(tabId, "Digitando", true)
      await ctx.cdp.text(tabId, text)
      if (args.submit === true) {
        await ctx.cdp.key(tabId, "keyDown", "Enter", { code: "Enter", windowsVirtualKeyCode: 13 })
        await ctx.cdp.key(tabId, "keyUp", "Enter", { code: "Enter", windowsVirtualKeyCode: 13 })
      }
      await sleep(150)
      await adoptOpenerTabs(ctx, tabId)
      await ctx.hideIndicator(tabId)
      return { content: `Digitou ${text.length} caractere(s)${args.submit === true ? " e pressionou Enter" : ""}.` }
    }

    if (action === "key") {
      const raw = requireString(args, "keys")
      const { key, modifiers } = parseKey(raw)
      await ctx.cdp.key(tabId, "keyDown", key, { modifiers, code: key })
      await ctx.cdp.key(tabId, "keyUp", key, { modifiers, code: key })
      await sleep(150)
      await adoptOpenerTabs(ctx, tabId)
      return { content: `Tecla ${raw} pressionada.` }
    }

    if (action === "scroll") {
      const direction = typeof args.scroll_direction === "string" ? args.scroll_direction : "down"
      const amount = Math.min(Math.max(num(args.scroll_amount) ?? 600, 50), 5000)
      const point =
        typeof args.ref === "string" || Array.isArray(args.coordinate)
          ? await pointFor(args, ctx, tabId)
          : await center(tabId)
      const deltaX = direction === "left" ? -amount : direction === "right" ? amount : 0
      const deltaY = direction === "up" ? -amount : direction === "down" ? amount : 0
      await ctx.indicator(tabId, "Rolando", true)
      await ctx.cdp.wheel(tabId, point.x, point.y, deltaX, deltaY)
      await sleep(250)
      await ctx.hideIndicator(tabId)
      return { content: `Scroll ${direction} de ${amount}px.` }
    }

    throw new Error(`Ação desconhecida: ${action}`)
  },

  async javascript_tool(args, ctx): Promise<ToolResult> {
    const tabId = await resolveTab(args, ctx)
    const code = requireString(args, "text")
    const tab = await chrome.tabs.get(tabId).catch(() => undefined)
    const allowed = await ctx.ask({
      kind: "action",
      tool: "javascript_tool",
      title: "Executar JavaScript na página",
      detail: tab?.title,
      url: tab?.url,
      text: code.slice(0, 2000),
    })
    if (!allowed) return { content: "Execução negada pelo usuário." }
    return withIndicator(ctx, tabId, "Executando JavaScript", async () => {
      const result = await ctx.cdp.evaluate(tabId, code, { awaitPromise: true, timeoutMs: 10_000 })
      if (result.exception) {
        return { content: `Erro de execução: ${truncate(result.exception, 5000)}` }
      }
      const value = result.value
      const text =
        value === undefined
          ? "undefined"
          : typeof value === "string"
            ? value
            : JSON.stringify(value, null, 2)
      return { content: truncate(text), metadata: { tabId } }
    })
  },

  async read_console_messages(args, ctx): Promise<ToolResult> {
    const tabId = await resolveTab(args, ctx)
    await ctx.cdp.enableRuntime(tabId)
    await sleep(200)
    const pattern = typeof args.pattern === "string" ? args.pattern : undefined
    const onlyErrors = args.onlyErrors === true || args.only_errors === true
    const limit = Math.min(Math.max(num(args.limit) ?? 100, 1), 500)
    const clear = args.clear === true
    const tab = await chrome.tabs.get(tabId).catch(() => undefined)
    const host = ctx.permissions.hostOf(tab?.url)
    const entries = ctx.cdp
      .consoleMessages(tabId)
      .filter((entry) => !entry.domain || !host || entry.domain === host)
      .filter((entry) => !onlyErrors || entry.type === "error" || entry.type === "exception")
      .filter((entry) => !pattern || entry.text.toLowerCase().includes(pattern.toLowerCase()))
    if (clear) ctx.cdp.clearConsole(tabId)
    if (entries.length === 0) {
      return {
        content:
          "Nenhuma mensagem de console encontrada.\n\nO monitoramento começa quando esta ferramenta é usada; recarregue a página para capturar mensagens do carregamento.",
      }
    }
    const slice = entries.slice(-limit)
    const lines = slice.map((entry, index) => {
      const where = entry.url && entry.lineNumber !== undefined ? ` (${entry.url}:${entry.lineNumber})` : ""
      return `[${index + 1}] [${entry.type.toUpperCase()}]${where}\n${entry.text}`
    })
    return { content: `Encontradas ${entries.length} mensagem(ns)${entries.length > limit ? ` (mostrando ${limit})` : ""}:\n\n${lines.join("\n\n")}` }
  },

  async read_network_requests(args, ctx): Promise<ToolResult> {
    const tabId = await resolveTab(args, ctx)
    await ctx.cdp.enableNetwork(tabId)
    await sleep(200)
    const pattern = typeof args.urlPattern === "string" ? args.urlPattern : typeof args.url_pattern === "string" ? args.url_pattern : undefined
    const limit = Math.min(Math.max(num(args.limit) ?? 100, 1), 500)
    const clear = args.clear === true
    const entries = ctx.cdp
      .networkRequests(tabId)
      .filter((entry) => !pattern || entry.url.toLowerCase().includes(pattern.toLowerCase()))
    if (clear) ctx.cdp.clearNetwork(tabId)
    if (entries.length === 0) {
      return {
        content:
          "Nenhuma requisição encontrada.\n\nO monitoramento começa quando esta ferramenta é usada; recarregue a página para capturar as requisições iniciais.",
      }
    }
    const slice = entries.slice(-limit)
    const lines = slice.map(
      (entry, index) => `${index + 1}. url: ${entry.url}\n   method: ${entry.method}\n   statusCode: ${entry.status ?? "pending"}`,
    )
    return { content: `Encontradas ${entries.length} requisição(ões)${entries.length > limit ? ` (mostrando ${limit})` : ""}:\n\n${lines.join("\n\n")}` }
  },
}

function actionTitle(action: string): string {
  switch (action) {
    case "click":
      return "Clicar na página"
    case "type":
      return "Digitar na página"
    case "key":
      return "Pressionar tecla"
    case "scroll":
      return "Rolar a página"
    case "hover":
      return "Mover o mouse"
    default:
      return `Ação: ${action}`
  }
}

function actionDetail(args: Record<string, unknown>): string | undefined {
  if (typeof args.ref === "string") return `Elemento ${args.ref}`
  if (Array.isArray(args.coordinate)) return `Coordenada ${args.coordinate.slice(0, 2).join(", ")}`
  if (typeof args.keys === "string") return args.keys
  return undefined
}

async function center(tabId: number): Promise<{ x: number; y: number }> {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId, frameIds: [0] },
    func: () => ({ x: Math.round(window.innerWidth / 2), y: Math.round(window.innerHeight / 2) }),
  })
  return (result?.result as { x: number; y: number } | undefined) ?? { x: 400, y: 300 }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
