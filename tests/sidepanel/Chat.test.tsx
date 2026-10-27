import { createRef } from "react"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { Chat } from "../../src/sidepanel/Chat"
import type { ChatMessage } from "../../src/shared/types"
import { makeForm, makeMessage } from "../helpers/factories"

function userMessage(text: string): ChatMessage {
  return { kind: "user", id: `user-${text}`, text, time: 1 }
}

describe("sidepanel/Chat", () => {
  it("mostra o estado vazio com as sugestões", () => {
    render(<Chat messages={[]} busy={false} onSuggestion={vi.fn()} />)

    expect(screen.getByRole("heading", { name: "Seu navegador, com os modelos do OpenCode" })).toBeInTheDocument()
    expect(screen.getByText(/Cada ação sensível pede sua permissão/)).toBeInTheDocument()
    expect(screen.getAllByRole("button")).toHaveLength(4)
  })

  it("clicar em uma sugestão chama onSuggestion com o texto", async () => {
    const onSuggestion = vi.fn()
    const user = userEvent.setup()
    render(<Chat messages={[]} busy={false} onSuggestion={onSuggestion} />)

    const button = screen.getByRole("button", { name: /Hacker News/ })
    await user.click(button)
    expect(onSuggestion).toHaveBeenCalledWith(button.textContent)
  })

  it("mostra 'pensando' no estado vazio enquanto busy", () => {
    render(<Chat messages={[]} busy onSuggestion={vi.fn()} />)
    expect(screen.getByText(/pensando/)).toBeInTheDocument()
  })

  it("renderiza mensagens do usuário", () => {
    render(<Chat messages={[userMessage("faça isso")]} busy={false} onSuggestion={vi.fn()} />)

    const message = screen.getByText("faça isso")
    expect(message).toHaveClass("msg-user")
    expect(screen.queryByRole("heading")).not.toBeInTheDocument()
  })

  it("renderiza assistente com markdown, raciocínio e tools", () => {
    const { container } = render(
      <Chat
        messages={[
          makeMessage({
            id: "a1",
            text: "resposta **forte**",
            reasoning: "considerei as opções",
            tools: [{ id: "t1", name: "navigate", status: "ok", input: { url: "https://example.com" }, output: "ok" }],
          }),
        ]}
        busy={false}
        onSuggestion={vi.fn()}
        toolDisplay="rows"
      />,
    )

    expect(screen.getByText("OpenCode")).toBeInTheDocument()
    expect(container.querySelector("strong")).toHaveTextContent("forte")

    const details = screen.getByText("Raciocínio").closest("details")
    expect(details).not.toBeNull()
    expect(details).toHaveTextContent("considerei as opções")
    expect(details).not.toHaveAttribute("open")

    expect(screen.getByText("Navegar")).toBeInTheDocument()
    expect(screen.getByText("https://example.com")).toBeInTheDocument()
  })

  it("não renderiza raciocínio quando vazio", () => {
    render(<Chat messages={[makeMessage({ reasoning: "" })]} busy={false} onSuggestion={vi.fn()} />)
    expect(screen.queryByText("Raciocínio")).not.toBeInTheDocument()
  })

  it("mostra erro do assistente", () => {
    const { container } = render(
      <Chat messages={[makeMessage({ error: "falha na chamada" })]} busy={false} onSuggestion={vi.fn()} />,
    )
    expect(screen.getByText("falha na chamada")).toBeInTheDocument()
    expect(container.querySelector(".error-banner")).toHaveTextContent("falha na chamada")
  })

  it("agrupa as tools do run em uma linha e abre o modal", async () => {
    const user = userEvent.setup()
    const message = makeMessage({
      tools: [
        { id: "t1", name: "navigate", status: "ok", input: { url: "https://x.com" }, output: "ok", startedAt: 1_000, finishedAt: 1_400 },
        { id: "t2", name: "computer", status: "error", input: { action: "click" }, output: "Ref inexistente.", startedAt: 1_500, finishedAt: 3_000 },
      ],
    })
    render(<Chat messages={[message]} busy={false} onSuggestion={vi.fn()} />)

    expect(screen.getByText("2 ferramentas")).toBeInTheDocument()
    expect(screen.getByText("1 erro")).toBeInTheDocument()
    expect(screen.queryByText("Navegar")).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: /2 ferramentas/ }))
    const dialog = screen.getByRole("dialog")
    expect(dialog).toBeInTheDocument()
    expect(screen.getByText("Navegar")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: /Navegar/ }))
    expect(screen.getByText("Parâmetros")).toBeInTheDocument()

    await user.keyboard("{Escape}")
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("respeita os modos de linhas e cards completos", () => {
    const message = makeMessage({
      tools: [
        { id: "t1", name: "navigate", status: "ok", input: { url: "https://x.com" }, output: "ok" },
      ],
    })
    const { rerender } = render(
      <Chat messages={[message]} busy={false} onSuggestion={vi.fn()} toolDisplay="rows" />,
    )
    expect(screen.getByText("Navegar")).toBeInTheDocument()
    expect(screen.queryByText("2 ferramentas")).not.toBeInTheDocument()

    rerender(
      <Chat messages={[message]} busy={false} onSuggestion={vi.fn()} toolDisplay="full" />,
    )
    expect(screen.getByText("Parâmetros")).toBeInTheDocument()
    expect(screen.getByText("Resultado")).toBeInTheDocument()
  })

  it("mostra o uso de tokens e o custo informado pelo OpenCode", () => {    render(
      <Chat
        messages={[makeMessage({ usage: { total: 1200, input: 900, output: 300, cost: 0.0012 } })]}
        busy={false}
        onSuggestion={vi.fn()}
      />,
    )

    expect(screen.getByText(/1\.200 tokens · 900 entrada · 300 saída/)).toBeInTheDocument()
    expect(screen.getByText(/US\$/)).toBeInTheDocument()
  })

  it("mostra os pontos de streaming quando o assistente está transmitindo", () => {
    const { container } = render(
      <Chat messages={[makeMessage({ streaming: true, text: "parcial" })]} busy onSuggestion={vi.fn()} />,
    )
    const message = container.querySelector(".msg-assistant")
    expect(message?.querySelector(".thinking")).not.toBeNull()
    expect(screen.queryByText(/aguardando o OpenCode/)).not.toBeInTheDocument()
  })

  it("mostra 'trabalhando' quando o assistente transmite sem texto nem tools", () => {
    render(
      <Chat messages={[makeMessage({ streaming: true, text: "", tools: [] })]} busy onSuggestion={vi.fn()} />,
    )
    expect(screen.getByText(/trabalhando/)).toBeInTheDocument()
  })

  it("mostra 'aguardando o OpenCode' quando busy sem streaming", () => {
    render(<Chat messages={[userMessage("oi")]} busy onSuggestion={vi.fn()} />)
    expect(screen.getByText(/aguardando o OpenCode/)).toBeInTheDocument()
  })

  it("não mostra 'aguardando' quando já existe assistente em streaming", () => {
    render(
      <Chat
        messages={[makeMessage({ streaming: true, text: "ok" })]}
        busy
        onSuggestion={vi.fn()}
      />,
    )
    expect(screen.queryByText(/aguardando o OpenCode/)).not.toBeInTheDocument()
  })

  it("anexa o bottomRef no estado vazio", () => {
    const bottomRef = createRef<HTMLDivElement>()
    const { container } = render(<Chat messages={[]} busy={false} onSuggestion={vi.fn()} bottomRef={bottomRef} />)

    expect(bottomRef.current).not.toBeNull()
    expect(bottomRef.current).toBe(container.querySelector(".empty > div:last-child"))
  })

  it("anexa o bottomRef quando há mensagens", () => {
    const bottomRef = createRef<HTMLDivElement>()
    const { container } = render(
      <Chat messages={[userMessage("oi")]} busy={false} onSuggestion={vi.fn()} bottomRef={bottomRef} />,
    )

    expect(bottomRef.current).not.toBeNull()
    expect(bottomRef.current).toBe(container.querySelector(".chat > div:last-child"))
  })

  it("renderiza um form sem tool question visível (elicitation) e responde", async () => {
    const form = makeForm({ metadata: undefined })
    const onFormSubmit = vi.fn()
    const user = userEvent.setup()
    render(
      <Chat
        messages={[userMessage("oi")]}
        busy={false}
        onSuggestion={vi.fn()}
        forms={[form]}
        onFormSubmit={onFormSubmit}
      />,
    )

    expect(screen.getByText("Escopo da limpeza")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /Sim/ }))
    await user.click(screen.getByRole("button", { name: /Responder/ }))
    expect(onFormSubmit).toHaveBeenCalledWith(form, { q0: "Sim" })
  })

  it("mostra o form órfão mesmo sem mensagens", () => {
    render(
      <Chat messages={[]} busy={false} onSuggestion={vi.fn()} forms={[makeForm({ metadata: undefined })]} />,
    )
    expect(screen.queryByRole("heading", { name: "Seu navegador, com os modelos do OpenCode" })).not.toBeInTheDocument()
    expect(screen.getByText("Escopo da limpeza")).toBeInTheDocument()
  })

  it("não duplica um form que já tem card de question", () => {
    const form = makeForm()
    render(
      <Chat
        messages={[
          makeMessage({
            tools: [{ id: "t1", name: "question", status: "running", input: { questions: [] } }],
          }),
        ]}
        busy={false}
        onSuggestion={vi.fn()}
        forms={[form]}
        onFormSubmit={vi.fn()}
      />,
    )
    expect(screen.getAllByText("Escopo da limpeza")).toHaveLength(1)
  })
})
