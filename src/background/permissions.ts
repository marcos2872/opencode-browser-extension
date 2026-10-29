import type { PermissionDecision, PermissionMode, PermissionRequest } from "../shared/types"
import { getAllowList, getConfig, getDenyList, setAllowList, setDenyList } from "../shared/storage"

const READ_ONLY = new Set([
  "tabs_context",
  "tabs_create",
  "read_page",
  "get_page_text",
  "find",
  "read_console_messages",
  "read_network_requests",
])

const REQUEST_KEY = "permission.request."
const NOTIFY_PREFIX = "oc-permission-"

interface Pending {
  request: PermissionRequest
  sessionID: string
  resolve: (decision: PermissionDecision) => void
  timer: ReturnType<typeof setTimeout>
}

export interface AskInput {
  kind: PermissionRequest["kind"]
  tool: string
  title: string
  detail?: string
  url?: string
  screenshot?: string
  text?: string
  plan?: { domains: string[]; approach: string[] }
  fromDomain?: string
  toDomain?: string
}

export class Permissions {
  private allow: string[] = []
  private deny: string[] = []
  private sessionAllow = new Map<string, Set<string>>()
  private pending = new Map<string, Pending>()
  private windowByRequest = new Map<string, number>()

  constructor(
    private readonly mode: () => PermissionMode,
    private readonly timeoutMs: () => number,
    private readonly hasUi: () => boolean,
    private readonly notify: (request: PermissionRequest) => void,
    private readonly resolved: (requestId: string) => void,
    private readonly sound: () => void = () => {},
  ) {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type !== "permission:respond" || typeof message.requestId !== "string") return
      this.respond(message.requestId, message.decision as PermissionDecision)
      sendResponse({ ok: true })
      return true
    })
    // Sem UI, o pedido só aparece em um modal do painel: a notificação avisa e
    // o clique (gesto do usuário) abre o side panel, onde o modal é renderizado.
    chrome.notifications.onClicked.addListener((notificationId) => {
      if (!notificationId.startsWith(NOTIFY_PREFIX)) return
      const requestId = notificationId.slice(NOTIFY_PREFIX.length)
      if (!this.pending.has(requestId)) return
      const windowId = this.windowByRequest.get(requestId)
      if (windowId === undefined) return
      // `sidePanel.open` consome a ativação do clique: nada de `await` antes.
      void chrome.sidePanel.open({ windowId }).then(
        () => chrome.notifications.clear(notificationId).catch(() => undefined),
        () => undefined,
      )
    })
  }

  async init(): Promise<void> {
    const [allow, deny] = await Promise.all([getAllowList(), getDenyList()])
    this.allow = allow
    this.deny = deny
  }

  isReadOnly(tool: string): boolean {
    return READ_ONLY.has(tool)
  }

  hostOf(url: string | undefined): string {
    if (!url) return ""
    try {
      return new URL(url).hostname
    } catch {
      return ""
    }
  }

  isAllowed(host: string, sessionID: string): boolean {
    if (!host) return false
    if (this.allow.includes(host)) return true
    return this.sessionAllow.get(sessionID)?.has(host) ?? false
  }

  allowForSession(sessionID: string, host: string): void {
    if (!host) return
    const set = this.sessionAllow.get(sessionID) ?? new Set<string>()
    set.add(host)
    this.sessionAllow.set(sessionID, set)
  }

  async allowForever(host: string): Promise<void> {
    if (!host || this.allow.includes(host)) return
    this.allow = [...this.allow, host]
    await setAllowList(this.allow)
  }

  async denyForever(host: string): Promise<void> {
    if (!host || this.deny.includes(host)) return
    this.deny = [...this.deny, host]
    await setDenyList(this.deny)
  }

  async check(input: AskInput, sessionID: string): Promise<PermissionDecision> {
    const host = this.hostOf(input.url) || (input.toDomain ?? "")
    if (host && this.deny.includes(host)) {
      return { allowed: false }
    }
    if (this.isReadOnly(input.tool)) {
      return { allowed: true, scope: "once" }
    }
    if (this.mode() === "deny") {
      return { allowed: false }
    }
    if (this.mode() === "allow") {
      return { allowed: true, scope: "once" }
    }
    if (host && this.isAllowed(host, sessionID)) {
      return { allowed: true, scope: "once" }
    }

    const request: PermissionRequest = {
      id: crypto.randomUUID(),
      kind: input.kind,
      tool: input.tool,
      title: input.title,
      detail: input.detail,
      url: input.url,
      host,
      screenshot: input.screenshot,
      text: input.text,
      plan: input.plan,
      fromDomain: input.fromDomain,
      toDomain: input.toDomain,
    }

    return new Promise<PermissionDecision>((resolve) => {
      const timer = setTimeout(() => {
        this.finish(request.id, { allowed: false })
      }, this.timeoutMs())
      this.pending.set(request.id, { request, sessionID, resolve, timer })
      void chrome.storage.session.set({ [REQUEST_KEY + request.id]: request })
      this.sound()

      if (this.hasUi()) {
        this.notify(request)
      } else {
        // Sem painel aberto não existe superfície para o modal: avisa por som +
        // notificação e deixa o clique trazer o painel para frente.
        void this.notifyPending(request)
      }
    })
  }

  private async notifyPending(request: PermissionRequest): Promise<void> {
    const config = await getConfig().catch(() => null)
    if (!this.pending.has(request.id)) return
    if (config?.notifyEnabled === false) return
    // Guarda a janela agora: no clique da notificação precisamos chamar
    // `sidePanel.open` sem nenhum `await` antes, para preservar o gesto.
    const window = await chrome.windows.getLastFocused().catch(() => undefined)
    if (window?.id !== undefined) this.windowByRequest.set(request.id, window.id)
    await chrome.notifications
      .create(`${NOTIFY_PREFIX}${request.id}`, {
        type: "basic",
        iconUrl: chrome.runtime.getURL("icons/icon-128.png"),
        title: "OpenCode Browser: aprovação pendente",
        message: request.title.slice(0, 180),
      })
      .catch(() => undefined)
  }

  /** Pedido pendente mais antigo, para a UI mostrar ao conectar. */
  current(): PermissionRequest | null {
    const first = this.pending.values().next()
    return first.done ? null : first.value.request
  }

  respond(requestId: string, decision: PermissionDecision): void {
    const pending = this.pending.get(requestId)
    if (!pending) return
    if (!decision.allowed) {
      this.finish(requestId, { allowed: false })
      return
    }
    const host = pending.request.host
    if (decision.scope === "site" && host) this.allowForSession(pending.sessionID, host)
    if (decision.scope === "always" && host) void this.allowForever(host)
    this.finish(requestId, { allowed: true, scope: decision.scope ?? "once" })
  }

  private finish(requestId: string, decision: PermissionDecision): void {
    const pending = this.pending.get(requestId)
    if (!pending) return
    clearTimeout(pending.timer)
    this.pending.delete(requestId)
    this.windowByRequest.delete(requestId)
    void chrome.notifications
      .clear(`${NOTIFY_PREFIX}${requestId}`)
      .catch(() => undefined)
    void chrome.storage.session.remove(REQUEST_KEY + requestId)
    this.resolved(requestId)
    pending.resolve(decision)
  }

  pendingRequest(requestId: string): PermissionRequest | null {
    return this.pending.get(requestId)?.request ?? null
  }
}
