import { vi } from "vitest"

/**
 * Mock compartilhado do módulo `src/background/tools/a11y` usado pelos testes de
 * `page.ts`, `computer.ts` e `upload.ts`.
 *
 * `parseRef` e `isMainFrameRef` são reimplementados de forma simples (prefixo
 * `f<id>_ref_N`) para preservar o comportamento real sem carregar o módulo.
 */
export function realParseRef(ref: string): { frameId: number; localRef: string } {
  const match = /^f(\d+)_(ref_\d+)$/.exec(ref)
  if (match) return { frameId: Number(match[1]), localRef: match[2] }
  return { frameId: 0, localRef: ref }
}

export const a11yMock = {
  generateTree: vi.fn(),
  generateTreeFrames: vi.fn(),
  listElements: vi.fn(),
  listElementsFrames: vi.fn(),
  pageText: vi.fn(),
  pageTextFrames: vi.fn(),
  setValue: vi.fn(),
  resolveRef: vi.fn(),
  clickRef: vi.fn(),
  hoverRef: vi.fn(),
  scrollRef: vi.fn(),
  focusRef: vi.fn(),
  uploadFiles: vi.fn(),
  parseRef: vi.fn(realParseRef),
  isMainFrameRef: vi.fn((ref: string) => realParseRef(ref).frameId === 0),
  assertScriptable: vi.fn(),
  ensureBridge: vi.fn(),
}

export type A11yMock = typeof a11yMock

/** Limpa o histórico e restaura implementações padrão (o setup usa `restoreMocks`). */
export function resetA11yMock(): void {
  vi.clearAllMocks()
  a11yMock.parseRef.mockImplementation(realParseRef)
  a11yMock.isMainFrameRef.mockImplementation((ref: string) => realParseRef(ref).frameId === 0)
  a11yMock.assertScriptable.mockResolvedValue(undefined)
  a11yMock.ensureBridge.mockResolvedValue(undefined)
  a11yMock.setValue.mockResolvedValue({ ok: true })
  a11yMock.clickRef.mockResolvedValue({ ok: true })
  a11yMock.hoverRef.mockResolvedValue({ ok: true })
  a11yMock.scrollRef.mockResolvedValue({ ok: true })
  a11yMock.focusRef.mockResolvedValue({ ok: true })
  a11yMock.uploadFiles.mockResolvedValue({ ok: true, target: "input" })
}
