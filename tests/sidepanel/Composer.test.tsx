import { useState } from "react"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, describe, expect, it, vi } from "vitest"
import { Composer } from "../../src/sidepanel/Composer"
import type { CommandInfo } from "../../src/shared/types"
import { makeCommand } from "../helpers/factories"

interface HarnessProps {
  initialValue?: string
  busy?: boolean
  disabled?: boolean
  relayConnected?: boolean
  commands?: CommandInfo[]
  onSend?: () => void
  onStop?: () => void
  onChangeSpy?: (value: string) => void
}

function Harness({ initialValue = "", onChangeSpy, ...rest }: HarnessProps) {
  const [value, setValue] = useState(initialValue)
  return (
    <Composer
      value={value}
      busy={rest.busy ?? false}
      disabled={rest.disabled}
      relayConnected={rest.relayConnected ?? true}
      commands={rest.commands ?? []}
      onChange={(next) => {
        setValue(next)
        onChangeSpy?.(next)
      }}
      onSend={rest.onSend ?? (() => {})}
      onStop={rest.onStop ?? (() => {})}
    />
  )
}

function Controlled({ value, ...rest }: HarnessProps & { value: string }) {
  return (
    <Composer
      value={value}
      busy={rest.busy ?? false}
      disabled={rest.disabled}
      relayConnected={rest.relayConnected ?? true}
      commands={rest.commands ?? []}
      onChange={rest.onChangeSpy ?? (() => {})}
      onSend={rest.onSend ?? (() => {})}
      onStop={rest.onStop ?? (() => {})}
    />
  )
}

describe("sidepanel/Composer", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("ajusta a altura do textarea conforme o conteúdo (auto-resize)", () => {
    const scrollHeight = vi.spyOn(Element.prototype, "scrollHeight", "get").mockReturnValue(200)
    const { rerender } = render(<Controlled value="" />)
    const textarea = screen.getByPlaceholderText("Peça algo ao OpenCode...")
    expect(textarea.style.height).toBe("160px")

    scrollHeight.mockReturnValue(40)
    rerender(<Controlled value="duas linhas" />)
    expect(textarea.style.height).toBe("40px")
  })

  it("Enter envia quando há texto", async () => {
    const onSend = vi.fn()
    const user = userEvent.setup()
    render(<Harness onSend={onSend} />)

    await user.type(screen.getByPlaceholderText("Peça algo ao OpenCode..."), "olá{Enter}")
    expect(onSend).toHaveBeenCalledTimes(1)
  })

  it("Enter não envia com texto vazio ou só espaços", async () => {
    const onSend = vi.fn()
    const user = userEvent.setup()
    render(<Harness onSend={onSend} />)

    const textarea = screen.getByPlaceholderText("Peça algo ao OpenCode...")
    await user.type(textarea, "{Enter}")
    await user.type(textarea, "   {Enter}")
    expect(onSend).not.toHaveBeenCalled()
  })

  it("Enter não envia enquanto busy", async () => {
    const onSend = vi.fn()
    const user = userEvent.setup()
    render(<Harness busy initialValue="olá" onSend={onSend} />)

    await user.type(screen.getByPlaceholderText("O agente está trabalhando..."), "{Enter}")
    expect(onSend).not.toHaveBeenCalled()
  })

  it("Shift+Enter quebra linha sem enviar", async () => {
    const onSend = vi.fn()
    const user = userEvent.setup()
    render(<Harness onSend={onSend} />)

    const textarea = screen.getByPlaceholderText("Peça algo ao OpenCode...")
    await user.type(textarea, "linha{Shift>}{Enter}{/Shift}")
    expect(onSend).not.toHaveBeenCalled()
    expect(textarea).toHaveValue("linha\n")
  })

  it("botão de enviar desabilitado sem texto e habilitado com texto", async () => {
    const onSend = vi.fn()
    const user = userEvent.setup()
    render(<Harness onSend={onSend} />)

    const sendButton = screen.getByTitle("Enviar (Enter)")
    expect(sendButton).toBeDisabled()

    await user.type(screen.getByPlaceholderText("Peça algo ao OpenCode..."), "oi")
    expect(sendButton).toBeEnabled()

    await user.click(sendButton)
    expect(onSend).toHaveBeenCalledTimes(1)
  })

  it("botão de enviar desabilitado quando disabled", () => {
    render(<Harness disabled initialValue="oi" />)
    expect(screen.getByTitle("Enviar (Enter)")).toBeDisabled()
  })

  it("mostra o botão Parar quando busy e chama onStop", async () => {
    const onStop = vi.fn()
    const user = userEvent.setup()
    render(<Harness busy onStop={onStop} />)

    expect(screen.queryByTitle("Enviar (Enter)")).not.toBeInTheDocument()
    const stop = screen.getByTitle("Parar")
    await user.click(stop)
    expect(onStop).toHaveBeenCalledTimes(1)
  })

  it("mostra o menu de comandos filtrado pelo prefixo", async () => {
    const onChangeSpy = vi.fn()
    const user = userEvent.setup()
    const commands = [
      makeCommand({ name: "review", description: "Revisa o diff" }),
      makeCommand({ name: "refactor", description: "Refatora" }),
      makeCommand({ name: "test", description: "Roda testes" }),
    ]
    render(<Harness commands={commands} onChangeSpy={onChangeSpy} />)

    await user.type(screen.getByPlaceholderText("Peça algo ao OpenCode..."), "/re")
    const menu = document.querySelector(".command-menu")
    expect(menu).not.toBeNull()
    expect(menu?.querySelectorAll("button")).toHaveLength(2)
    expect(screen.queryByText("/test")).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: /\/refactor/ }))
    expect(onChangeSpy).toHaveBeenCalledWith("/refactor ")
  })

  it("limita o menu a seis comandos", async () => {
    const user = userEvent.setup()
    const commands = Array.from({ length: 8 }, (_, index) => makeCommand({ name: `cmd${index}` }))
    render(<Harness commands={commands} />)

    await user.type(screen.getByPlaceholderText("Peça algo ao OpenCode..."), "/")
    expect(document.querySelectorAll(".command-menu button")).toHaveLength(6)
  })

  it("não mostra o menu quando não há correspondências", async () => {
    const user = userEvent.setup()
    render(<Harness commands={[makeCommand({ name: "review" })]} />)

    await user.type(screen.getByPlaceholderText("Peça algo ao OpenCode..."), "/zzz")
    expect(document.querySelector(".command-menu")).toBeNull()
  })

  it("não mostra o menu fora do padrão de barra", async () => {
    const user = userEvent.setup()
    render(<Harness commands={[makeCommand({ name: "review" })]} />)

    await user.type(screen.getByPlaceholderText("Peça algo ao OpenCode..."), "/review texto")
    expect(document.querySelector(".command-menu")).toBeNull()
  })

  it("mostra a dica de teclado e o status do relay conectado", () => {
    render(<Harness relayConnected />)
    expect(screen.getByText("Enter envia · Shift+Enter quebra linha")).toBeInTheDocument()
    expect(screen.getByText("ferramentas conectadas")).toBeInTheDocument()
  })

  it("mostra o status do relay desconectado", () => {
    const { container } = render(<Harness relayConnected={false} />)
    expect(screen.getByText("ferramentas offline")).toBeInTheDocument()
    expect(container.querySelector(".composer-hint .dot")).toHaveClass("warn")
  })
})
