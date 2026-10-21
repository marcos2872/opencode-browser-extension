import { afterEach, describe, expect, it, vi } from "vitest"
import { Permissions, type AskInput } from "../../src/background/permissions"
import type { PermissionMode, PermissionRequest } from "../../src/shared/types"
import { chromeMock } from "../setup"

const REQUEST_PREFIX = "permission.request."

const READ_ONLY_TOOLS = [
  "tabs_context",
  "tabs_create",
  "read_page",
  "get_page_text",
  "find",
  "read_console_messages",
  "read_network_requests",
]

const ACTION_TOOLS = [
  "navigate",
  "tabs_close",
  "tabs_attach",
  "form_input",
  "computer",
  "upload_file",
  "update_plan",
  "gif_creator",
  "",
]

interface SetupOptions {
  mode?: PermissionMode | (() => PermissionMode)
  timeoutMs?: number
  hasUi?: boolean
}

function setup(options: SetupOptions = {}) {
  const mode = typeof options.mode === "function" ? options.mode : () => options.mode ?? "ask"
  const notify = vi.fn()
  const resolved = vi.fn()
  const sound = vi.fn()
  const permissions = new Permissions(
    mode,
    () => options.timeoutMs ?? 60_000,
    () => options.hasUi ?? true,
    notify,
    resolved,
    sound,
  )
  return { permissions, notify, resolved, sound }
}

function input(overrides: Partial<AskInput> = {}): AskInput {
  return {
    kind: "action",
    tool: "navigate",
    title: "Navegar",
    url: "https://example.com/",
    ...overrides,
  }
}

function requestFrom(notify: ReturnType<typeof vi.fn>, call = 0): PermissionRequest {
  const request = notify.mock.calls[call]?.[0] as PermissionRequest | undefined
  if (!request) throw new Error(`notify não foi chamado na posição ${call}`)
  return request
}

function sessionRequestKeys(): string[] {
  return [...chromeMock.storage.session.data.keys()].filter((key) => key.startsWith(REQUEST_PREFIX))
}

describe("background/permissions", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  describe("isReadOnly", () => {
    it("reconhece todas as ferramentas de leitura", () => {
      const { permissions } = setup()
      for (const tool of READ_ONLY_TOOLS) {
        expect(permissions.isReadOnly(tool), tool).toBe(true)
      }
    })

    it("não considera ferramentas de ação como leitura", () => {
      const { permissions } = setup()
      for (const tool of ACTION_TOOLS) {
        expect(permissions.isReadOnly(tool), tool).toBe(false)
      }
    })
  })

  describe("hostOf", () => {
    it("extrai o host de URLs válidas", () => {
      const { permissions } = setup()
      expect(permissions.hostOf("https://example.com/path?q=1#hash")).toBe("example.com")
      expect(permissions.hostOf("https://sub.example.com:8443/a")).toBe("sub.example.com")
      expect(permissions.hostOf("http://127.0.0.1:3000")).toBe("127.0.0.1")
    })

    it("devolve string vazia para URL inválida, vazia ou ausente", () => {
      const { permissions } = setup()
      expect(permissions.hostOf(undefined)).toBe("")
      expect(permissions.hostOf("")).toBe("")
      expect(permissions.hostOf("não é uma url")).toBe("")
      expect(permissions.hostOf("about:blank")).toBe("")
    })
  })

  describe("init", () => {
    it("carrega allowlist e denylist do storage local", async () => {
      await chromeMock.storage.local.set({
        "permissions.allow": ["ok.com"],
        "permissions.deny": ["ban.com"],
      })
      const { permissions, notify } = setup({ mode: "ask" })
      await permissions.init()

      expect(permissions.isAllowed("ok.com", "ses_1")).toBe(true)
      expect(permissions.isAllowed("outro.com", "ses_1")).toBe(false)

      await expect(
        permissions.check(input({ url: "https://ban.com/pagina" }), "ses_1"),
      ).resolves.toEqual({ allowed: false })
      expect(notify).not.toHaveBeenCalled()
    })
  })

  describe("check — modos", () => {
    it("no modo deny nega uma ação sem abrir prompt", async () => {
      const { permissions, notify } = setup({ mode: "deny" })
      await expect(permissions.check(input(), "ses_1")).resolves.toEqual({ allowed: false })
      expect(notify).not.toHaveBeenCalled()
      expect(chromeMock.windows.create).not.toHaveBeenCalled()
      expect(chromeMock.storage.session.data.size).toBe(0)
    })

    it("no modo deny libera ferramenta de leitura (só leitura executa)", async () => {
      const { permissions, notify } = setup({ mode: "deny" })
      await expect(
        permissions.check(input({ tool: "read_page" }), "ses_1"),
      ).resolves.toEqual({ allowed: true, scope: "once" })
      expect(notify).not.toHaveBeenCalled()
      expect(chromeMock.windows.create).not.toHaveBeenCalled()
    })

    it("no modo ask libera ferramenta de leitura sem prompt", async () => {
      const { permissions, notify } = setup({ mode: "ask" })
      await expect(
        permissions.check(input({ tool: "read_page" }), "ses_1"),
      ).resolves.toEqual({ allowed: true, scope: "once" })
      expect(notify).not.toHaveBeenCalled()
      expect(chromeMock.windows.create).not.toHaveBeenCalled()
    })

    it("no modo allow libera a ação sem prompt", async () => {
      const { permissions, notify } = setup({ mode: "allow" })
      await expect(permissions.check(input(), "ses_1")).resolves.toEqual({
        allowed: true,
        scope: "once",
      })
      expect(notify).not.toHaveBeenCalled()
    })

    it("host na lista de bloqueio nega mesmo no modo allow", async () => {
      await chromeMock.storage.local.set({ "permissions.deny": ["ban.com"] })
      const { permissions, notify } = setup({ mode: "allow" })
      await permissions.init()
      await expect(
        permissions.check(input({ url: "https://ban.com/x" }), "ses_1"),
      ).resolves.toEqual({ allowed: false })
      expect(notify).not.toHaveBeenCalled()
    })

    it("usa toDomain quando a URL está ausente ou inválida", async () => {
      await chromeMock.storage.local.set({ "permissions.deny": ["ban.com"] })
      const { permissions } = setup({ mode: "allow" })
      await permissions.init()

      await expect(
        permissions.check(
          input({ url: undefined, kind: "domain", toDomain: "ban.com" }),
          "ses_1",
        ),
      ).resolves.toEqual({ allowed: false })
      await expect(
        permissions.check(
          input({ url: "não é url", kind: "domain", toDomain: "ban.com" }),
          "ses_1",
        ),
      ).resolves.toEqual({ allowed: false })
    })

    it("consulta o modo a cada check", async () => {
      let mode: PermissionMode = "deny"
      const { permissions, notify } = setup({ mode: () => mode })
      await expect(permissions.check(input(), "ses_1")).resolves.toEqual({ allowed: false })
      mode = "allow"
      await expect(permissions.check(input(), "ses_1")).resolves.toEqual({
        allowed: true,
        scope: "once",
      })
      expect(notify).not.toHaveBeenCalled()
    })
  })

  describe("check — allowlist", () => {
    it("host na allowlist persistente libera", async () => {
      await chromeMock.storage.local.set({ "permissions.allow": ["ok.com"] })
      const { permissions, notify } = setup({ mode: "ask" })
      await permissions.init()
      await expect(
        permissions.check(input({ url: "https://ok.com/pagina" }), "ses_1"),
      ).resolves.toEqual({ allowed: true, scope: "once" })
      expect(notify).not.toHaveBeenCalled()
    })

    it("host liberado para a sessão só vale naquela sessão", async () => {
      const { permissions, notify } = setup({ mode: "ask" })
      permissions.allowForSession("ses_1", "site.com")

      expect(permissions.isAllowed("site.com", "ses_1")).toBe(true)
      expect(permissions.isAllowed("site.com", "ses_2")).toBe(false)

      await expect(
        permissions.check(input({ url: "https://site.com/a" }), "ses_1"),
      ).resolves.toEqual({ allowed: true, scope: "once" })
      expect(notify).not.toHaveBeenCalled()
    })

    it("allowForSession e isAllowed ignoram host vazio", () => {
      const { permissions } = setup()
      permissions.allowForSession("ses_1", "")
      expect(permissions.isAllowed("", "ses_1")).toBe(false)
      expect(permissions.isAllowed("x.com", "ses_desconhecida")).toBe(false)
    })
  })

  describe("check — prompt", () => {
    it("com UI aberta notifica, salva o pedido e não abre janela", async () => {
      const { permissions, notify, resolved, sound } = setup({ hasUi: true })
      const decision = permissions.check(input({ detail: "detalhe" }), "ses_1")

      expect(notify).toHaveBeenCalledTimes(1)
      expect(chromeMock.windows.create).not.toHaveBeenCalled()
      expect(sound).toHaveBeenCalledTimes(1)

      const request = requestFrom(notify)
      expect(request).toMatchObject({
        kind: "action",
        tool: "navigate",
        title: "Navegar",
        detail: "detalhe",
        url: "https://example.com/",
        host: "example.com",
      })
      expect(typeof request.id).toBe("string")

      expect(sessionRequestKeys()).toEqual([`${REQUEST_PREFIX}${request.id}`])
      expect(permissions.pendingRequest(request.id)).toEqual(request)

      permissions.respond(request.id, { allowed: true })
      await expect(decision).resolves.toEqual({ allowed: true, scope: "once" })
      expect(resolved).toHaveBeenCalledWith(request.id)
      expect(permissions.pendingRequest(request.id)).toBeNull()
      expect(sessionRequestKeys()).toEqual([])
    })

    it("sem UI abre o popup e guarda o pedido em storage.session", async () => {
      const { permissions, notify, sound } = setup({ hasUi: false })
      const decision = permissions.check(input(), "ses_1")

      expect(notify).not.toHaveBeenCalled()
      expect(sound).toHaveBeenCalledTimes(1)
      expect(chromeMock.windows.create).toHaveBeenCalledTimes(1)

      const options = chromeMock.windows.create.mock.calls[0]?.[0] as {
        url: string
        type: string
        width: number
        height: number
        focused: boolean
      }
      expect(options).toMatchObject({ type: "popup", width: 560, height: 680, focused: true })
      expect(options.url).toContain("permission.html?requestId=")

      const keys = sessionRequestKeys()
      expect(keys).toHaveLength(1)
      const requestId = keys[0]!.slice(REQUEST_PREFIX.length)
      expect(options.url).toContain(encodeURIComponent(requestId))

      const stored = await chromeMock.storage.session.get(keys[0]!)
      expect(stored[keys[0]!]).toMatchObject({ id: requestId, host: "example.com" })

      permissions.respond(requestId, { allowed: false })
      await expect(decision).resolves.toEqual({ allowed: false })
      expect(sessionRequestKeys()).toEqual([])
    })

    it("nega quando a criação do popup falha", async () => {
      chromeMock.windows.create.mockRejectedValueOnce(new Error("sem janela"))
      const { permissions, resolved } = setup({ hasUi: false })
      const decision = permissions.check(input(), "ses_1")

      await expect(decision).resolves.toEqual({ allowed: false })
      expect(resolved).toHaveBeenCalledTimes(1)
      expect(sessionRequestKeys()).toEqual([])
    })

    it("repassa os detalhes do pedido para o notify", async () => {
      const { permissions, notify } = setup({ hasUi: true })
      const plan = { domains: ["a.com"], approach: ["passo 1"] }
      const decision = permissions.check(
        input({
          kind: "plan",
          tool: "update_plan",
          title: "Plano",
          detail: "detalhe",
          screenshot: "c2NyZWVuc2hvdA==",
          text: "texto",
          plan,
          fromDomain: "a.com",
          toDomain: "b.com",
        }),
        "ses_1",
      )

      const request = requestFrom(notify)
      expect(request).toMatchObject({
        kind: "plan",
        tool: "update_plan",
        title: "Plano",
        detail: "detalhe",
        screenshot: "c2NyZWVuc2hvdA==",
        text: "texto",
        plan,
        fromDomain: "a.com",
        toDomain: "b.com",
        host: "example.com",
      })

      permissions.respond(request.id, { allowed: false })
      await expect(decision).resolves.toEqual({ allowed: false })
    })
  })

  describe("check — timeout", () => {
    it("nega automaticamente após 60 s (fake timers)", async () => {
      vi.useFakeTimers()
      const { permissions, notify, resolved } = setup({ hasUi: true, timeoutMs: 60_000 })
      const promise = permissions.check(input(), "ses_1")
      let decision: unknown
      void promise.then((value) => {
        decision = value
      })

      const request = requestFrom(notify)
      await vi.advanceTimersByTimeAsync(59_999)
      expect(decision).toBeUndefined()
      expect(permissions.pendingRequest(request.id)).toEqual(request)

      await vi.advanceTimersByTimeAsync(1)
      await expect(promise).resolves.toEqual({ allowed: false })
      expect(decision).toEqual({ allowed: false })
      expect(resolved).toHaveBeenCalledWith(request.id)
      expect(permissions.pendingRequest(request.id)).toBeNull()
      expect(sessionRequestKeys()).toEqual([])

      // Responder depois do timeout é ignorado.
      permissions.respond(request.id, { allowed: true })
      expect(resolved).toHaveBeenCalledTimes(1)
    })

    it("respeita timeout customizado", async () => {
      vi.useFakeTimers()
      const { permissions } = setup({ hasUi: false, timeoutMs: 1_000 })
      const promise = permissions.check(input(), "ses_1")

      await vi.advanceTimersByTimeAsync(999)
      let settled = false
      void promise.then(() => {
        settled = true
      })
      await vi.advanceTimersByTimeAsync(0)
      expect(settled).toBe(false)

      await vi.advanceTimersByTimeAsync(1)
      await expect(promise).resolves.toEqual({ allowed: false })
      expect(sessionRequestKeys()).toEqual([])
    })
  })

  describe("respond", () => {
    it("scope once libera apenas aquele pedido", async () => {
      const { permissions, notify, resolved } = setup()
      const decision = permissions.check(input(), "ses_1")
      const request = requestFrom(notify)

      permissions.respond(request.id, { allowed: true })
      await expect(decision).resolves.toEqual({ allowed: true, scope: "once" })
      expect(resolved).toHaveBeenCalledWith(request.id)
      expect(permissions.isAllowed("example.com", "ses_1")).toBe(false)
      expect(chromeMock.storage.local.data.has("permissions.allow")).toBe(false)
    })

    it("scope site adiciona o host à sessão", async () => {
      const { permissions, notify } = setup()
      const decision = permissions.check(input(), "ses_1")
      const request = requestFrom(notify)

      permissions.respond(request.id, { allowed: true, scope: "site" })
      await expect(decision).resolves.toEqual({ allowed: true, scope: "site" })
      expect(permissions.isAllowed("example.com", "ses_1")).toBe(true)
      expect(permissions.isAllowed("example.com", "outra_sessao")).toBe(false)

      await expect(permissions.check(input({ url: "https://example.com/outra" }), "ses_1")).resolves.toEqual({
        allowed: true,
        scope: "once",
      })
      expect(notify).toHaveBeenCalledTimes(1)
    })

    it("scope always persiste na allowlist", async () => {
      const { permissions, notify } = setup()
      const decision = permissions.check(input(), "ses_1")
      const request = requestFrom(notify)

      permissions.respond(request.id, { allowed: true, scope: "always" })
      await expect(decision).resolves.toEqual({ allowed: true, scope: "always" })
      expect(chromeMock.storage.local.data.get("permissions.allow")).toEqual(["example.com"])
      expect(permissions.isAllowed("example.com", "qualquer_sessao")).toBe(true)
    })

    it("decisão negada resolve sem escopo e não persiste", async () => {
      const { permissions, notify } = setup()
      const decision = permissions.check(input(), "ses_1")
      const request = requestFrom(notify)

      permissions.respond(request.id, { allowed: false, scope: "always" })
      await expect(decision).resolves.toEqual({ allowed: false })
      expect(chromeMock.storage.local.data.has("permissions.allow")).toBe(false)
      expect(permissions.isAllowed("example.com", "ses_1")).toBe(false)
    })

    it("scope site/always sem host não persiste nada", async () => {
      const { permissions, notify } = setup()
      const decision = permissions.check(input({ url: undefined }), "ses_1")
      const request = requestFrom(notify)
      expect(request.host).toBe("")

      permissions.respond(request.id, { allowed: true, scope: "always" })
      await expect(decision).resolves.toEqual({ allowed: true, scope: "always" })
      expect(chromeMock.storage.local.data.has("permissions.allow")).toBe(false)
    })

    it("ignora id desconhecido", () => {
      const { permissions, resolved } = setup()
      expect(() => permissions.respond("id-inexistente", { allowed: true })).not.toThrow()
      expect(resolved).not.toHaveBeenCalled()
    })
  })

  describe("listener de permission:respond", () => {
    it("responde o pedido pendente via chrome.runtime.onMessage", async () => {
      const { permissions, notify, resolved } = setup()
      const decision = permissions.check(input(), "ses_1")
      const request = requestFrom(notify)

      const listener = chromeMock.runtime.onMessage.listeners.at(-1)!
      const sendResponse = vi.fn()
      const returned = listener(
        { type: "permission:respond", requestId: request.id, decision: { allowed: true, scope: "once" } },
        {},
        sendResponse,
      )

      expect(returned).toBe(true)
      expect(sendResponse).toHaveBeenCalledWith({ ok: true })
      await expect(decision).resolves.toEqual({ allowed: true, scope: "once" })
      expect(resolved).toHaveBeenCalledWith(request.id)
    })

    it("também funciona através de chrome.runtime.sendMessage", async () => {
      const { permissions, notify } = setup()
      const decision = permissions.check(input(), "ses_1")
      const request = requestFrom(notify)

      const response = await chromeMock.runtime.sendMessage({
        type: "permission:respond",
        requestId: request.id,
        decision: { allowed: true },
      })
      expect(response).toEqual({ ok: true })
      await expect(decision).resolves.toEqual({ allowed: true, scope: "once" })
    })

    it("ignora mensagens que não são permission:respond", () => {
      setup()
      const listener = chromeMock.runtime.onMessage.listeners.at(-1)!
      const sendResponse = vi.fn()

      expect(listener({ type: "outro" }, {}, sendResponse)).toBeUndefined()
      expect(
        listener({ type: "permission:respond", requestId: 42, decision: { allowed: true } }, {}, sendResponse),
      ).toBeUndefined()
      expect(listener(undefined, {}, sendResponse)).toBeUndefined()
      expect(sendResponse).not.toHaveBeenCalled()
    })
  })

  describe("allowForever/denyForever", () => {
    it("não duplica hosts e ignora host vazio", async () => {
      const { permissions } = setup()
      await permissions.allowForever("x.com")
      await permissions.allowForever("x.com")
      await permissions.allowForever("")

      expect(chromeMock.storage.local.data.get("permissions.allow")).toEqual(["x.com"])
      expect(permissions.isAllowed("x.com", "ses_1")).toBe(true)

      await permissions.denyForever("ban.com")
      await permissions.denyForever("ban.com")
      await permissions.denyForever("")

      expect(chromeMock.storage.local.data.get("permissions.deny")).toEqual(["ban.com"])
    })

    it("preserva hosts já carregados do storage", async () => {
      await chromeMock.storage.local.set({ "permissions.allow": ["a.com"], "permissions.deny": ["b.com"] })
      const { permissions } = setup()
      await permissions.init()

      await permissions.allowForever("c.com")
      await permissions.denyForever("d.com")

      expect(chromeMock.storage.local.data.get("permissions.allow")).toEqual(["a.com", "c.com"])
      expect(chromeMock.storage.local.data.get("permissions.deny")).toEqual(["b.com", "d.com"])
    })
  })
})
