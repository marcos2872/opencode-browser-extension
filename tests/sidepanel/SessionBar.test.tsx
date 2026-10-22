import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { SessionBar } from "../../src/sidepanel/SessionBar"
import { makeAgent, makeSession } from "../helpers/factories"

function setup(overrides: Partial<Parameters<typeof SessionBar>[0]> = {}) {
  const handlers = {
    onSelect: vi.fn(),
    onNew: vi.fn(),
    onDelete: vi.fn(),
    onAgent: vi.fn(),
    onAttach: vi.fn(),
  }
  const props = {
    sessions: [makeSession()],
    activeID: "ses_test",
    busy: false,
    agents: [makeAgent()],
    agent: "build",
    ...handlers,
    ...overrides,
  }
  const view = render(<SessionBar {...props} />)
  return { ...handlers, ...view, props }
}

describe("sidepanel/SessionBar", () => {
  it("usa o title da sessão", () => {
    setup({ sessions: [makeSession({ id: "ses_1", title: "Minha conversa" })] })
    expect(screen.getByRole("option", { name: "Minha conversa" })).toBeInTheDocument()
  })

  it("usa o slug quando não há title", () => {
    setup({ sessions: [makeSession({ id: "ses_1", title: undefined, slug: "slug-da-sessao" })] })
    expect(screen.getByRole("option", { name: "slug-da-sessao" })).toBeInTheDocument()
  })

  it("usa o sufixo do id quando não há title nem slug", () => {
    setup({ sessions: [makeSession({ id: "ses_abcdef123456", title: "   ", slug: undefined })] })
    expect(screen.getByRole("option", { name: "Sessão 123456" })).toBeInTheDocument()
  })

  it("mostra 'Nenhuma sessão' e desabilita o select sem sessões", () => {
    setup({ sessions: [], activeID: null })
    const select = screen.getByTitle("Sessões do OpenCode")
    expect(select).toBeDisabled()
    expect(screen.getByRole("option", { name: "Nenhuma sessão" })).toBeInTheDocument()
  })

  it("reflete a sessão ativa e chama onSelect", async () => {
    const user = userEvent.setup()
    const { onSelect } = setup({
      sessions: [makeSession({ id: "ses_1", title: "Um" }), makeSession({ id: "ses_2", title: "Dois" })],
      activeID: "ses_1",
    })

    const select = screen.getByTitle("Sessões do OpenCode")
    expect(select).toHaveValue("ses_1")

    await user.selectOptions(select, "ses_2")
    expect(onSelect).toHaveBeenCalledWith("ses_2")
  })

  it("chama onNew, onDelete e onAttach pelos botões", async () => {
    const user = userEvent.setup()
    const { onNew, onDelete, onAttach } = setup()

    await user.click(screen.getByTitle("Nova conversa"))
    expect(onNew).toHaveBeenCalledTimes(1)

    await user.click(screen.getByTitle("Excluir sessão"))
    expect(onDelete).toHaveBeenCalledTimes(1)

    await user.click(screen.getByTitle("Anexar a aba atual ao grupo"))
    expect(onAttach).toHaveBeenCalledTimes(1)
  })

  it("desabilita excluir sem sessão ativa", () => {
    setup({ activeID: null })
    expect(screen.getByTitle("Excluir sessão")).toBeDisabled()
  })

  it("desabilita os botões de ação enquanto busy", () => {
    setup({ busy: true })
    expect(screen.getByTitle("Nova conversa")).toBeDisabled()
    expect(screen.getByTitle("Excluir sessão")).toBeDisabled()
    expect(screen.getByTitle("Anexar a aba atual ao grupo")).toBeDisabled()
    expect(screen.getByTitle("Agente do OpenCode")).toBeDisabled()
  })

  it("mostra o select de agente somente quando há agentes", () => {
    const { rerender, props } = setup({ agents: [] })
    expect(screen.queryByTitle("Agente do OpenCode")).not.toBeInTheDocument()

    rerender(<SessionBar {...props} agents={[makeAgent()]} />)
    expect(screen.getByTitle("Agente do OpenCode")).toBeInTheDocument()
  })

  it("lista agentes com nome ou id e chama onAgent", async () => {
    const user = userEvent.setup()
    const { onAgent } = setup({
      agents: [makeAgent({ id: "build", name: "Build" }), makeAgent({ id: "plan", name: undefined })],
      agent: "build",
    })

    const select = screen.getByTitle("Agente do OpenCode")
    expect(screen.getByRole("option", { name: "Build" })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "plan" })).toBeInTheDocument()

    await user.selectOptions(select, "plan")
    expect(onAgent).toHaveBeenCalledWith("plan")
  })
})
