import { act, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Onboarding } from "../../src/sidepanel/Onboarding"
import type { RelayState } from "../../src/shared/types"

const RELAY: RelayState = { connected: false, url: "ws://127.0.0.1:8799" }

function setup(overrides: Partial<Parameters<typeof Onboarding>[0]> = {}) {
  const onPair = vi.fn(async () => undefined)
  const onReconnect = vi.fn()
  const props = {
    relay: RELAY,
    error: null as string | null,
    busy: false,
    onPair,
    onReconnect,
    ...overrides,
  }
  const view = render(<Onboarding {...props} />)
  return { onPair, onReconnect, props, ...view }
}

describe("sidepanel/Onboarding", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn(async () => undefined) },
      configurable: true,
    })
  })

  afterEach(() => {
    // @ts-expect-error limpa o stub do clipboard entre testes
    delete navigator.clipboard
  })

  it("mostra o passo a passo", () => {
    const { container } = setup()

    expect(screen.getByText("OpenCode Browser")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Conecte o navegador ao OpenCode da sua máquina" })).toBeInTheDocument()
    expect(container.querySelectorAll("ol li")).toHaveLength(3)
    expect(screen.getByText("opencode pair")).toBeInTheDocument()
    expect(screen.getByLabelText(/Link do/)).toHaveAttribute("placeholder", "http://127.0.0.1:49374/auth/connect/...")
    expect(screen.getByText(/rodar `opencode pair` de novo/)).toBeInTheDocument()
  })

  it("desabilita o botão conectar sem link", async () => {
    const user = userEvent.setup()
    const { onPair } = setup()

    const button = screen.getByRole("button", { name: "Conectar ao OpenCode" })
    expect(button).toBeDisabled()

    await user.type(screen.getByLabelText(/Link do/), "   ")
    expect(button).toBeDisabled()

    await user.type(screen.getByLabelText(/Link do/), "http://127.0.0.1:1/auth/connect/abc")
    expect(button).toBeEnabled()
    expect(onPair).not.toHaveBeenCalled()
  })

  it("conecta pelo botão com o link sem espaços", async () => {
    const user = userEvent.setup()
    const { onPair } = setup()

    await user.type(screen.getByLabelText(/Link do/), "  http://127.0.0.1:1/auth/connect/abc  ")
    await user.click(screen.getByRole("button", { name: "Conectar ao OpenCode" }))
    expect(onPair).toHaveBeenCalledWith("http://127.0.0.1:1/auth/connect/abc")
  })

  it("conecta com Enter no campo de link", async () => {
    const user = userEvent.setup()
    const { onPair } = setup()

    await user.type(screen.getByLabelText(/Link do/), "http://127.0.0.1:1/auth/connect/abc{Enter}")
    expect(onPair).toHaveBeenCalledWith("http://127.0.0.1:1/auth/connect/abc")
  })

  it("Enter com link vazio não conecta", async () => {
    const user = userEvent.setup()
    const { onPair } = setup()

    await user.type(screen.getByLabelText(/Link do/), "{Enter}")
    expect(onPair).not.toHaveBeenCalled()
  })

  it("Enter não conecta enquanto busy", async () => {
    const user = userEvent.setup()
    const { onPair } = setup({ busy: true })

    await user.type(screen.getByLabelText(/Link do/), "http://x{Enter}")
    expect(onPair).not.toHaveBeenCalled()
  })

  it("mostra 'Conectando...' e desabilita o botão enquanto busy", () => {
    setup({ busy: true })
    const button = screen.getByRole("button", { name: "Conectando..." })
    expect(button).toBeDisabled()
  })

  it("mostra o erro de pareamento", () => {
    setup({ error: "link expirado" })
    expect(screen.getByText("link expirado")).toBeInTheDocument()
  })

  it("mostra o plugin conectado e permite reconectar", async () => {
    const user = userEvent.setup()
    const { onReconnect } = setup({ relay: { ...RELAY, connected: true } })

    expect(screen.getByText("Plugin conectado")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /Reconectar/ }))
    expect(onReconnect).toHaveBeenCalledTimes(1)
  })

  it("mostra o último erro do relay quando desconectado", () => {
    setup({ relay: { ...RELAY, connected: false, lastError: "conexão recusada" } })
    expect(screen.getByText("conexão recusada")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Reconectar/ })).toBeInTheDocument()
  })

  it("mostra 'Plugin desconectado' sem erro", () => {
    setup()
    expect(screen.getByText("Plugin desconectado")).toBeInTheDocument()
  })

  it("copia o comando de pareamento e confirma visualmente", async () => {
    vi.useFakeTimers()
    try {
      const { container } = setup()
      const buttons = screen.getAllByTitle("Copiar comando")
      const before = buttons[0].innerHTML

      fireEvent.click(buttons[0])
      await act(async () => {})
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("opencode pair")
      expect(buttons[0].innerHTML).not.toBe(before)

      act(() => {
        vi.advanceTimersByTime(1500)
      })
      expect(buttons[0].innerHTML).toBe(before)
      expect(container.querySelectorAll(".code-line")).toHaveLength(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it("copia o comando do plugin", async () => {
    vi.useFakeTimers()
    try {
      setup()
      const buttons = screen.getAllByTitle("Copiar comando")
      fireEvent.click(buttons[1])
      await act(async () => {})
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        "cp plugin/browser-relay.ts ~/.config/opencode/plugins/",
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it("ignora falha do clipboard", async () => {
    vi.useFakeTimers()
    try {
      const writeText = vi.fn(async () => {
        throw new Error("bloqueado")
      })
      Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true })
      setup()

      const button = screen.getAllByTitle("Copiar comando")[0]
      const before = button.innerHTML
      fireEvent.click(button)
      await act(async () => {})
      expect(writeText).toHaveBeenCalled()
      expect(button.innerHTML).toBe(before)
    } finally {
      vi.useRealTimers()
    }
  })

  it("mostra as instruções do plugin em um details", () => {
    const { container } = setup()
    const details = container.querySelector("details.card")
    expect(details).not.toBeNull()
    expect(details).toHaveTextContent("Instalar o plugin de ferramentas do navegador")
    expect(details).toHaveTextContent(/Para o agente controlar o Chrome/)
  })
})
