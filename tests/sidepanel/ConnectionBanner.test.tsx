import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { ConnectionBanner } from "../../src/sidepanel/ConnectionBanner"
import type { ConnectionState, RelayState } from "../../src/shared/types"

const ONLINE: ConnectionState = {
  phase: "online",
  failure: null,
  detail: null,
  attempts: 0,
  lastOnlineAt: null,
  offlineSince: null,
}

const RELAY_OK: RelayState = { connected: true, url: "ws://127.0.0.1:8799" }

function offline(partial: Partial<ConnectionState> = {}): ConnectionState {
  return {
    ...ONLINE,
    phase: "offline",
    failure: "unreachable",
    detail: null,
    offlineSince: Date.now(),
    ...partial,
  }
}

function setup(
  connection: ConnectionState,
  relay: RelayState = RELAY_OK,
): { onRetry: ReturnType<typeof vi.fn>; onOpenOptions: ReturnType<typeof vi.fn> } {
  const onRetry = vi.fn()
  const onOpenOptions = vi.fn()
  render(
    <ConnectionBanner
      connection={connection}
      relay={relay}
      onRetry={onRetry}
      onOpenOptions={onOpenOptions}
    />,
  )
  return { onRetry, onOpenOptions }
}

describe("ConnectionBanner", () => {
  it("não aparece quando o backend está online ou não configurado", () => {
    const { container } = render(
      <ConnectionBanner
        connection={ONLINE}
        relay={RELAY_OK}
        onRetry={vi.fn()}
        onOpenOptions={vi.fn()}
      />,
    )
    expect(container).toBeEmptyDOMElement()

    const { container: unconfigured } = render(
      <ConnectionBanner
        connection={{ ...ONLINE, phase: "unconfigured" }}
        relay={RELAY_OK}
        onRetry={vi.fn()}
        onOpenOptions={vi.fn()}
      />,
    )
    expect(unconfigured).toBeEmptyDOMElement()
  })

  it("orienta a iniciar o servidor quando ele não responde", async () => {
    const user = userEvent.setup()
    const { onRetry } = setup(offline())

    expect(screen.getByText("O OpenCode não está respondendo")).toBeInTheDocument()
    expect(screen.getByText(/opencode serve/)).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: /Tentar novamente/ }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it("pede um novo pareamento quando o token é inválido", async () => {
    const user = userEvent.setup()
    const { onOpenOptions } = setup(offline({ failure: "unauthorized" }))

    expect(screen.getByText(/Token do OpenCode inválido/)).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /Abrir configurações/ }))
    expect(onOpenOptions).toHaveBeenCalledTimes(1)
  })

  it("mostra o detalhe técnico em timeout e o texto padrão em erro do servidor", () => {
    const { unmount } = render(
      <ConnectionBanner
        connection={offline({ failure: "timeout", detail: "não respondeu em 15s" })}
        relay={RELAY_OK}
        onRetry={vi.fn()}
        onOpenOptions={vi.fn()}
      />,
    )
    expect(screen.getByText("não respondeu em 15s")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Tentar novamente/ })).toBeInTheDocument()
    unmount()

    setup(offline({ failure: "server_error", detail: null }))
    expect(screen.getByText("O OpenCode respondeu com erro")).toBeInTheDocument()
    expect(screen.getByText(/Confira o log do servidor/)).toBeInTheDocument()
  })

  it("usa o texto padrão de timeout sem detalhe", () => {
    setup(offline({ failure: "timeout", detail: null }))
    expect(screen.getByText(/O servidor pode estar travado/)).toBeInTheDocument()
  })

  it("usa a causa e o detalhe do stream encerrado", () => {
    setup(offline({ failure: "stream_closed", detail: "HTTP 502" }))
    expect(screen.getByText("A conexão com o OpenCode foi encerrada")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Reconectar/ })).toBeInTheDocument()
  })

  it("explica o estado do plugin quando o relay está fora", () => {
    setup(offline(), {
      connected: false,
      url: "ws://127.0.0.1:8799",
      reason: "missing_plugin",
    })
    expect(screen.getByText(/Plugin não encontrado/)).toBeInTheDocument()
  })

  it("mostra a fase de conexão", () => {
    setup({ ...ONLINE, phase: "connecting" })
    expect(screen.getByText("Conectando ao OpenCode…")).toBeInTheDocument()
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })
})
