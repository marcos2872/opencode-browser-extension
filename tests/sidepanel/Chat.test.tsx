import { createRef } from "react"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { Chat } from "../../src/sidepanel/Chat"
import type { ChatMessage } from "../../src/shared/types"
import { makeMessage } from "../helpers/factories"

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
})
