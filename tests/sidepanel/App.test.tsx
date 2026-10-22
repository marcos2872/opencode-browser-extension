import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import App from "../../src/sidepanel/App"
import type { AppSnapshot, ChatMessage, PermissionRequest } from "../../src/shared/types"
import type { FakePort } from "../helpers/chrome"
import { makeAgent, makeCommand, makeMessage, makeModel, makeSession } from "../helpers/factories"

function makeSnapshot(partial: Partial<AppSnapshot> = {}): AppSnapshot {
  return {
    config: {
      baseUrl: "http://127.0.0.1:49374",
      token: "token-de-teste-123456",
      permissionMode: "ask",
    },
    models: [makeModel()],
    sessions: [makeSession()],
    activeSessionID: "ses_test",
    messages: [],
    relay: { connected: true, url: "ws://127.0.0.1:8799" },
    busy: false,
    backend: "online",
    defaultModel: null,
    agents: [makeAgent()],
    commands: [makeCommand()],
    statusMessage: null,
    ...partial,
  }
}

const PERMISSION: PermissionRequest = {
  id: "req_1",
  kind: "action",
  tool: "navigate",
  title: "Navegar para example.com",
  host: "example.com",
}

function mockSendMessage(snapshot: AppSnapshot | null, overrides: Record<string, unknown> = {}) {
  chrome.runtime.sendMessage.mockImplementation(async (message: { type: string }) => {
    if (Object.prototype.hasOwnProperty.call(overrides, message.type)) return overrides[message.type]
    if (message.type === "state:get") return snapshot ? { ok: true, snapshot } : { ok: true }
    return { ok: true }
  })
}

function lastPort(): FakePort {
  const port = chrome.__state.ports.at(-1)
  if (!port) throw new Error("nenhum port criado")
  return port
}

function sent(type: string): any {
  return chrome.runtime.sendMessage.mock.calls.map(([message]: any[]) => message).find((message: any) => message?.type === type)
}

async function renderApp(snapshot: AppSnapshot | null, overrides: Record<string, unknown> = {}) {
  mockSendMessage(snapshot, overrides)
  render(<App />)
  if (snapshot) await waitFor(() => expect(screen.queryByText(/carregando/)).not.toBeInTheDocument())
  return { port: lastPort(), user: userEvent.setup() }
}

beforeEach(() => {
  // jsdom não implementa scrollIntoView
  Element.prototype.scrollIntoView = vi.fn()
})

describe("sidepanel/App", () => {
  it("mostra o estado de carregamento e depois o snapshot", async () => {
    let resolveState!: (value: unknown) => void
    chrome.runtime.sendMessage.mockImplementation(
      () => new Promise((resolve) => { resolveState = resolve }),
    )

    render(<App />)
    expect(screen.getByText(/carregando/)).toBeInTheDocument()

    await act(async () => {
      resolveState({ ok: true, snapshot: makeSnapshot() })
    })
    expect(screen.queryByText(/carregando/)).not.toBeInTheDocument()
    expect(screen.getByText("OpenCode")).toBeInTheDocument()
  })

  it("mostra o toast quando o state:get falha durante o carregamento", async () => {
    chrome.runtime.sendMessage.mockResolvedValue({ ok: false, error: "service worker mudo" })
    render(<App />)

    await waitFor(() => expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: "state:get" }))
    expect(screen.getByText(/carregando/)).toBeInTheDocument()
    expect(await screen.findByText("service worker mudo")).toBeInTheDocument()
  })

  it("mostra o onboarding quando não há config", async () => {
    await renderApp(makeSnapshot({ config: null, sessions: [], activeSessionID: null }))

    expect(screen.getByRole("heading", { name: "Conecte o navegador ao OpenCode da sua máquina" })).toBeInTheDocument()
    expect(screen.queryByTitle("Sessões do OpenCode")).not.toBeInTheDocument()
    expect(screen.queryByTitle("Modelo do OpenCode")).not.toBeInTheDocument()
  })

  it("pareia pelo onboarding e mostra o toast de sucesso", async () => {
    const { user } = await renderApp(makeSnapshot({ config: null, sessions: [], activeSessionID: null }))

    await user.type(screen.getByLabelText(/Link do/), "http://127.0.0.1:1/auth/connect/abc")
    await user.click(screen.getByRole("button", { name: "Conectar ao OpenCode" }))

    expect(sent("pair")).toEqual({ type: "pair", link: "http://127.0.0.1:1/auth/connect/abc" })
    expect(await screen.findByText("Conectado ao OpenCode.")).toBeInTheDocument()
  })

  it("mostra o erro de pareamento no onboarding", async () => {
    const { user } = await renderApp(makeSnapshot({ config: null, sessions: [], activeSessionID: null }), {
      pair: { ok: false, error: "link inválido" },
    })

    await user.type(screen.getByLabelText(/Link do/), "http://x")
    await user.click(screen.getByRole("button", { name: "Conectar ao OpenCode" }))
    expect(await screen.findByText("link inválido")).toBeInTheDocument()
  })

  it("renderiza chat com mensagens, raciocínio e tools", async () => {
    await renderApp(
      makeSnapshot({
        messages: [
          { kind: "user", id: "u1", text: "olá agente", time: 1 },
          makeMessage({
            id: "a1",
            text: "resposta **forte**",
            reasoning: "pensei muito",
            tools: [{ id: "t1", name: "navigate", status: "ok", input: { url: "https://example.com" }, output: "ok" }],
          }),
        ],
      }),
    )

    expect(screen.getByText("olá agente")).toBeInTheDocument()
    expect(screen.getByText("Raciocínio")).toBeInTheDocument()
    expect(screen.getByText("pensei muito")).toBeInTheDocument()
    expect(screen.getByText("Navegar")).toBeInTheDocument()
    expect(screen.getByText("https://example.com")).toBeInTheDocument()
  })

  it("mostra o banner de status", async () => {
    await renderApp(makeSnapshot({ statusMessage: "iniciando sessão..." }))
    expect(screen.getByText("iniciando sessão...")).toBeInTheDocument()
  })

  it("mostra o backend online e offline", async () => {
    await renderApp(makeSnapshot({ backend: "offline" }))
    expect(screen.getByText("offline")).toBeInTheDocument()
  })

  it("envia o prompt pelo composer", async () => {
    const { user } = await renderApp(makeSnapshot())
    const textarea = screen.getByPlaceholderText("Peça algo ao OpenCode...")

    await user.type(textarea, "faça algo útil")
    await user.keyboard("{Enter}")

    expect(sent("prompt")).toEqual({ type: "prompt", text: "faça algo útil" })
    expect(textarea).toHaveValue("")
  })

  it("preenche o rascunho ao clicar em uma sugestão", async () => {
    const { user } = await renderApp(makeSnapshot({ messages: [] }))
    const suggestion = screen.getByRole("button", { name: /Hacker News/ })

    await user.click(suggestion)
    expect(screen.getByPlaceholderText("Peça algo ao OpenCode...")).toHaveValue(suggestion.textContent)
  })

  it("abre o menu de comandos e envia /comando", async () => {
    const { user } = await renderApp(
      makeSnapshot({ commands: [makeCommand({ name: "review", description: "Revisa o diff" })] }),
    )
    const textarea = screen.getByPlaceholderText("Peça algo ao OpenCode...")

    await user.type(textarea, "/review")
    await user.click(screen.getByRole("button", { name: /review/ }))
    expect(textarea).toHaveValue("/review ")

    await user.type(textarea, "corrija o diff")
    await user.keyboard("{Enter}")

    expect(sent("command")).toEqual({ type: "command", name: "review", text: "corrija o diff" })
  })

  it("interrompe pelo botão Parar quando busy", async () => {
    const { user } = await renderApp(
      makeSnapshot({ busy: true, messages: [makeMessage({ streaming: true, text: "trabalhando" })] }),
    )

    await user.click(screen.getByTitle("Parar"))
    expect(sent("interrupt")).toEqual({ type: "interrupt" })
  })

  it("cria uma nova sessão com o modelo e agente selecionados", async () => {
    const { user } = await renderApp(makeSnapshot())

    await user.click(screen.getByTitle("Nova conversa"))
    expect(sent("session:new")).toEqual({
      type: "session:new",
      model: { id: "model-1", providerID: "provider-1" },
      agent: "build",
    })
  })

  it("seleciona uma sessão", async () => {
    const { user } = await renderApp(
      makeSnapshot({
        sessions: [makeSession(), makeSession({ id: "ses_other", title: "Outra" })],
      }),
    )

    await user.selectOptions(screen.getByTitle("Sessões do OpenCode"), "ses_other")
    expect(sent("session:select")).toEqual({ type: "session:select", id: "ses_other" })
  })

  it("exclui a sessão ativa após confirmação", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true)
    const { user } = await renderApp(makeSnapshot())

    await user.click(screen.getByTitle("Excluir sessão"))
    expect(confirmSpy).toHaveBeenCalled()
    expect(sent("session:delete")).toEqual({ type: "session:delete", id: "ses_test" })
  })

  it("não exclui a sessão quando a confirmação é cancelada", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false)
    const { user } = await renderApp(makeSnapshot())

    await user.click(screen.getByTitle("Excluir sessão"))
    expect(confirmSpy).toHaveBeenCalled()
    expect(sent("session:delete")).toBeUndefined()
  })

  it("troca o modelo da sessão ativa", async () => {
    const { user } = await renderApp(
      makeSnapshot({
        models: [makeModel(), makeModel({ id: "model-2", providerID: "provider-2", name: "Model Two" })],
      }),
    )

    await user.selectOptions(screen.getByTitle("Modelo do OpenCode"), "provider-2/model-2")
    expect(sent("session:model")).toEqual({
      type: "session:model",
      model: { id: "model-2", providerID: "provider-2" },
    })
  })

  it("troca o modelo padrão quando não há sessão ativa", async () => {
    const { user } = await renderApp(
      makeSnapshot({
        sessions: [],
        activeSessionID: null,
        models: [makeModel(), makeModel({ id: "model-2", providerID: "provider-2", name: "Model Two" })],
      }),
    )

    await user.selectOptions(screen.getByTitle("Modelo do OpenCode"), "provider-2/model-2")
    expect(sent("settings:update")).toEqual({
      type: "settings:update",
      patch: { defaultModel: { id: "model-2", providerID: "provider-2" } },
    })
  })

  it("troca o agente da sessão", async () => {
    const { user } = await renderApp(
      makeSnapshot({ agents: [makeAgent(), makeAgent({ id: "plan", name: "Plan" })] }),
    )

    await user.selectOptions(screen.getByTitle("Agente do OpenCode"), "plan")
    expect(sent("session:agent")).toEqual({ type: "session:agent", agent: "plan" })
  })

  it("anexa a aba atual ao grupo", async () => {
    const { user } = await renderApp(makeSnapshot())

    await user.click(screen.getByTitle("Anexar a aba atual ao grupo"))
    expect(sent("tabs:attach-current")).toEqual({ type: "tabs:attach-current" })
  })

  it("mostra toast quando a troca de modelo falha", async () => {
    const { user } = await renderApp(
      makeSnapshot({
        models: [makeModel(), makeModel({ id: "model-2", providerID: "provider-2", name: "Model Two" })],
      }),
      { "session:model": { ok: false, error: "modelo indisponível" } },
    )

    await user.selectOptions(screen.getByTitle("Modelo do OpenCode"), "provider-2/model-2")
    expect(await screen.findByText("modelo indisponível")).toBeInTheDocument()
  })

  it("mostra toast quando a troca do modelo padrão falha", async () => {
    const { user } = await renderApp(
      makeSnapshot({
        sessions: [],
        activeSessionID: null,
        models: [makeModel(), makeModel({ id: "model-2", providerID: "provider-2", name: "Model Two" })],
      }),
      { "settings:update": { ok: false, error: "config inválida" } },
    )

    await user.selectOptions(screen.getByTitle("Modelo do OpenCode"), "provider-2/model-2")
    expect(await screen.findByText("config inválida")).toBeInTheDocument()
  })

  it("mostra toast quando a troca de agente falha", async () => {
    const { user } = await renderApp(
      makeSnapshot({ agents: [makeAgent(), makeAgent({ id: "plan", name: "Plan" })] }),
      { "session:agent": { ok: false, error: "agente inválido" } },
    )

    await user.selectOptions(screen.getByTitle("Agente do OpenCode"), "plan")
    expect(await screen.findByText("agente inválido")).toBeInTheDocument()
  })

  it("mostra toast quando criar uma nova sessão falha", async () => {
    const { user } = await renderApp(makeSnapshot(), {
      "session:new": { ok: false, error: "limite de sessões" },
    })

    await user.click(screen.getByTitle("Nova conversa"))
    expect(await screen.findByText("limite de sessões")).toBeInTheDocument()
  })

  it("mostra toast quando excluir a sessão falha", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true)
    const { user } = await renderApp(makeSnapshot(), {
      "session:delete": { ok: false, error: "sessão em uso" },
    })

    await user.click(screen.getByTitle("Excluir sessão"))
    expect(await screen.findByText("sessão em uso")).toBeInTheDocument()
  })

  it("mostra toast quando responder a permissão falha", async () => {
    const { port, user } = await renderApp(makeSnapshot(), {
      "permission:respond": { ok: false, error: "pedido expirado" },
    })

    act(() => {
      port.onMessage.emit({ type: "permission", request: PERMISSION })
    })
    await user.click(screen.getByRole("button", { name: /Permitir uma vez/ }))

    expect(await screen.findByText("pedido expirado")).toBeInTheDocument()
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("abre as configurações", async () => {
    const { user } = await renderApp(makeSnapshot())

    await user.click(screen.getByTitle("Configurações"))
    expect(sent("open:options")).toEqual({ type: "open:options" })
  })

  it("mostra o overlay de permissão e responde a decisão", async () => {
    const { port, user } = await renderApp(makeSnapshot())

    act(() => {
      port.onMessage.emit({ type: "permission", request: PERMISSION })
    })
    expect(screen.getByRole("dialog", { name: "Pedido de permissão" })).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Permitir nesta sessão" }))
    expect(sent("permission:respond")).toEqual({
      type: "permission:respond",
      requestId: "req_1",
      decision: { allowed: true, scope: "site" },
    })
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("fecha o overlay quando o pedido é resolvido", async () => {
    const { port } = await renderApp(makeSnapshot())

    act(() => {
      port.onMessage.emit({ type: "permission", request: PERMISSION })
    })
    act(() => {
      port.onMessage.emit({ type: "permission:resolved", requestId: "outro" })
    })
    expect(screen.getByRole("dialog")).toBeInTheDocument()

    act(() => {
      port.onMessage.emit({ type: "permission:resolved", requestId: "req_1" })
    })
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  })

  it("atualiza a UI com o evento snapshot do port", async () => {
    const { port } = await renderApp(makeSnapshot())

    const messages: ChatMessage[] = [{ kind: "user", id: "u1", text: "veio pelo port", time: 1 }]
    act(() => {
      port.onMessage.emit({ type: "snapshot", snapshot: makeSnapshot({ messages }) })
    })
    expect(await screen.findByText("veio pelo port")).toBeInTheDocument()
  })

  it("atualiza o relay com o evento relay do port", async () => {
    const { port } = await renderApp(makeSnapshot())

    expect(screen.getByText("ferramentas conectadas")).toBeInTheDocument()
    act(() => {
      port.onMessage.emit({ type: "relay", relay: { connected: false, url: "ws://127.0.0.1:8799", lastError: "recusado" } })
    })
    expect(await screen.findByText("ferramentas offline")).toBeInTheDocument()
  })

  it("mostra toast de erro e devolve o texto ao rascunho", async () => {
    const { user } = await renderApp(makeSnapshot(), {
      prompt: { ok: false, error: "backend fora do ar" },
    })
    const textarea = screen.getByPlaceholderText("Peça algo ao OpenCode...")

    await user.type(textarea, "oi")
    await user.keyboard("{Enter}")

    expect(await screen.findByText("backend fora do ar")).toBeInTheDocument()
    await waitFor(() => expect(textarea).toHaveValue("oi"))
  })

  it("reconecta o port quando ele desconecta", async () => {
    const { port } = await renderApp(makeSnapshot())
    expect(chrome.runtime.connect).toHaveBeenCalledTimes(1)

    act(() => {
      port.onDisconnect.emit(port)
    })

    await waitFor(() => expect(chrome.runtime.connect).toHaveBeenCalledTimes(2), { timeout: 2500 })
  })
})
