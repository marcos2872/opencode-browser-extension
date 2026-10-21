import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { ToolCard } from "../../src/sidepanel/ToolCard"
import type { ToolCallView } from "../../src/shared/types"

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
