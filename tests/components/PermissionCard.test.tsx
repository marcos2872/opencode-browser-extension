import { fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { PermissionCard } from "../../src/components/PermissionCard"
import type { PermissionRequest } from "../../src/shared/types"

function makeRequest(partial: Partial<PermissionRequest> = {}): PermissionRequest {
  return {
    id: "req_1",
    kind: "action",
    tool: "navigate",
    title: "Navegar para example.com",
    host: "example.com",
    ...partial,
  }
}

describe("components/PermissionCard", () => {
  it("renderiza título, host, detalhe e rótulo amigável do tool", () => {
    render(
      <PermissionCard
        request={makeRequest({ detail: "Abrir a página inicial" })}
        onDecision={vi.fn()}
      />,
    )

    const dialog = screen.getByRole("dialog", { name: "Pedido de permissão" })
    expect(dialog).toHaveAttribute("aria-modal", "true")
    expect(screen.getByRole("heading", { name: "Navegar para example.com" })).toBeInTheDocument()
    expect(screen.getByText("example.com")).toBeInTheDocument()
    expect(screen.getByText("Abrir a página inicial")).toBeInTheDocument()
    expect(screen.getByText("Navegação · pedido de permissão")).toBeInTheDocument()
  })

  it("usa o nome cru do tool quando não há rótulo conhecido", () => {
    render(<PermissionCard request={makeRequest({ tool: "custom_tool" })} onDecision={vi.fn()} />)
    expect(screen.getByText("custom_tool · pedido de permissão")).toBeInTheDocument()
  })

  it("não renderiza host nem detalhe quando ausentes", () => {
    render(<PermissionCard request={makeRequest({ host: undefined, detail: undefined })} onDecision={vi.fn()} />)
    expect(screen.queryByText("example.com")).not.toBeInTheDocument()
  })

  it("decide permitir uma vez", async () => {
    const onDecision = vi.fn()
    const user = userEvent.setup()
    render(<PermissionCard request={makeRequest()} onDecision={onDecision} />)

    await user.click(screen.getByRole("button", { name: /Permitir uma vez/ }))
    expect(onDecision).toHaveBeenCalledWith({ allowed: true, scope: "once" })
  })

  it("decide permitir nesta sessão", async () => {
    const onDecision = vi.fn()
    const user = userEvent.setup()
    render(<PermissionCard request={makeRequest()} onDecision={onDecision} />)

    await user.click(screen.getByRole("button", { name: "Permitir nesta sessão" }))
    expect(onDecision).toHaveBeenCalledWith({ allowed: true, scope: "site" })
  })

  it("decide permitir sempre para o host", async () => {
    const onDecision = vi.fn()
    const user = userEvent.setup()
    render(<PermissionCard request={makeRequest()} onDecision={onDecision} />)

    await user.click(screen.getByRole("button", { name: "Permitir sempre para example.com" }))
    expect(onDecision).toHaveBeenCalledWith({ allowed: true, scope: "always" })
  })

  it("usa 'este site' quando o pedido não tem host", async () => {
    const onDecision = vi.fn()
    const user = userEvent.setup()
    render(<PermissionCard request={makeRequest({ host: undefined })} onDecision={onDecision} />)

    await user.click(screen.getByRole("button", { name: "Permitir sempre para este site" }))
    expect(onDecision).toHaveBeenCalledWith({ allowed: true, scope: "always" })
  })

  it("decide negar", async () => {
    const onDecision = vi.fn()
    const user = userEvent.setup()
    render(<PermissionCard request={makeRequest()} onDecision={onDecision} />)

    await user.click(screen.getByRole("button", { name: /Negar/ }))
    expect(onDecision).toHaveBeenCalledWith({ allowed: false })
  })

  it("Enter decide permitir uma vez", async () => {
    const onDecision = vi.fn()
    const user = userEvent.setup()
    render(<PermissionCard request={makeRequest()} onDecision={onDecision} />)

    await user.keyboard("{Enter}")
    expect(onDecision).toHaveBeenCalledWith({ allowed: true, scope: "once" })
  })

  it("Escape decide negar", async () => {
    const onDecision = vi.fn()
    const user = userEvent.setup()
    render(<PermissionCard request={makeRequest()} onDecision={onDecision} />)

    await user.keyboard("{Escape}")
    expect(onDecision).toHaveBeenCalledWith({ allowed: false })
  })

  it("Enter com foco em um botão não dispara decisão pelo teclado", () => {
    const onDecision = vi.fn()
    render(<PermissionCard request={makeRequest()} onDecision={onDecision} />)

    const button = screen.getByRole("button", { name: /Permitir uma vez/ })
    button.focus()
    fireEvent.keyDown(button, { key: "Enter" })
    expect(onDecision).not.toHaveBeenCalled()
  })

  it("remove o listener de teclado ao desmontar", async () => {
    const onDecision = vi.fn()
    const user = userEvent.setup()
    const { unmount } = render(<PermissionCard request={makeRequest()} onDecision={onDecision} />)

    unmount()
    await user.keyboard("{Enter}")
    expect(onDecision).not.toHaveBeenCalled()
  })

  it("mostra chips de domínios e passos no plano", async () => {
    const onDecision = vi.fn()
    const user = userEvent.setup()
    const { container } = render(
      <PermissionCard
        request={makeRequest({
          kind: "plan",
          tool: "update_plan",
          title: "Plano de navegação",
          detail: "detalhe que não deve aparecer",
          plan: { domains: ["a.com", "b.com"], approach: ["passo um", "passo dois"] },
        })}
        onDecision={onDecision}
      />,
    )

    expect(screen.getByText("O agente quer visitar estes domínios antes de continuar.")).toBeInTheDocument()
    expect(container.querySelectorAll(".chip")).toHaveLength(2)
    expect(screen.getByText("a.com")).toBeInTheDocument()
    expect(screen.getByText("b.com")).toBeInTheDocument()
    expect(container.querySelectorAll(".plan-list li")).toHaveLength(2)
    expect(screen.getByText("passo um")).toBeInTheDocument()
    expect(screen.getByText("passo dois")).toBeInTheDocument()
    expect(screen.queryByText("detalhe que não deve aparecer")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Permitir uma vez/ })).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: /Aprovar plano/ }))
    expect(onDecision).toHaveBeenCalledWith({ allowed: true, scope: "site" })

    await user.click(screen.getByRole("button", { name: /Recusar/ }))
    expect(onDecision).toHaveBeenCalledWith({ allowed: false })
  })

  it("mostra a mudança de domínio com decisões específicas", async () => {
    const onDecision = vi.fn()
    const user = userEvent.setup()
    render(
      <PermissionCard
        request={makeRequest({
          kind: "domain",
          title: "Mudança de domínio",
          fromDomain: "a.com",
          toDomain: "b.com",
        })}
        onDecision={onDecision}
      />,
    )

    expect(screen.getByText("O agente quer mudar de domínio. Isso muda o que ele pode acessar.")).toBeInTheDocument()
    expect(screen.getByText("a.com → b.com")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Aprovar plano/ })).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Permitir" }))
    expect(onDecision).toHaveBeenCalledWith({ allowed: true, scope: "site" })

    await user.click(screen.getByRole("button", { name: "Permitir sempre para b.com" }))
    expect(onDecision).toHaveBeenCalledWith({ allowed: true, scope: "always" })
  })

  it("renderiza screenshot e preview de texto", () => {
    const { container } = render(
      <PermissionCard
        request={makeRequest({ screenshot: "QUJD", text: "texto da ação" })}
        onDecision={vi.fn()}
      />,
    )

    const image = container.querySelector("img")
    expect(image).toHaveAttribute("src", "data:image/png;base64,QUJD")
    expect(image).toHaveAttribute("alt", "Prévia da ação")
    expect(container.querySelector(".permission-preview")).toHaveTextContent("texto da ação")
  })

  it("não renderiza screenshot nem preview quando ausentes", () => {
    const { container } = render(<PermissionCard request={makeRequest()} onDecision={vi.fn()} />)
    expect(container.querySelector("img")).toBeNull()
    expect(container.querySelector(".permission-preview")).toBeNull()
  })

  it("aponta para as configurações e para as regras de segurança", () => {
    render(<PermissionCard request={makeRequest()} onDecision={vi.fn()} />)
    expect(screen.getByText(/revogar permissões em Configurações/)).toBeInTheDocument()
    expect(screen.getByText(/nunca deve comprar, criar contas ou burlar captchas/)).toBeInTheDocument()
  })
})
