import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { ModelPicker } from "../../src/sidepanel/ModelPicker"
import type { ModelInfo } from "../../src/shared/types"
import { makeModel } from "../helpers/factories"

const MODELS: ModelInfo[] = [
  makeModel({ id: "model-1", providerID: "provider-1", name: "Model One" }),
  makeModel({ id: "model-2", providerID: "provider-1", name: "Model Two", capabilities: { tools: false } }),
  makeModel({ id: "model-3", providerID: "provider-2", name: "Model Three" }),
]

describe("sidepanel/ModelPicker", () => {
  it("agrupa os modelos por provider", () => {
    const { container } = render(<ModelPicker models={MODELS} value={null} onChange={vi.fn()} />)

    const groups = [...container.querySelectorAll("optgroup")]
    expect(groups.map((group) => group.getAttribute("label"))).toEqual(["provider-1", "provider-2"])
    expect(groups[0].querySelectorAll("option")).toHaveLength(2)
    expect(groups[1].querySelectorAll("option")).toHaveLength(1)
  })

  it("marca modelos sem suporte a tools", () => {
    render(<ModelPicker models={MODELS} value={null} onChange={vi.fn()} />)
    expect(screen.getByRole("option", { name: "Model Two (sem tools)" })).toBeInTheDocument()
    expect(screen.getByRole("option", { name: "Model One" })).toBeInTheDocument()
  })

  it("usa o id quando o modelo não tem nome", () => {
    render(<ModelPicker models={[makeModel({ id: "model-x", name: undefined })]} value={null} onChange={vi.fn()} />)
    expect(screen.getByRole("option", { name: "model-x" })).toBeInTheDocument()
  })

  it("mostra 'Sem modelos' e desabilita o select sem modelos", () => {
    render(<ModelPicker models={[]} value={null} onChange={vi.fn()} />)
    const select = screen.getByTitle("Modelo do OpenCode")
    expect(select).toBeDisabled()
    expect(screen.getByRole("option", { name: "Sem modelos" })).toBeInTheDocument()
  })

  it("reflete o valor selecionado", () => {
    render(<ModelPicker models={MODELS} value={{ id: "model-3", providerID: "provider-2" }} onChange={vi.fn()} />)
    expect(screen.getByTitle("Modelo do OpenCode")).toHaveValue("provider-2/model-3")
  })

  it("muda o valor no formato provider/id", async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<ModelPicker models={MODELS} value={{ id: "model-1", providerID: "provider-1" }} onChange={onChange} />)

    await user.selectOptions(screen.getByTitle("Modelo do OpenCode"), "provider-2/model-3")
    expect(onChange).toHaveBeenCalledWith({ id: "model-3", providerID: "provider-2" })
  })

  it("aceita ids que contêm barra", async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    const models = [makeModel({ id: "a/b", providerID: "provider-1" })]
    render(<ModelPicker models={models} value={null} onChange={onChange} />)

    await user.selectOptions(screen.getByTitle("Modelo do OpenCode"), "provider-1/a/b")
    expect(onChange).toHaveBeenCalledWith({ id: "a/b", providerID: "provider-1" })
  })

  it("seleciona a primeira variante ao trocar para um modelo com variantes", async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    const models = [
      makeModel({ id: "model-1", providerID: "provider-1" }),
      makeModel({
        id: "model-4",
        providerID: "provider-1",
        variants: [{ id: "fast" }, { id: "slow" }],
      }),
    ]
    render(<ModelPicker models={models} value={{ id: "model-1", providerID: "provider-1" }} onChange={onChange} />)

    await user.selectOptions(screen.getByTitle("Modelo do OpenCode"), "provider-1/model-4")
    expect(onChange).toHaveBeenCalledWith({ id: "model-4", providerID: "provider-1", variant: "fast" })
  })

  it("mostra o select de variante quando há mais de uma", async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    const models = [
      makeModel({
        id: "model-1",
        providerID: "provider-1",
        variants: [{ id: "fast" }, { id: "slow" }],
      }),
    ]
    render(<ModelPicker models={models} value={{ id: "model-1", providerID: "provider-1" }} onChange={onChange} />)

    const variants = screen.getByTitle("Variante do modelo")
    expect(variants).toHaveValue("fast")

    await user.selectOptions(variants, "slow")
    expect(onChange).toHaveBeenCalledWith({ id: "model-1", providerID: "provider-1", variant: "slow" })
  })

  it("usa a variante do valor quando definida", () => {
    const models = [
      makeModel({
        id: "model-1",
        providerID: "provider-1",
        variants: [{ id: "fast" }, { id: "slow" }],
      }),
    ]
    render(
      <ModelPicker
        models={models}
        value={{ id: "model-1", providerID: "provider-1", variant: "slow" }}
        onChange={vi.fn()}
      />,
    )
    expect(screen.getByTitle("Variante do modelo")).toHaveValue("slow")
  })

  it("esconde o select de variante com zero ou uma variante", () => {
    const { rerender } = render(<ModelPicker models={MODELS} value={null} onChange={vi.fn()} />)
    expect(screen.queryByTitle("Variante do modelo")).not.toBeInTheDocument()

    const single = [makeModel({ id: "model-1", providerID: "provider-1", variants: [{ id: "fast" }] })]
    rerender(<ModelPicker models={single} value={{ id: "model-1", providerID: "provider-1" }} onChange={vi.fn()} />)
    expect(screen.queryByTitle("Variante do modelo")).not.toBeInTheDocument()
  })

  it("desabilita os selects com a prop disabled", () => {
    const models = [
      makeModel({
        id: "model-1",
        providerID: "provider-1",
        variants: [{ id: "fast" }, { id: "slow" }],
      }),
    ]
    render(
      <ModelPicker
        models={models}
        value={{ id: "model-1", providerID: "provider-1" }}
        disabled
        onChange={vi.fn()}
      />,
    )
    expect(screen.getByTitle("Modelo do OpenCode")).toBeDisabled()
    expect(screen.getByTitle("Variante do modelo")).toBeDisabled()
  })

  it("aplica a classe compact quando compact", () => {
    render(<ModelPicker models={MODELS} value={null} compact onChange={vi.fn()} />)
    expect(screen.getByTitle("Modelo do OpenCode")).toHaveClass("compact")
  })
})
