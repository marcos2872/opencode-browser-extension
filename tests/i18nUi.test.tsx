import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import App from "../src/options/App"
import { Onboarding } from "../src/sidepanel/Onboarding"
import type { AppSnapshot, ConnectionState } from "../src/shared/types"
import { makeAgent, makeModel } from "./helpers/factories"

const CONNECTION_ONLINE: ConnectionState = {
  phase: "online",
  failure: null,
  detail: null,
  attempts: 0,
  lastOnlineAt: null,
  offlineSince: null,
}

function snapshot(): AppSnapshot {
  return {
    config: {
      baseUrl: "http://127.0.0.1:49374",
      token: "abcdef123456",
      permissionMode: "ask",
    },
    models: [makeModel()],
    sessions: [],
    activeSessionID: null,
    messages: [],
    relay: { connected: true, url: "ws://127.0.0.1:8799" },
    busy: false,
    connection: CONNECTION_ONLINE,
    defaultModel: null,
    agents: [makeAgent()],
    commands: [],
    statusMessage: null,
  }
}

/**
 * O idioma é o único estado de UI que atravessa o app inteiro; estes testes
 * garantem que a troca manual em Configurações chega até as telas.
 */
describe("i18n na interface", () => {
  it("as configurações trocam o idioma e gravam a preferência", async () => {
    chrome.runtime.sendMessage.mockImplementation(async (message: { type: string }) => {
      if (message.type === "state:get") return { ok: true, snapshot: snapshot() }
      return { ok: true }
    })
    chrome.i18n.getUILanguage.mockReturnValue("pt-BR")
    const user = userEvent.setup()
    render(<App />)

    // Começa em português (idioma do navegador).
    await screen.findByRole("heading", { name: "Idioma" })
    const select = screen.getByLabelText("Idioma da interface")
    expect(select).toHaveValue("auto")

    await user.selectOptions(select, "en")

    // A tela inteira re-renderiza no idioma novo...
    await screen.findByRole("heading", { name: "Language" })
    expect(screen.getByLabelText("Interface language")).toHaveValue("en")
    expect(screen.getByRole("button", { name: "Open panel" })).toBeInTheDocument()
    // ...e a preferência fica salva para os outros contextos.
    await waitFor(async () => {
      expect(await chrome.storage.local.get("ui.locale")).toEqual({ "ui.locale": "en" })
    })
    expect(screen.queryByRole("heading", { name: "Idioma" })).not.toBeInTheDocument()
  })

  it("a preferência salva em inglês abre as configurações em inglês", async () => {
    await chrome.storage.local.set({ "ui.locale": "en" })
    chrome.i18n.getUILanguage.mockReturnValue("pt-BR")
    chrome.runtime.sendMessage.mockImplementation(async (message: { type: string }) => {
      if (message.type === "state:get") return { ok: true, snapshot: snapshot() }
      return { ok: true }
    })

    render(<App />)

    await screen.findByRole("heading", { name: "Language" })
    expect(screen.getByLabelText("Interface language")).toHaveValue("en")
  })

  it("o onboarding segue o idioma escolhido", async () => {
    await chrome.storage.local.set({ "ui.locale": "en" })
    chrome.i18n.getUILanguage.mockReturnValue("pt-BR")
    const runtime = await import("../src/shared/i18n/runtime")
    await runtime.loadLocale()
    render(
      <Onboarding
        relay={{ connected: false, url: "ws://127.0.0.1:8799" }}
        busy={false}
        onPair={async () => undefined}
        onReconnect={() => undefined}
      />,
    )

    expect(
      screen.getByRole("heading", {
        name: "Connect your browser to the OpenCode on your machine",
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Connect to OpenCode" })).toBeInTheDocument()
  })
})
