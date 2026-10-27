import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { ToolCard, questionToolID, readQuestions } from "../../src/sidepanel/ToolCard"
import type { ToolCallView } from "../../src/shared/types"
import { makeForm } from "../helpers/factories"

function makeTool(partial: Partial<ToolCallView> = {}): ToolCallView {
  return { id: "t1", name: "navigate", status: "running", ...partial }
}

describe("sidepanel/ToolCard", () => {
  it("traduz o rótulo do tool", () => {
    const { rerender } = render(<ToolCard tool={makeTool({ name: "tabs_context" })} />)
    expect(screen.getByText("Abas do grupo")).toBeInTheDocument()

    rerender(<ToolCard tool={makeTool({ name: "javascript_tool" })} />)
    expect(screen.getByText("JavaScript")).toBeInTheDocument()

    rerender(<ToolCard tool={makeTool({ name: "browser_batch" })} />)
    expect(screen.getByText("Lote de ações")).toBeInTheDocument()
  })

  it("usa o nome cru quando não há rótulo conhecido", () => {
    render(<ToolCard tool={makeTool({ name: "custom_tool" })} />)
    expect(screen.getByText("custom_tool")).toBeInTheDocument()
  })

  it("resume url", () => {
    render(<ToolCard tool={makeTool({ input: { url: "https://example.com/pagina" } })} />)
    expect(screen.getByText("https://example.com/pagina")).toBeInTheDocument()
  })

  it("resume query entre aspas", () => {
    render(<ToolCard tool={makeTool({ name: "find", input: { query: "botão enviar" } })} />)
    expect(screen.getByText('"botão enviar"')).toBeInTheDocument()
  })

  it("resume action, ref e coordinate", () => {
    render(
      <ToolCard
        tool={makeTool({ name: "computer", input: { action: "click", ref: "ref_3", coordinate: [10, 20] } })}
      />,
    )
    expect(screen.getByText("click ref_3 (10, 20)")).toBeInTheDocument()
  })

  it("resume action sem ref nem coordinate", () => {
    render(<ToolCard tool={makeTool({ name: "computer", input: { action: "screenshot" } })} />)
    expect(screen.getByText("screenshot")).toBeInTheDocument()
  })

  it("resume ref isolado", () => {
    render(<ToolCard tool={makeTool({ name: "form_input", input: { ref: "ref_9" } })} />)
    expect(screen.getByText("ref_9")).toBeInTheDocument()
  })

  it("resume tabId", () => {
    render(<ToolCard tool={makeTool({ name: "tabs_close", input: { tabId: 7 } })} />)
    expect(screen.getByText("aba 7")).toBeInTheDocument()
  })

  it("resume domains e actions", () => {
    const { rerender } = render(
      <ToolCard tool={makeTool({ name: "update_plan", input: { domains: ["a.com", "b.com"] } })} />,
    )
    expect(screen.getByText("a.com, b.com")).toBeInTheDocument()

    rerender(<ToolCard tool={makeTool({ name: "browser_batch", input: { actions: [{}, {}, {}] } })} />)
    expect(screen.getByText("3 ação(ões)")).toBeInTheDocument()
  })

  it("corta o resumo em 80 caracteres", () => {
    const url = `https://example.com/${"a".repeat(200)}`
    render(<ToolCard tool={makeTool({ input: { url } })} />)
    expect(screen.getByText(url.slice(0, 80))).toBeInTheDocument()
  })

  it("não mostra resumo quando o input não tem campos conhecidos", () => {
    const { container } = render(<ToolCard tool={makeTool({ input: { outro: true } })} />)
    expect(container.querySelector(".tool-head .status")).toBeNull()
  })

  it("mostra o status rodando, ok e erro", () => {
    const { container, rerender } = render(<ToolCard tool={makeTool({ status: "running" })} />)
    expect(screen.getByText("rodando")).toBeInTheDocument()
    expect(container.querySelector(".tool-status")).toHaveClass("running")

    rerender(<ToolCard tool={makeTool({ status: "ok" })} />)
    expect(screen.getByText("ok")).toBeInTheDocument()
    expect(container.querySelector(".tool-status")).toHaveClass("ok")

    rerender(<ToolCard tool={makeTool({ status: "error" })} />)
    expect(screen.getByText("erro")).toBeInTheDocument()
    expect(container.querySelector(".tool-status")).toHaveClass("error")
  })

  it("renderiza imagens em base64 (no máximo três)", () => {
    const images = [1, 2, 3, 4].map((index) => ({
      name: `shot-${index}.png`,
      mime: "image/png",
      data: `AAA${index}`,
    }))
    const { container } = render(<ToolCard tool={makeTool({ images })} />)

    const rendered = container.querySelectorAll(".tool-images img")
    expect(rendered).toHaveLength(3)
    expect(rendered[0]).toHaveAttribute("src", "data:image/png;base64,AAA1")
    expect(rendered[0]).toHaveAttribute("alt", "shot-1.png")
    expect(rendered[0]).toHaveAttribute("loading", "lazy")
  })

  it("não renderiza imagens quando a lista está vazia", () => {
    const { container } = render(<ToolCard tool={makeTool({ images: [] })} />)
    expect(container.querySelector(".tool-images")).toBeNull()
  })

  it("mostra os parâmetros em um details fechado", () => {
    const { container } = render(<ToolCard tool={makeTool({ input: { ref: "ref_1", texto: "olá" } })} />)

    const details = screen.getByText("Parâmetros").closest("details")
    expect(details).not.toBeNull()
    expect(details).not.toHaveAttribute("open")
    expect(container.querySelector(".tool-args")).toHaveTextContent('"ref": "ref_1"')
  })

  it("esconde os parâmetros quando o input está vazio", () => {
    const { container } = render(<ToolCard tool={makeTool({ input: {} })} />)
    expect(screen.queryByText("Parâmetros")).not.toBeInTheDocument()
    expect(container.querySelector(".tool-args")).toBeNull()
  })

  it("mostra o resultado e abre automaticamente em caso de erro", () => {
    const { rerender } = render(<ToolCard tool={makeTool({ status: "ok", output: "tudo certo" })} />)
    const details = screen.getByText("Resultado").closest("details")
    expect(details).toHaveTextContent("tudo certo")
    expect(details).not.toHaveAttribute("open")

    rerender(<ToolCard tool={makeTool({ status: "error", output: "quebrou" })} />)
    expect(screen.getByText("Resultado").closest("details")).toHaveAttribute("open")
  })

  it("esconde o resultado quando não há output", () => {
    render(<ToolCard tool={makeTool({ output: undefined })} />)
    expect(screen.queryByText("Resultado")).not.toBeInTheDocument()
  })
})

describe("sidepanel/ToolCard: modo compacto", () => {
  it("mostra só a linha e expande os detalhes ao clicar", async () => {
    const user = userEvent.setup()
    const { container } = render(
      <ToolCard
        detailed={false}
        tool={makeTool({ status: "ok", input: { ref: "ref_1" }, output: "resultado" })}
      />,
    )

    const head = screen.getByRole("button", { name: /Navegar/ })
    expect(head).toHaveAttribute("aria-expanded", "false")
    expect(container.querySelector(".tool-card")).toHaveClass("compact")
    expect(screen.queryByText("Parâmetros")).not.toBeInTheDocument()
    expect(screen.queryByText("Resultado")).not.toBeInTheDocument()

    await user.click(head)
    expect(head).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByText("Parâmetros")).toBeInTheDocument()
    expect(screen.getByText("Resultado")).toBeInTheDocument()
  })

  it("mantém o texto do erro visível com o card recolhido", () => {
    render(
      <ToolCard
        detailed={false}
        tool={makeTool({ status: "error", output: "Ref nonexistent não encontrada." })}
      />,
    )

    expect(screen.getByText("Ref nonexistent não encontrada.")).toBeInTheDocument()
    expect(screen.getByText("erro")).toBeInTheDocument()
    expect(screen.queryByText("Resultado")).not.toBeInTheDocument()
  })

  it("usa só a primeira linha do erro", () => {
    render(
      <ToolCard
        detailed={false}
        tool={makeTool({ status: "error", output: "primeira linha\nsegunda linha" })}
      />,
    )

    expect(screen.getByText("primeira linha")).toBeInTheDocument()
    expect(screen.queryByText(/segunda linha/)).not.toBeInTheDocument()
  })
})

const QUESTION_INPUT = {
  questions: [
    {
      header: "Escopo",
      question: "Apagar tudo?",
      multiple: false,
      options: [{ label: "Sim" }, { label: "Não" }],
    },
  ],
}

describe("sidepanel/ToolCard: questionToolID", () => {
  it("lê o id da tool em metadata.tool.id", () => {
    expect(questionToolID(makeForm())).toBe("t1")
  })

  it("devolve undefined quando o metadata não aponta para uma tool", () => {
    expect(questionToolID(makeForm({ metadata: undefined }))).toBeUndefined()
    expect(questionToolID(makeForm({ metadata: {} }))).toBeUndefined()
    expect(questionToolID(makeForm({ metadata: { tool: null } }))).toBeUndefined()
    expect(questionToolID(makeForm({ metadata: { tool: { id: 5 } } }))).toBeUndefined()
  })
})

describe("sidepanel/ToolCard: readQuestions", () => {
  it("tolera entradas inválidas", () => {
    expect(readQuestions(undefined)).toEqual([])
    expect(readQuestions({})).toEqual([])
    expect(readQuestions({ questions: "x" })).toEqual([])
  })

  it("normaliza perguntas e opções", () => {
    expect(
      readQuestions({
        questions: [
          null,
          "texto",
          { question: "solto" },
          {
            header: "H",
            question: "q",
            multiple: true,
            options: [null, "x", { description: "sem rótulo" }, { label: "L", description: "D" }],
          },
        ],
      }),
    ).toEqual([
      { question: "solto", multiple: false, options: [] },
      { header: "H", question: "q", multiple: true, options: [{ label: "L", description: "D" }] },
    ])
  })
})

describe("sidepanel/ToolCard: pergunta do agente", () => {
  it("mostra as opções clicáveis e envia a resposta", async () => {
    const form = makeForm()
    const onFormSubmit = vi.fn()
    const user = userEvent.setup()
    render(
      <ToolCard
        tool={{ id: "t1", name: "question", status: "running", input: QUESTION_INPUT }}
        forms={[form]}
        onFormSubmit={onFormSubmit}
      />,
    )

    expect(screen.getByText("Pergunta")).toBeInTheDocument()
    expect(screen.getByText("aguardando")).toBeInTheDocument()
    expect(screen.getByText("Escopo da limpeza")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: /Sim/ }))
    await user.click(screen.getByRole("button", { name: /Responder/ }))
    expect(onFormSubmit).toHaveBeenCalledWith(form, { q0: "Sim" })
  })

  it("desabilita o formulário enquanto a resposta é enviada", () => {
    const form = makeForm()
    render(
      <ToolCard
        tool={{ id: "t1", name: "question", status: "running", input: QUESTION_INPUT }}
        forms={[form]}
        busyFormID="frm_1"
        onFormSubmit={vi.fn()}
      />,
    )
    expect(screen.getByRole("button", { name: /Responder/ })).toBeDisabled()
  })

  it("oferece cancelar quando há callback", async () => {
    const form = makeForm()
    const onFormCancel = vi.fn()
    const user = userEvent.setup()
    render(
      <ToolCard
        tool={{ id: "t1", name: "question", status: "running", input: QUESTION_INPUT }}
        forms={[form]}
        onFormSubmit={vi.fn()}
        onFormCancel={onFormCancel}
      />,
    )
    await user.click(screen.getByRole("button", { name: /Cancelar/ }))
    expect(onFormCancel).toHaveBeenCalledWith(form)
  })

  it("lista a pergunta em texto enquanto o form não chegou", () => {
    const { container } = render(
      <ToolCard tool={{ id: "t9", name: "question", status: "running", input: QUESTION_INPUT }} />,
    )
    expect(screen.getByText("rodando")).toBeInTheDocument()
    expect(screen.getByText("Escopo")).toBeInTheDocument()
    expect(screen.getByText("Apagar tudo?")).toBeInTheDocument()
    expect(container.querySelector(".form-card")).toBeNull()
  })

  it("mostra o resultado depois de respondida", () => {
    const { container } = render(
      <ToolCard
        tool={{ id: "t1", name: "question", status: "ok", input: QUESTION_INPUT, output: "Resposta: Sim" }}
      />,
    )
    expect(screen.getByText("ok")).toBeInTheDocument()
    expect(screen.getByText("Resposta: Sim")).toBeInTheDocument()
    expect(container.querySelector(".form-card")).toBeNull()
    expect(screen.queryByText("Parâmetros")).not.toBeInTheDocument()
  })

  it("prioriza o form pendente mesmo com o card já marcado como ok", () => {
    const form = makeForm()
    const onFormSubmit = vi.fn()
    render(
      <ToolCard
        tool={{ id: "t1", name: "question", status: "ok", input: QUESTION_INPUT, output: "antigo" }}
        forms={[form]}
        onFormSubmit={onFormSubmit}
      />,
    )
    expect(screen.getByText("aguardando")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Responder/ })).toBeInTheDocument()
    expect(screen.queryByText("antigo")).not.toBeInTheDocument()
  })

  it("reinicia o rascunho quando o form muda de id", async () => {
    const user = userEvent.setup()
    const simpleForm = (id: string) =>
      makeForm({ id, fields: [{ key: "q0", type: "string", placeholder: "resposta" }] })
    const { rerender } = render(
      <ToolCard
        tool={{ id: "t1", name: "question", status: "running", input: QUESTION_INPUT }}
        forms={[simpleForm("frm_1")]}
        onFormSubmit={vi.fn()}
      />,
    )

    await user.type(screen.getByPlaceholderText("resposta"), "texto antigo")
    expect(screen.getByPlaceholderText("resposta")).toHaveValue("texto antigo")

    rerender(
      <ToolCard
        tool={{ id: "t1", name: "question", status: "running", input: QUESTION_INPUT }}
        forms={[simpleForm("frm_2")]}
        onFormSubmit={vi.fn()}
      />,
    )
    expect(screen.getByPlaceholderText("resposta")).toHaveValue("")
  })
})
