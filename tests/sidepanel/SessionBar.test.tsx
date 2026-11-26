import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { SessionBar } from "../../src/sidepanel/SessionBar"
import { makeSession } from "../helpers/factories"
import type { BrowserTabContext } from "../../src/shared/types"

function setup(overrides: Partial<Parameters<typeof SessionBar>[0]> = {}) {
  const handlers = {
    onSelect: vi.fn(),
    onNew: vi.fn(),
    onDelete: vi.fn(),
    onAttach: vi.fn(),
    onDetach: vi.fn(),
  }
  const props = {
    sessions: [makeSession()],
    activeID: "ses_test",
    busy: false,
    contextTabs: [] as BrowserTabContext[],
    contextError: null,
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

  it("chama onNew e onDelete pelos botões", async () => {
    const user = userEvent.setup()
    const { onNew, onDelete } = setup();

    await user.click(screen.getByTitle("Nova conversa"))
    expect(onNew).toHaveBeenCalledTimes(1)

    await user.click(screen.getByTitle("Excluir sessão"))
    expect(onDelete).toHaveBeenCalledTimes(1)

  })

  it("conecta a aba atual diretamente quando não há abas no contexto", async () => {
    const user = userEvent.setup()
    const { onAttach } = setup()
    await user.click(screen.getByRole("button", { name: "Conectar aba atual" }))
    expect(onAttach).toHaveBeenCalledTimes(1)
  })

  it("abre as abas conectadas e oferece conectar outra", async () => {
    const user = userEvent.setup()
    const tab = { id: 9, title: "Portal", url: "https://example.com/page", active: true }
    setup({ contextTabs: [tab] })
    const attachButton = screen.getByRole("button", { name: "Mostrar 1 aba conectada" })
    expect(attachButton).toHaveClass("connected")
    expect(attachButton).toHaveAttribute("title", "1 aba conectada. Mostrar abas ou conectar nova")
    await user.click(attachButton)
    expect(screen.getByText("Portal")).toBeInTheDocument()
    expect(screen.getByText("https://example.com")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Conectar nova aba" })).toBeInTheDocument()
  })

  it("mostra a quantidade de abas e dá nome acessível ao botão excluir", () => {
    setup({
      contextTabs: [
        { id: 9, title: "Portal", url: "https://example.com/page", active: true },
        { id: 10, title: "Docs", url: "https://docs.example.com/", active: false },
      ],
    })

    expect(screen.getByText("2", { selector: ".session-attach-count" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Excluir sessão" })).toBeInTheDocument()
  })

  it("desabilita excluir sem sessão ativa", () => {
    setup({ activeID: null })
    expect(screen.getByTitle("Excluir sessão")).toBeDisabled()
  })

  it("mantém nova conversa habilitada e bloqueia ações da sessão enquanto busy", () => {
    setup({ busy: true })
    expect(screen.getByTitle("Nova conversa")).toBeEnabled()
    expect(screen.getByTitle("Excluir sessão")).toBeDisabled()
    expect(screen.queryByTitle("Agente do OpenCode")).not.toBeInTheDocument()
  })

  it("desabilita nova conversa apenas enquanto a criação está em andamento", () => {
    setup({ creating: true })
    expect(screen.getByTitle("Criando conversa…")).toBeDisabled()
    expect(screen.getByTitle("Criando conversa…")).toHaveAttribute("aria-busy", "true")
  })

  it("não oferece mudança de agente", () => {
    setup()
    expect(screen.queryByTitle("Agente do OpenCode")).not.toBeInTheDocument()
  })
})

describe("sidepanel/SessionBar: sessões paralelas", () => {
  it("marca executando e nova resposta nas opções", () => {
    setup({
      sessions: [
        makeSession({ id: "ses_1", title: "Um" }),
        makeSession({ id: "ses_2", title: "Dois" }),
        makeSession({ id: "ses_3", title: "Três" }),
      ],
      meta: [
        { sessionID: "ses_1", busy: true, unread: false },
        { sessionID: "ses_2", busy: false, unread: true },
      ],
    })

    expect(screen.getByRole("option", { name: "Um · executando" })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "Dois · nova resposta" })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "Três" })).toBeInTheDocument()
  })
})
