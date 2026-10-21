import { generateTree, listElements, pageText, setValue } from "./a11y"
import { tabContext, withIndicator } from "./tabs"
import type { ToolMap, ToolResult } from "./types"
import { requireString, treeOptions, truncate } from "./types"

async function resolveTab(args: Record<string, unknown>, ctx: Parameters<NonNullable<ToolMap[string]>>[1]) {
  const requested = typeof args.tabId === "number" ? args.tabId : undefined
  return (await ctx.tabs.resolveTab(ctx.sessionID, requested)).tabId
}

export const pageTools: ToolMap = {
  async read_page(args, ctx): Promise<ToolResult> {
    const tabId = await resolveTab(args, ctx)
    return withIndicator(ctx, tabId, "Lendo a página", async () => {
      const tree = await generateTree(tabId, treeOptions(args))
      const tabs = await tabContext(ctx, tabId)
      const content = `${truncate(tree.pageContent)}\n\nViewport: ${tree.viewport.width}x${tree.viewport.height}\n\n${tabs}`
      return { content, metadata: { count: tree.count } }
    })
  },

  async find(args, ctx): Promise<ToolResult> {
    const tabId = await resolveTab(args, ctx)
    const query = requireString(args, "query")
    const max = typeof args.max_results === "number" ? Math.min(Math.max(args.max_results, 1), 50) : 20
    return withIndicator(ctx, tabId, `Procurando: ${query}`, async () => {
      const elements = await listElements(tabId)
      const tokens = query
        .toLowerCase()
        .split(/\s+/)
        .map((token) => token.trim())
        .filter(Boolean)
      const scored = elements
        .map((element) => {
          const haystack = [element.role, element.name, element.tag, element.type, element.value]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
          let score = 0
          for (const token of tokens) if (haystack.includes(token)) score += 2
          if (element.name.toLowerCase().includes(query.toLowerCase())) score += 3
          if (element.role.toLowerCase() === query.toLowerCase()) score += 2
          return { element, score }
        })
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, max)

      if (scored.length === 0) {
        return {
          content: `Nenhum elemento encontrado para "${query}".\nTente termos mais simples ou use read_page com filter "interactive".`,
        }
      }
      const lines = scored.map(
        ({ element }) =>
          `- ${element.ref}: ${element.role}${element.name ? ` "${element.name}"` : ""}${
            element.type ? ` (${element.type})` : ""
          }${element.disabled ? " (disabled)" : ""}`,
      )
      return {
        content: `Encontrados ${scored.length} elemento(s) para "${query}":\n\n${lines.join("\n")}\n\n${await tabContext(
          ctx,
          tabId,
        )}`,
        metadata: { count: scored.length },
      }
    })
  },

  async get_page_text(args, ctx): Promise<ToolResult> {
    const tabId = await resolveTab(args, ctx)
    const max = typeof args.max_chars === "number" ? Math.min(Math.max(args.max_chars, 1000), 200_000) : 50_000
    return withIndicator(ctx, tabId, "Extraindo texto", async () => {
      const page = await pageText(tabId, max)
      if (!page.text.trim()) throw new Error("A página não tem texto legível.")
      return {
        content: `Title: ${page.title}\nURL: ${page.url}\nSource: <${page.source}>\n---\n${truncate(
          page.text,
          max,
        )}`,
        metadata: { source: page.source },
      }
    })
  },

  async form_input(args, ctx): Promise<ToolResult> {
    const tabId = await resolveTab(args, ctx)
    const ref = requireString(args, "ref")
    const value =
      typeof args.value === "string"
        ? args.value
        : typeof args.value === "number" || typeof args.value === "boolean"
          ? String(args.value)
          : ""
    const tab = await chrome.tabs.get(tabId).catch(() => undefined)
    const allowed = await ctx.ask({
      kind: "action",
      tool: "form_input",
      title: `Preencher campo ${ref}`,
      detail: tab?.title,
      url: tab?.url,
      text: value.slice(0, 2000),
    })
    if (!allowed) return { content: "Preenchimento negado pelo usuário." }
    const result = await withIndicator(ctx, tabId, `Preenchendo ${ref}`, () => setValue(tabId, ref, value))
    if (!result.ok) throw new Error(result.error ?? "Falha ao preencher o campo.")
    return {
      content: `Campo ${ref} preenchido.\n\n${await tabContext(ctx, tabId)}`,
      metadata: { ref },
    }
  },
}
