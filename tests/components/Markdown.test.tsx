import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Markdown } from "../../src/components/Markdown"

describe("components/Markdown", () => {
  it("renderiza parágrafos e negrito", () => {
    const { container } = render(<Markdown text={"Um **forte** parágrafo.\n\nSegundo parágrafo."} />)

    const body = container.querySelector(".msg-body")
    expect(body).not.toBeNull()
    expect(container.querySelectorAll("p")).toHaveLength(2)
    expect(container.querySelector("strong")).toHaveTextContent("forte")
    expect(screen.getByText(/Segundo parágrafo/)).toBeInTheDocument()
  })

  it("renderiza listas com itens", () => {
    const { container } = render(<Markdown text={"- alfa\n- beta\n\n1. um\n2. dois"} />)

    expect(container.querySelectorAll("ul li")).toHaveLength(2)
    expect(container.querySelectorAll("ol li")).toHaveLength(2)
    expect(screen.getByText("alfa")).toBeInTheDocument()
    expect(screen.getByText("dois")).toBeInTheDocument()
  })

  it("renderiza código inline", () => {
    const { container } = render(<Markdown text={"Use `npm test` agora."} />)

    const code = container.querySelector("p code")
    expect(code).toHaveTextContent("npm test")
  })

  it("renderiza bloco de código", () => {
    const { container } = render(<Markdown text={"```ts\nconst a = 1\n```"} />)

    const pre = container.querySelector("pre")
    expect(pre).not.toBeNull()
    expect(pre?.querySelector("code")).toHaveTextContent("const a = 1")
  })

  it("renderiza tabela GFM", () => {
    render(<Markdown text={"| nome | valor |\n| --- | --- |\n| alfa | 1 |\n| beta | 2 |"} />)

    const table = screen.getByRole("table")
    expect(within(table).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["nome", "valor"])
    expect(within(table).getAllByRole("cell")).toHaveLength(4)
    expect(within(table).getByText("beta")).toBeInTheDocument()
  })

  it("abre links em nova aba sem referrer", () => {
    render(<Markdown text={"Veja o [site oficial](https://example.com/docs)."} />)

    const link = screen.getByRole("link", { name: "site oficial" })
    expect(link).toHaveAttribute("href", "https://example.com/docs")
    expect(link).toHaveAttribute("target", "_blank")
    expect(link).toHaveAttribute("rel", "noreferrer")
  })

  it("renderiza citações e texto simples", () => {
    const { container } = render(<Markdown text={"> cuidado com isto"} />)
    expect(container.querySelector("blockquote")).toHaveTextContent("cuidado com isto")
  })

  it("lida com texto vazio", () => {
    const { container } = render(<Markdown text="" />)
    expect(container.querySelector(".msg-body")).toBeEmptyDOMElement()
  })
})
