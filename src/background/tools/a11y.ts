export interface TreeOptions {
  filter?: "interactive" | "all"
  depth?: number
  refId?: string
  maxChars?: number
  includeHidden?: boolean
}

export interface A11yElement {
  ref: string
  role: string
  name: string
  tag: string
  type?: string
  value?: string
  checked?: boolean
  disabled?: boolean
  rect: { x: number; y: number; width: number; height: number }
  x?: number
  y?: number
}

export interface TreeResult {
  pageContent: string
  viewport: { width: number; height: number }
  count: number
}

const CONTENT_SCRIPT = "assets/content.js"

async function hasBridge(tabId: number): Promise<boolean> {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId, frameIds: [0] },
      func: () => Boolean((window as unknown as { __opencodeA11y?: unknown }).__opencodeA11y),
    })
    return Boolean(results[0]?.result)
  } catch {
    return false
  }
}

export async function assertScriptable(tabId: number): Promise<void> {
  const tab = await chrome.tabs.get(tabId).catch(() => undefined)
  const url = tab?.url ?? ""
  if (!/^https?:\/\//i.test(url) && !/^file:\/\//i.test(url)) {
    throw new Error(
      `A aba está em "${url || "sem URL"}". Use a ferramenta navigate para abrir uma página http(s) antes de ler ou interagir com o conteúdo.`,
    )
  }
}

export async function ensureBridge(tabId: number): Promise<void> {
  await assertScriptable(tabId)
  if (await hasBridge(tabId)) return
  await chrome.scripting.executeScript({
    target: { tabId, frameIds: [0] },
    files: [CONTENT_SCRIPT],
  })
  if (!(await hasBridge(tabId))) {
    throw new Error(
      "Não foi possível preparar a página. Recarregue a aba e tente novamente (páginas chrome:// e a Chrome Web Store são bloqueadas).",
    )
  }
}

async function call<T>(tabId: number, fn: "generate" | "elements" | "resolve" | "setValue" | "pageText", args: unknown[]): Promise<T> {
  await ensureBridge(tabId)
  const results = await chrome.scripting.executeScript({
    target: { tabId, frameIds: [0] },
    func: (name: string, params: unknown[]) => {
      const api = (window as unknown as { __opencodeA11y?: Record<string, (...input: unknown[]) => unknown> })
        .__opencodeA11y
      if (!api || typeof api[name] !== "function") throw new Error("Ponte da página indisponível.")
      return api[name](...params)
    },
    args: [fn, args],
  })
  if (results[0]?.result === undefined) {
    throw new Error("A página não retornou dados.")
  }
  return results[0].result as T
}

export function generateTree(tabId: number, options: TreeOptions): Promise<TreeResult> {
  return call<TreeResult>(tabId, "generate", [options])
}

export function listElements(tabId: number): Promise<A11yElement[]> {
  return call<A11yElement[]>(tabId, "elements", [])
}

export function resolveRef(tabId: number, ref: string): Promise<A11yElement | null> {
  return call<A11yElement | null>(tabId, "resolve", [ref])
}

export function setValue(tabId: number, ref: string, value: string): Promise<{ ok: boolean; error?: string }> {
  return call<{ ok: boolean; error?: string }>(tabId, "setValue", [ref, value])
}

export function pageText(
  tabId: number,
  maxChars: number,
): Promise<{ text: string; title: string; url: string; source: string }> {
  return call<{ text: string; title: string; url: string; source: string }>(tabId, "pageText", [maxChars])
}
