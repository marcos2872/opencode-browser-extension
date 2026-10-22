import { vi } from "vitest"
import type { ToolContext } from "../../src/background/tools/types"
import type { AgentInfo, ChatMessage, CommandInfo, ModelInfo, SessionInfo } from "../../src/shared/types"

export function makeModel(partial: Partial<ModelInfo> = {}): ModelInfo {
  return {
    id: "model-1",
    providerID: "provider-1",
    name: "Model One",
    capabilities: { tools: true },
    ...partial,
  }
}

export function makeSession(partial: Partial<SessionInfo> = {}): SessionInfo {
  return {
    id: "ses_test",
    title: "Sessão de teste",
    model: { id: "model-1", providerID: "provider-1" },
    agent: "build",
    time: { created: 1, updated: 2 },
    ...partial,
  }
}

export function makeAgent(partial: Partial<AgentInfo> = {}): AgentInfo {
  return { id: "build", name: "Build", mode: "primary", ...partial }
}

export function makeCommand(partial: Partial<CommandInfo> = {}): CommandInfo {
  return { name: "review", description: "Revisa o diff", ...partial }
}

export function makeMessage(partial: Partial<Extract<ChatMessage, { kind: "assistant" }>> = {}): ChatMessage {
  return {
    kind: "assistant",
    id: "msg_1",
    text: "ok",
    reasoning: "",
    tools: [],
    time: 1,
    streaming: false,
    ...partial,
  }
}

export interface ToolContextMocks {
  ctx: ToolContext
  cdp: Record<string, ReturnType<typeof vi.fn>>
  tabs: Record<string, ReturnType<typeof vi.fn>>
  permissions: Record<string, ReturnType<typeof vi.fn>>
  ask: ReturnType<typeof vi.fn>
  rank: ReturnType<typeof vi.fn>
  indicator: ReturnType<typeof vi.fn>
  hideIndicator: ReturnType<typeof vi.fn>
  cursor: ReturnType<typeof vi.fn>
  progress: ReturnType<typeof vi.fn>
}

export function makeToolContext(overrides: Partial<ToolContext> = {}): ToolContextMocks {
  const cdp = {
    attach: vi.fn(async () => undefined),
    detach: vi.fn(async () => undefined),
    detachAll: vi.fn(async () => undefined),
    command: vi.fn(async () => undefined),
    enableRuntime: vi.fn(async () => undefined),
    enablePage: vi.fn(async () => undefined),
    enableNetwork: vi.fn(async () => undefined),
    evaluate: vi.fn(async () => ({ value: "resultado" })),
    screenshot: vi.fn(async () => "c2NyZWVuc2hvdA=="),
    mouse: vi.fn(async () => undefined),
    key: vi.fn(async () => undefined),
    text: vi.fn(async () => undefined),
    wheel: vi.fn(async () => undefined),
    consoleMessages: vi.fn(() => []),
    clearConsole: vi.fn(),
    networkRequests: vi.fn(() => []),
    clearNetwork: vi.fn(),
  }

  const tabs = {
    list: vi.fn(async () => [
      { id: 1, title: "Aba", url: "https://example.com/", active: true },
    ]),
    groupOf: vi.fn(async () => 100),
    resolveTab: vi.fn(async () => ({ tabId: 1, groupId: 100 })),
    ensure: vi.fn(async () => ({ sessionID: "ses_test", groupId: 100, mainTabId: 1 })),
    addTab: vi.fn(async () => 100),
    createTab: vi.fn(async () => 2),
    closeTab: vi.fn(async () => undefined),
  }

  const permissions = {
    hostOf: vi.fn((url?: string) => {
      if (!url) return ""
      try {
        return new URL(url).hostname
      } catch {
        return ""
      }
    }),
    isReadOnly: vi.fn(() => false),
    isAllowed: vi.fn(() => false),
    allowForSession: vi.fn(),
    allowForever: vi.fn(async () => undefined),
    denyForever: vi.fn(async () => undefined),
    check: vi.fn(async () => ({ allowed: true, scope: "once" })),
    respond: vi.fn(),
    pendingRequest: vi.fn(() => null),
    init: vi.fn(async () => undefined),
  }

  const ask = vi.fn(async () => true)
  const rank = vi.fn(async () => null)
  const indicator = vi.fn(async () => undefined)
  const hideIndicator = vi.fn(async () => undefined)
  const cursor = vi.fn(async () => undefined)
  const progress = vi.fn()

  const ctx = {
    sessionID: "ses_test",
    signal: new AbortController().signal,
    cdp,
    tabs,
    permissions,
    ask,
    rank,
    indicator,
    hideIndicator,
    cursor,
    progress,
    ...overrides,
  } as unknown as ToolContext

  return { ctx, cdp, tabs, permissions, ask, rank, indicator, hideIndicator, cursor, progress }
}
