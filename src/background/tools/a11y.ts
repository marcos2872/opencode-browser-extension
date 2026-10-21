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
  url: string
}

export interface FrameTree extends TreeResult {
  frameId: number
}

export interface UploadFile {
  data: string
  name: string
  mimeType?: string
}

const CONTENT_SCRIPT = "assets/content.js"
const FRAME_PREFIX = /^f(\d+)_(ref_\d+)$/

export function parseRef(ref: string): { frameId: number; localRef: string } {
  const match = FRAME_PREFIX.exec(ref)
  if (match) return { frameId: Number(match[1]), localRef: match[2] }
  return { frameId: 0, localRef: ref }
}

export function isMainFrameRef(ref: string): boolean {
  return parseRef(ref).frameId === 0
}

export function frameTarget(tabId: number, frameId: number): chrome.scripting.InjectionTarget {
  return frameId === 0 ? { tabId, frameIds: [0] } : { tabId, frameIds: [frameId] }
}

async function hasBridge(tabId: number, frameId: number): Promise<boolean> {
  try {
    const results = await chrome.scripting.executeScript({
      target: frameTarget(tabId, frameId),
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

export async function ensureBridge(tabId: number, frameId = 0): Promise<void> {
  if (frameId === 0) await assertScriptable(tabId)
  if (await hasBridge(tabId, frameId)) return
  try {
    await chrome.scripting.executeScript({
      target: frameTarget(tabId, frameId),
      files: [CONTENT_SCRIPT],
    })
  } catch {
    throw new Error(
      frameId === 0
        ? "Não foi possível preparar a página. Recarregue a aba e tente novamente (páginas chrome:// e a Chrome Web Store são bloqueadas)."
        : `Não foi possível preparar o frame ${frameId}.`,
    )
  }
  if (!(await hasBridge(tabId, frameId))) {
    throw new Error(
      frameId === 0
        ? "Não foi possível preparar a página. Recarregue a aba e tente novamente (páginas chrome:// e a Chrome Web Store são bloqueadas)."
        : `Não foi possível preparar o frame ${frameId}.`,
    )
  }
}

async function call<T>(
  tabId: number,
  frameId: number,
  fn: string,
  args: unknown[],
): Promise<T> {
  await ensureBridge(tabId, frameId)
  const results = await chrome.scripting.executeScript({
    target: frameTarget(tabId, frameId),
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

export function generateTree(tabId: number, frameId: number, options: TreeOptions): Promise<TreeResult> {
  return call<TreeResult>(tabId, frameId, "generate", [options])
}

export function listElements(tabId: number, frameId: number): Promise<A11yElement[]> {
  return call<A11yElement[]>(tabId, frameId, "elements", [])
}

export function resolveRef(tabId: number, ref: string): Promise<A11yElement | null> {
  const { frameId, localRef } = parseRef(ref)
  if (frameId !== 0) {
    throw new Error(
      `A ref ${ref} está dentro de um iframe e não tem coordenadas no frame principal. Use ações por ref (click, form_input, type) em vez de coordenadas.`,
    )
  }
  return call<A11yElement | null>(tabId, 0, "resolve", [localRef])
}

export function setValue(tabId: number, ref: string, value: string): Promise<{ ok: boolean; error?: string }> {
  const { frameId, localRef } = parseRef(ref)
  return call<{ ok: boolean; error?: string }>(tabId, frameId, "setValue", [localRef, value])
}

export function clickRef(tabId: number, ref: string): Promise<{ ok: boolean; error?: string }> {
  const { frameId, localRef } = parseRef(ref)
  return call<{ ok: boolean; error?: string }>(tabId, frameId, "clickRef", [localRef])
}

export function hoverRef(tabId: number, ref: string): Promise<{ ok: boolean; error?: string }> {
  const { frameId, localRef } = parseRef(ref)
  return call<{ ok: boolean; error?: string }>(tabId, frameId, "hoverRef", [localRef])
}

export function scrollRef(tabId: number, ref: string): Promise<{ ok: boolean; error?: string }> {
  const { frameId, localRef } = parseRef(ref)
  return call<{ ok: boolean; error?: string }>(tabId, frameId, "scrollRef", [localRef])
}

export function focusRef(tabId: number, ref: string): Promise<{ ok: boolean; error?: string }> {
  const { frameId, localRef } = parseRef(ref)
  return call<{ ok: boolean; error?: string }>(tabId, frameId, "focusRef", [localRef])
}

export function uploadFiles(
  tabId: number,
  ref: string,
  files: UploadFile[],
): Promise<{ ok: boolean; target?: string; error?: string }> {
  const { frameId, localRef } = parseRef(ref)
  return call<{ ok: boolean; target?: string; error?: string }>(tabId, frameId, "uploadFiles", [localRef, files])
}

export function pageText(
  tabId: number,
  frameId: number,
  maxChars: number,
): Promise<{ text: string; title: string; url: string; source: string }> {
  return call<{ text: string; title: string; url: string; source: string }>(tabId, frameId, "pageText", [maxChars])
}

async function allFrames<T>(tabId: number, fn: string, args: unknown[]): Promise<Array<{ frameId: number; result: T }>> {
  await ensureBridge(tabId, 0)
  const results = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: (name: string, params: unknown[]) => {
      const api = (window as unknown as { __opencodeA11y?: Record<string, (...input: unknown[]) => unknown> })
        .__opencodeA11y
      if (!api || typeof api[name] !== "function") return undefined
      try {
        return api[name](...params)
      } catch {
        return undefined
      }
    },
    args: [fn, args],
  })
  return results
    .filter((item) => item.result !== undefined)
    .map((item) => ({ frameId: item.frameId ?? 0, result: item.result as T }))
}

function prefixRefs(text: string, frameId: number): string {
  if (frameId === 0) return text
  return text.replace(/\[ref_(\d+)\]/g, `[f${frameId}_ref_$1]`)
}

export async function generateTreeFrames(
  tabId: number,
  options: TreeOptions,
): Promise<{ frames: FrameTree[]; combined: string; count: number }> {
  const results = await allFrames<TreeResult>(tabId, "generate", [options])
  const frames: FrameTree[] = results.map(({ frameId, result }) => ({
    frameId,
    ...result,
    pageContent: prefixRefs(result.pageContent, frameId),
  }))
  frames.sort((a, b) => a.frameId - b.frameId)
  const combined = frames
    .map((frame) =>
      frame.frameId === 0
        ? frame.pageContent
        : `[frame ${frame.frameId}: ${frame.url}]\n${frame.pageContent}`,
    )
    .join("\n\n")
  const count = frames.reduce((total, frame) => total + frame.count, 0)
  return { frames, combined, count }
}

export async function listElementsFrames(tabId: number): Promise<A11yElement[]> {
  const results = await allFrames<A11yElement[]>(tabId, "elements", [])
  const output: A11yElement[] = []
  for (const { frameId, result } of results) {
    for (const element of result) {
      output.push({ ...element, ref: frameId === 0 ? element.ref : `f${frameId}_${element.ref}` })
    }
  }
  return output
}

export async function pageTextFrames(
  tabId: number,
  maxChars: number,
): Promise<{ text: string; title: string; url: string; source: string }> {
  const results = await allFrames<{ text: string; title: string; url: string; source: string }>(
    tabId,
    "pageText",
    [maxChars],
  )
  if (results.length === 0) throw new Error("A página não tem texto legível.")
  const main = results.find((item) => item.frameId === 0)?.result ?? results[0].result
  const extras = results
    .filter((item) => item.frameId !== 0 && item.result.text.trim())
    .map((item) => `[frame ${item.frameId}: ${item.result.url}]\n${item.result.text}`)
  const text = [main.text, ...extras].filter(Boolean).join("\n\n---\n\n")
  return { ...main, text }
}
