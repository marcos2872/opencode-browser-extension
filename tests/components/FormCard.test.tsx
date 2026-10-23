import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { FormCard, buildFormAnswer } from "../../src/components/FormCard"
import type { FormField } from "../../src/shared/types"
import { makeForm } from "../helpers/factories"

describe("components/FormCard", () => {
  it("responde uma pergunta de escolha única com o rótulo escolhido", async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(<FormCard form={makeForm()} onSubmit={onSubmit} />)

    expect(screen.getByText("Escopo da limpeza")).toBeInTheDocument()
    expect(screen.getByText("Apagar tudo da caixa de entrada?")).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: /Sim/ }))
    await user.click(screen.getByRole("button", { name: /Responder/ }))

    expect(onSubmit).toHaveBeenCalledWith({ q0: "Sim" })
  })

  it("aceita uma resposta escrita (campo custom)", async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(<FormCard form={makeForm()} onSubmit={onSubmit} />)

    await user.type(screen.getByPlaceholderText("Outra resposta"), "Só o spam")
    await user.click(screen.getByRole("button", { name: /Responder/ }))

    expect(onSubmit).toHaveBeenCalledWith({ q0: "Só o spam" })
  })

  it("deseleciona a opção ao digitar um texto custom", async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(<FormCard form={makeForm()} onSubmit={onSubmit} />)

    await user.click(screen.getByRole("button", { name: /Sim/ }))
    await user.type(screen.getByPlaceholderText("Outra resposta"), "Outro")
    await user.click(screen.getByRole("button", { name: /Responder/ }))

    expect(onSubmit).toHaveBeenCalledWith({ q0: "Outro" })
  })

  it("permite escolher várias opções (multiselect) e somar um texto custom", async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(
      <FormCard
        form={makeForm({
          fields: [
            {
              key: "q0",
              type: "multiselect",
              title: "Caixas",
              options: [
                { value: "Spam", label: "Spam" },
                { value: "Lixeira", label: "Lixeira" },
              ],
              custom: true,
            },
          ],
        })}
        onSubmit={onSubmit}
      />,
    )

    await user.click(screen.getByRole("button", { name: /Spam/ }))
    await user.click(screen.getByRole("button", { name: /Lixeira/ }))
    await user.click(screen.getByRole("button", { name: /Spam/ }))
    await user.type(screen.getByPlaceholderText("Outra resposta"), "Arquivados")
    await user.click(screen.getByRole("button", { name: /Responder/ }))

    expect(onSubmit).toHaveBeenCalledWith({ q0: ["Lixeira", "Arquivados"] })
  })

  it("renderiza campo booleano e string simples", async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(
      <FormCard
        form={makeForm({
          fields: [
            { key: "confirma", type: "boolean", title: "Confirmar", required: true },
            { key: "nome", type: "string", placeholder: "Seu nome", required: true },
          ],
        })}
        onSubmit={onSubmit}
      />,
    )

    const submit = screen.getByRole("button", { name: /Responder/ })
    // O obrigatório que bloqueia é o texto; booleano aceita "não".
    expect(submit).toBeDisabled()
    await user.type(screen.getByPlaceholderText("Seu nome"), "Marcos")
    expect(submit).toBeEnabled()
    await user.click(submit)

    expect(onSubmit).toHaveBeenCalledWith({ confirma: false, nome: "Marcos" })
  })

  it("marca um campo booleano como verdadeiro", async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(
      <FormCard
        form={makeForm({ fields: [{ key: "ok", type: "boolean", title: "Aceito" }] })}
        onSubmit={onSubmit}
      />,
    )

    await user.click(screen.getByRole("checkbox"))
    await user.click(screen.getByRole("button", { name: /Responder/ }))
    expect(onSubmit).toHaveBeenCalledWith({ ok: true })
  })

  it("converte campos numéricos e inteiros", async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(
      <FormCard
        form={makeForm({
          fields: [
            { key: "peso", type: "number" },
            { key: "idade", type: "integer" },
          ],
        })}
        onSubmit={onSubmit}
      />,
    )

    const inputs = screen.getAllByRole("spinbutton")
    await user.type(inputs[0], "1.5")
    await user.type(inputs[1], "42")
    await user.click(screen.getByRole("button", { name: /Responder/ }))

    expect(onSubmit).toHaveBeenCalledWith({ peso: 1.5, idade: 42 })
  })

  it("mostra links de campo externo sem incluí-los na resposta", async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(
      <FormCard
        form={makeForm({
          fields: [
            { key: "externo", type: "external", url: "https://example.com/oauth", title: "Autorizar" },
          ],
        })}
        onSubmit={onSubmit}
      />,
    )

    expect(screen.getByRole("link", { name: "https://example.com/oauth" })).toHaveAttribute(
      "href",
      "https://example.com/oauth",
    )

    await user.click(screen.getByRole("button", { name: /Responder/ }))
    expect(onSubmit).toHaveBeenCalledWith({})
  })

  it("ignora campos ocultos e não renderiza nada sem campos", () => {
    const { container } = render(
      <FormCard
        form={makeForm({
          fields: [{ key: "oculto", type: "string", hidden: true }],
        })}
        onSubmit={vi.fn()}
      />,
    )
    expect(container.querySelector(".form-card")).toBeNull()

    const empty = render(<FormCard form={makeForm({ fields: [] })} onSubmit={vi.fn()} />)
    expect(empty.container.firstChild).toBeNull()
  })

  it("bloqueia o envio enquanto um campo obrigatório estiver vazio", async () => {
    const user = userEvent.setup()
    render(
      <FormCard
        form={makeForm({
          fields: [
            {
              key: "q0",
              type: "string",
              title: "Nome",
              required: true,
              options: [{ value: "A", label: "A" }],
            },
          ],
        })}
        onSubmit={vi.fn()}
      />,
    )

    const submit = screen.getByRole("button", { name: /Responder/ })
    expect(submit).toBeDisabled()

    await user.click(screen.getByRole("button", { name: "A" }))
    expect(submit).toBeEnabled()
  })

  it("desabilita os controles enquanto envia", () => {
    render(<FormCard form={makeForm()} busy onSubmit={vi.fn()} onCancel={vi.fn()} />)

    expect(screen.getByRole("button", { name: /Responder/ })).toBeDisabled()
    expect(screen.getByRole("button", { name: /Cancelar/ })).toBeDisabled()
  })

  it("chama onCancel ao cancelar", async () => {
    const onCancel = vi.fn()
    const user = userEvent.setup()
    render(<FormCard form={makeForm()} onSubmit={vi.fn()} onCancel={onCancel} />)

    await user.click(screen.getByRole("button", { name: /Cancelar/ }))
    expect(onCancel).toHaveBeenCalled()
  })

  it("não mostra cancelar sem o callback", () => {
    render(<FormCard form={makeForm()} onSubmit={vi.fn()} />)
    expect(screen.queryByRole("button", { name: /Cancelar/ })).not.toBeInTheDocument()
  })

  it("mostra o título quando não é o genérico 'Questions'", () => {
    render(<FormCard form={makeForm({ title: "Escolha o destino" })} onSubmit={vi.fn()} />)
    expect(screen.getByRole("heading", { name: "Escolha o destino" })).toBeInTheDocument()
  })
})

describe("components/FormCard buildFormAnswer", () => {
  const fields: FormField[] = [
    { key: "q0", type: "string" },
    { key: "q1", type: "multiselect", options: [{ value: "a", label: "A" }] },
    { key: "q2", type: "number" },
    { key: "q3", type: "integer" },
    { key: "q4", type: "boolean" },
  ]

  it("omite valores vazios e inválidos", () => {
    const answer = buildFormAnswer(
      fields,
      { q0: "  ", q1: [], q2: "", q3: "abc", q4: false },
      {},
    )
    expect(answer).toEqual({ q4: false })
  })

  it("trunca inteiros e aceita decimais", () => {
    const answer = buildFormAnswer(fields, { q2: "2.75", q3: "9.9", q4: true }, {})
    expect(answer).toEqual({ q2: 2.75, q3: 9, q4: true })
  })

  it("usa o texto custom como resposta de um campo de escolha", () => {
    const answer = buildFormAnswer(
      [{ key: "q0", type: "string", options: [{ value: "Sim", label: "Sim" }], custom: true }],
      { q0: "" },
      { q0: "depende" },
    )
    expect(answer).toEqual({ q0: "depende" })
  })

  it("prefere o texto custom no multiselect e ignora campos externos", () => {
    const answer = buildFormAnswer(
      [
        { key: "q0", type: "multiselect", options: [{ value: "a", label: "A" }], custom: true },
        { key: "q1", type: "external", url: "https://example.com" },
      ],
      { q0: ["a"], q1: "ignorado" },
      { q0: "outro" },
    )
    expect(answer).toEqual({ q0: ["a", "outro"] })
  })

  it("respeita o valor digitado em campos de texto via fireEvent", () => {
    const onSubmit = vi.fn()
    render(
      <FormCard
        form={makeForm({ fields: [{ key: "q0", type: "string", placeholder: "resposta" }] })}
        onSubmit={onSubmit}
      />,
    )
    fireEvent.change(screen.getByPlaceholderText("resposta"), { target: { value: "manualmente" } })
    fireEvent.click(screen.getByRole("button", { name: /Responder/ }))
    expect(onSubmit).toHaveBeenCalledWith({ q0: "manualmente" })
  })
})
