import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import App from "../../src/permission/App"
import type { PermissionRequest } from "../../src/shared/types"

const URL_REQUEST_ID = "req_url"
const KEY = `permission.request.${URL_REQUEST_ID}`

function makeRequest(partial: Partial<PermissionRequest> = {}): PermissionRequest {
  return {
    id: "req_stored",
    kind: "action",
    tool: "navigate",
    title: "Navegar para example.com",
    host: "example.com",
    ...partial,
  }
}

function setRequestId(id: string) {
  window.history.replaceState({}, "", id ? `/?requestId=${id}` : "/")
}

describe("permission/App", () => {
  beforeEach(() => {
    setRequestId("")
    vi.spyOn(window, "close").mockImplementation(() => {})
  })

  it("mostra 'Pedido indisponível' sem requestId na URL", async () => {
    render(<App />)

    expect(screen.getByRole("heading", { name: "Pedido indisponível" })).toBeInTheDocument()
    expect(screen.getByText(/expirou ou já foi respondido/)).toBeInTheDocument()
  })

  it("fecha a janela pelo botão Fechar", async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole("button", { name: "Fechar" }))
    expect(window.close).toHaveBeenCalledTimes(1)
  })

  it("mostra carregando e depois 'Pedido indisponível' quando não encontra o pedido", async () => {
    setRequestId(URL_REQUEST_ID)
    render(<App />)

    expect(screen.getByText("Carregando pedido...")).toBeInTheDocument()
    expect(await screen.findByText(/expirou ou já foi respondido/)).toBeInTheDocument()
  })

  it("renderiza o card quando o pedido está no storage.session", async () => {
    setRequestId(URL_REQUEST_ID)
    await chrome.storage.session.set({ [KEY]: makeRequest() })
    render(<App />)

    expect(await screen.findByRole("dialog", { name: "Pedido de permissão" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Navegar para example.com" })).toBeInTheDocument()
    expect(screen.queryByText("Pedido indisponível")).not.toBeInTheDocument()
  })

  it("responde a decisão e fecha a janela", async () => {
    setRequestId(URL_REQUEST_ID)
    await chrome.storage.session.set({ [KEY]: makeRequest() })
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole("dialog")

    await user.click(screen.getByRole("button", { name: "Permitir sempre para example.com" }))

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: "permission:respond",
      requestId: "req_stored",
      decision: { allowed: true, scope: "always" },
    })
    await waitFor(() => expect(window.close).toHaveBeenCalledTimes(1))
  })

  it("negar também responde e fecha", async () => {
    setRequestId(URL_REQUEST_ID)
    await chrome.storage.session.set({ [KEY]: makeRequest() })
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole("dialog")

    await user.click(screen.getByRole("button", { name: /Negar/ }))

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: "permission:respond",
      requestId: "req_stored",
      decision: { allowed: false },
    })
    await waitFor(() => expect(window.close).toHaveBeenCalledTimes(1))
  })

  it("decide com Enter pelo teclado", async () => {
    setRequestId(URL_REQUEST_ID)
    await chrome.storage.session.set({ [KEY]: makeRequest() })
    const user = userEvent.setup()
    render(<App />)
    await screen.findByRole("dialog")

    await user.keyboard("{Enter}")

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: "permission:respond",
      requestId: "req_stored",
      decision: { allowed: true, scope: "once" },
    })
  })

  it("fecha a janela quando o storage remove a chave do pedido", async () => {
    setRequestId(URL_REQUEST_ID)
    await chrome.storage.session.set({ [KEY]: makeRequest() })
    render(<App />)
    await screen.findByRole("dialog")

    act(() => {
      chrome.__state.emitStorageChanged({ [KEY]: { oldValue: makeRequest() } }, "session")
    })

    expect(window.close).toHaveBeenCalledTimes(1)
  })

  it("ignora mudanças de outras chaves e de outras áreas", async () => {
    setRequestId(URL_REQUEST_ID)
    await chrome.storage.session.set({ [KEY]: makeRequest() })
    render(<App />)
    await screen.findByRole("dialog")

    act(() => {
      chrome.__state.emitStorageChanged({ [KEY]: { oldValue: makeRequest() } }, "local")
    })
    act(() => {
      chrome.__state.emitStorageChanged({ "permission.request.outro": { oldValue: makeRequest() } }, "session")
    })

    expect(window.close).not.toHaveBeenCalled()
  })

  it("remove o listener do storage ao desmontar", async () => {
    setRequestId(URL_REQUEST_ID)
    await chrome.storage.session.set({ [KEY]: makeRequest() })
    const { unmount } = render(<App />)
    await screen.findByRole("dialog")

    unmount()
    act(() => {
      chrome.__state.emitStorageChanged({ [KEY]: { oldValue: makeRequest() } }, "session")
    })

    expect(window.close).not.toHaveBeenCalled()
  })
})
