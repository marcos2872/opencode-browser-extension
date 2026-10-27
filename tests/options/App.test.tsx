import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import App from "../../src/options/App"
import type { AppSnapshot, ConnectionState, OpencodeConfig } from "../../src/shared/types"
import { makeAgent, makeModel } from "../helpers/factories"

const CONNECTION_ONLINE: ConnectionState = {
  phase: "online",
  failure: null,
  detail: null,
  attempts: 0,
  lastOnlineAt: null,
  offlineSince: null,
}

function makeConfig(partial: Partial<OpencodeConfig> = {}): OpencodeConfig {
  return {
    baseUrl: "http://127.0.0.1:49374",
    token: "abcdef123456",
    permissionMode: "ask",
    ...partial,
  }
}

function makeSnapshot(partial: Partial<AppSnapshot> = {}): AppSnapshot {
  return {
    config: makeConfig(),
    models: [makeModel()],
    sessions: [],
    activeSessionID: null,
    messages: [],
    relay: { connected: true, url: "ws://127.0.0.1:8799" },
    busy: false,
    connection: CONNECTION_ONLINE,
    defaultModel: null,
    agents: [makeAgent()],
    commands: [],
    statusMessage: null,
    ...partial,
  }
}

function mockSendMessage(snapshot: AppSnapshot | null, overrides: Record<string, unknown> = {}) {
  chrome.runtime.sendMessage.mockImplementation(async (message: { type: string }) => {
    if (Object.prototype.hasOwnProperty.call(overrides, message.type)) return overrides[message.type]
    if (message.type === "state:get") return snapshot ? { ok: true, snapshot } : { ok: true }
    return { ok: true }
  })
}

function sent(type: string): any {
  return chrome.runtime.sendMessage.mock.calls
    .map(([message]: any[]) => message)
    .find((message: any) => message?.type === type)
}

async function renderOptions(snapshot: AppSnapshot | null, overrides: Record<string, unknown> = {}) {
  mockSendMessage(snapshot, overrides)
  render(<App />)
  if (snapshot) await screen.findByText("Conexão")
  return { user: userEvent.setup() }
}

describe("options/App", () => {
  it("mostra carregando e depois o conteúdo", async () => {
    await renderOptions(makeSnapshot())
    expect(screen.getByRole("heading", { name: "OpenCode Browser" })).toBeInTheDocument()
    expect(screen.queryByText("Carregando...")).not.toBeInTheDocument()
  })

  it("exibe servidor, token mascarado e pasta das conversas vazia", async () => {
    await renderOptions(makeSnapshot())

    expect(screen.getByText("http://127.0.0.1:49374")).toBeInTheDocument()
    expect(screen.getByText("abcdef…3456 (oculto)")).toBeInTheDocument()
    expect(screen.getByLabelText("Pasta das conversas do navegador")).toHaveValue("")
    expect(screen.getByPlaceholderText("~/.opencode-browser-extensions")).toBeInTheDocument()
  })

  it("exibe a pasta das conversas configurada", async () => {
    await renderOptions(
      makeSnapshot({ config: makeConfig({ directory: "/home/teste/.opencode-browser-extensions" }) }),
    )
    expect(screen.getByLabelText("Pasta das conversas do navegador")).toHaveValue(
      "/home/teste/.opencode-browser-extensions",
    )
  })

  it("salva a pasta das conversas informada", async () => {
    const { user } = await renderOptions(makeSnapshot())

    const input = screen.getByLabelText("Pasta das conversas do navegador")
    await user.clear(input)
    await user.type(input, "/tmp/conversas")
    await user.click(screen.getByRole("button", { name: "Salvar permissões" }))

    expect(sent("settings:update").patch.directory).toBe("/tmp/conversas")
  })

  it("exibe o estado da API e do plugin", async () => {
    await renderOptions(
      makeSnapshot({
        connection: {
          ...CONNECTION_ONLINE,
          phase: "offline",
          failure: "unreachable",
          offlineSince: Date.now(),
        },
        relay: { connected: false, url: "ws://x", lastError: "conexão recusada" },
      }),
    )

    expect(screen.getByText(/API: offline — servidor não respondeu/)).toBeInTheDocument()
    expect(screen.getByText(/conexão recusada/)).toBeInTheDocument()
  })

  it("exibe estado não configurado do backend", async () => {
    await renderOptions(
      makeSnapshot({ connection: { ...CONNECTION_ONLINE, phase: "unconfigured" } }),
    )
    expect(screen.getByText(/API: não configurada/)).toBeInTheDocument()
  })

  it("mostra o formulário de pareamento quando não há config", async () => {
    await renderOptions(makeSnapshot({ config: null }))

    expect(screen.getByText("Link do `opencode pair`")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Conectar" })).toBeDisabled()
    expect(screen.queryByText("Servidor")).not.toBeInTheDocument()
    expect(screen.queryByText("Modelo padrão")).not.toBeInTheDocument()
  })

  it("pareia e atualiza a tela", async () => {
    const user = userEvent.setup()
    const connected = makeSnapshot()
    mockSendMessage(makeSnapshot({ config: null }), { pair: { ok: true, snapshot: connected } })
    render(<App />)
    await screen.findByText("Conexão")

    const button = screen.getByRole("button", { name: "Conectar" })
    expect(button).toBeDisabled()

    await user.type(screen.getByLabelText(/Link do/), "  http://127.0.0.1:1/auth/connect/abc  ")
    expect(button).toBeEnabled()

    await user.click(button)
    expect(sent("pair")).toEqual({ type: "pair", link: "http://127.0.0.1:1/auth/connect/abc" })
    expect(await screen.findByText("Conectado.")).toBeInTheDocument()
    expect(screen.getByText("Servidor")).toBeInTheDocument()
  })

  it("mostra toast quando o pareamento falha", async () => {
    const user = userEvent.setup()
    mockSendMessage(makeSnapshot({ config: null }), { pair: { ok: false, error: "link expirado" } })
    render(<App />)
    await screen.findByText("Conexão")

    await user.type(screen.getByLabelText(/Link do/), "http://x")
    await user.click(screen.getByRole("button", { name: "Conectar" }))
    expect(await screen.findByText("link expirado")).toBeInTheDocument()
  })

  it("carrega as listas de permissões do storage", async () => {
    await chrome.storage.local.set({
      "permissions.allow": ["github.com", "example.com"],
      "permissions.deny": ["banco.com"],
    })
    await renderOptions(makeSnapshot())

    expect(screen.getByLabelText("Sites sempre permitidos (um por linha)")).toHaveValue("github.com\nexample.com")
    expect(screen.getByLabelText("Sites sempre bloqueados (um por linha)")).toHaveValue("banco.com")
  })

  it("ignora listas inválidas no storage", async () => {
    await chrome.storage.local.set({ "permissions.allow": "não é lista" })
    await renderOptions(makeSnapshot())
    expect(screen.getByLabelText("Sites sempre permitidos (um por linha)")).toHaveValue("")
  })

  it("salva permissões, listas e preferências", async () => {
    const user = userEvent.setup()
    const snapshot = makeSnapshot()
    mockSendMessage(snapshot, {
      "settings:update": { ok: true, snapshot: { ...snapshot, config: makeConfig({ permissionMode: "allow" }) } },
    })
    render(<App />)
    await screen.findByText("Conexão")

    await user.click(screen.getByRole("radio", { name: /Permitir ações automaticamente/ }))
    await user.selectOptions(screen.getByLabelText(/Tempo para responder/), "120")
    await user.selectOptions(screen.getByLabelText(/Busca por elemento/), "model")
    await user.click(screen.getByRole("checkbox", { name: /Tocar um aviso sonoro/ }))
    await user.click(screen.getByRole("checkbox", { name: /Mostrar notificação do sistema/ }))

    fireEvent.change(screen.getByLabelText("Sites sempre permitidos (um por linha)"), {
      target: { value: "github.com\n\n  example.com  \n" },
    })
    fireEvent.change(screen.getByLabelText("Sites sempre bloqueados (um por linha)"), {
      target: { value: "banco.com\n" },
    })

    await user.click(screen.getByRole("button", { name: "Salvar permissões" }))

    expect(chrome.storage.local.data.get("permissions.allow")).toEqual(["github.com", "example.com"])
    expect(chrome.storage.local.data.get("permissions.deny")).toEqual(["banco.com"])
    expect(sent("settings:update")).toEqual({
      type: "settings:update",
      patch: {
        permissionMode: "allow",
        defaultModel: undefined,
        defaultAgent: "build",
        findMode: "model",
        permissionTimeoutMs: 120000,
        soundEnabled: false,
        notifyEnabled: false,
        directory: undefined,
      },
    })
    expect(await screen.findByText("Permissões salvas.")).toBeInTheDocument()
  })

  it("mostra toast quando salvar permissões falha", async () => {
    const user = userEvent.setup()
    mockSendMessage(makeSnapshot(), { "settings:update": { ok: false, error: "config inválida" } })
    render(<App />)
    await screen.findByText("Conexão")

    await user.click(screen.getByRole("button", { name: "Salvar permissões" }))
    expect(await screen.findByText("config inválida")).toBeInTheDocument()
  })

  it("usa os valores salvos da config nos campos", async () => {
    await renderOptions(
      makeSnapshot({
        config: makeConfig({
          permissionMode: "deny",
          permissionTimeoutMs: 300000,
          findMode: "model",
          soundEnabled: false,
          notifyEnabled: false,
        }),
      }),
    )

    expect(screen.getByRole("radio", { name: /Bloquear ações/ })).toBeChecked()
    expect(screen.getByLabelText(/Tempo para responder/)).toHaveValue("300")
    expect(screen.getByLabelText(/Busca por elemento/)).toHaveValue("model")
    expect(screen.getByRole("checkbox", { name: /Tocar um aviso sonoro/ })).not.toBeChecked()
    expect(screen.getByRole("checkbox", { name: /Mostrar notificação do sistema/ })).not.toBeChecked()
  })

  it("desconecta após confirmação", async () => {
    const user = userEvent.setup()
    vi.spyOn(window, "confirm").mockReturnValue(true)
    const snapshot = makeSnapshot()
    mockSendMessage(snapshot, { unpair: { ok: true, snapshot: { ...snapshot, config: null } } })
    render(<App />)
    await screen.findByText("Conexão")

    await user.click(screen.getByRole("button", { name: "Desconectar" }))
    expect(sent("unpair")).toEqual({ type: "unpair" })
    expect(await screen.findByText("Desconectado.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Conectar" })).toBeInTheDocument()
  })

  it("não desconecta quando a confirmação é cancelada", async () => {
    const user = userEvent.setup()
    vi.spyOn(window, "confirm").mockReturnValue(false)
    await renderOptions(makeSnapshot())

    await user.click(screen.getByRole("button", { name: "Desconectar" }))
    expect(sent("unpair")).toBeUndefined()
    expect(screen.getByText("Servidor")).toBeInTheDocument()
  })

  it("mostra toast quando a desconexão falha", async () => {
    const user = userEvent.setup()
    vi.spyOn(window, "confirm").mockReturnValue(true)
    await renderOptions(makeSnapshot(), { unpair: { ok: false, error: "sem conexão" } })

    await user.click(screen.getByRole("button", { name: "Desconectar" }))
    expect(await screen.findByText("sem conexão")).toBeInTheDocument()
  })

  it("reconecta o relay", async () => {
    const { user } = await renderOptions(makeSnapshot())
    await user.click(screen.getByRole("button", { name: "Reconectar plugin" }))
    expect(sent("relay:reconnect")).toEqual({ type: "relay:reconnect" })
  })

  it("reconecta a API do OpenCode", async () => {
    const { user } = await renderOptions(makeSnapshot())
    await user.click(screen.getByRole("button", { name: "Reconectar" }))
    expect(sent("connection:reconnect")).toEqual({ type: "connection:reconnect" })
  })

  it("abre o painel lateral na janela atual", async () => {
    const { user } = await renderOptions(makeSnapshot())
    chrome.windows.getCurrent.mockResolvedValue({ id: 7 })

    await user.click(screen.getByRole("button", { name: "Abrir painel" }))
    await waitFor(() => expect(chrome.sidePanel.open).toHaveBeenCalledWith({ windowId: 7 }))
    expect(chrome.tabs.create).not.toHaveBeenCalled()
  })

  it("abre o painel em uma aba quando o side panel falha", async () => {
    const { user } = await renderOptions(makeSnapshot())
    chrome.windows.getCurrent.mockRejectedValue(new Error("sem janela"))

    await user.click(screen.getByRole("button", { name: "Abrir painel" }))
    await waitFor(() =>
      expect(chrome.tabs.create).toHaveBeenCalledWith({ url: "chrome-extension://test-extension-id/sidepanel.html" }),
    )
  })

  it("abre o painel em uma aba quando não há id de janela", async () => {
    const { user } = await renderOptions(makeSnapshot())
    chrome.windows.getCurrent.mockResolvedValue({})

    await user.click(screen.getByRole("button", { name: "Abrir painel" }))
    await waitFor(() => expect(chrome.tabs.create).toHaveBeenCalledTimes(1))
    expect(chrome.sidePanel.open).not.toHaveBeenCalled()
  })

  it("lista as ferramentas do navegador", async () => {
    await renderOptions(makeSnapshot())

    expect(screen.getByText("browser_batch")).toBeInTheDocument()
    expect(screen.getByText("executa várias ações em sequência")).toBeInTheDocument()
    expect(screen.getByText("tabs_context")).toBeInTheDocument()
    expect(screen.getByText("gif_creator")).toBeInTheDocument()
  })

  it("mostra a contagem de modelos e o seletor de modelo padrão", async () => {
    const { user } = await renderOptions(
      makeSnapshot({
        models: [makeModel(), makeModel({ id: "model-2", providerID: "provider-2", name: "Model Two" })],
      }),
    )

    expect(screen.getByText("2 modelo(s) disponível(is). Modelos sem suporte a tools continuam servindo para conversar, mas não controlam o navegador.")).toBeInTheDocument()

    await user.selectOptions(screen.getByTitle("Modelo do OpenCode"), "provider-2/model-2")
    await user.click(screen.getByRole("button", { name: "Salvar" }))
    expect(sent("settings:update").patch.defaultModel).toEqual({ id: "model-2", providerID: "provider-2" })
  })

  it("troca o agente padrão", async () => {
    const { user } = await renderOptions(
      makeSnapshot({ agents: [makeAgent(), makeAgent({ id: "plan", name: "Plan" })] }),
    )

    await user.selectOptions(screen.getByTitle("Agente padrão"), "plan")
    await user.click(screen.getByRole("button", { name: "Salvar" }))
    expect(sent("settings:update").patch.defaultAgent).toBe("plan")
  })

  it("não mostra o seletor de agente sem agentes", async () => {
    await renderOptions(makeSnapshot({ agents: [] }))
    expect(screen.queryByTitle("Agente padrão")).not.toBeInTheDocument()
  })

  it("mostra a seção de segurança", async () => {
    await renderOptions(makeSnapshot())
    expect(screen.getByRole("heading", { name: "Segurança" })).toBeInTheDocument()
    expect(screen.getByText(/ws:\/\/127\.0\.0\.1:8799/)).toBeInTheDocument()
  })
})
