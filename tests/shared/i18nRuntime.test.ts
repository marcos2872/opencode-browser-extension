import { describe, expect, it, vi } from "vitest"
import { chromeMock } from "../setup"
import { getLocalePreference, setLocalePreference } from "../../src/shared/storage"
import {
  applyLocalePreference,
  browserLanguage,
  currentLocale,
  loadLocale,
  setLocale,
  subscribeLocale,
  t,
  watchLocalePreference,
} from "../../src/shared/i18n/runtime"

describe("i18n em tempo de execução", () => {
  it("lê o idioma da interface do navegador", () => {
    chrome.i18n.getUILanguage.mockReturnValue("pt-BR")
    expect(browserLanguage()).toBe("pt-BR")
    chrome.i18n.getUILanguage.mockReturnValue("en-US")
    // `browserLanguage` devolve a tag crua; a normalização é do `effectiveLocale`.
    expect(browserLanguage()).toBe("en-US")
  })

  it("cai em `navigator.language` quando chrome.i18n falha", () => {
    chrome.i18n.getUILanguage.mockImplementation(() => {
      throw new Error("sem i18n")
    })
    expect(browserLanguage()).toBe(navigator.language)
  })

  it("resolve `auto` pelo idioma do navegador", async () => {
    chrome.i18n.getUILanguage.mockReturnValue("en-US")

    await expect(loadLocale()).resolves.toBe("en")
    expect(currentLocale()).toBe("en")
    expect(t("app.retry")).toBe("Try again")
  })

  it("a preferência salva vence o navegador", async () => {
    chrome.i18n.getUILanguage.mockReturnValue("en-US")
    await setLocalePreference("pt-BR")

    await expect(loadLocale()).resolves.toBe("pt-BR")
    expect(t("app.retry")).toBe("Tentar novamente")
    expect(await getLocalePreference()).toBe("pt-BR")
  })

  it("ignora preferência inválida no armazenamento", async () => {
    await chrome.storage.local.set({ "ui.locale": "klingon" })
    chrome.i18n.getUILanguage.mockReturnValue("pt-BR")

    expect(await getLocalePreference()).toBeNull()
    await expect(loadLocale()).resolves.toBe("pt-BR")
  })

  it("aplica a preferência, grava e avisa os assinantes", async () => {
    chrome.i18n.getUILanguage.mockReturnValue("pt-BR")
    setLocale("pt-BR")
    const listener = vi.fn()
    const unsubscribe = subscribeLocale(listener)

    await expect(applyLocalePreference("en")).resolves.toBe("en")
    // Gravar a preferência também dispara o listener de `chrome.storage`, que
    // reaplica o mesmo locale — o segundo aviso é inofensivo (sem mudança).
    expect(listener).toHaveBeenCalled()
    expect(t("app.retry")).toBe("Try again")
    expect(await getLocalePreference()).toBe("en")

    unsubscribe()
    const count = listener.mock.calls.length

    // Depois de descadastrar, o store não avisa mais aquele componente.
    await applyLocalePreference("pt-BR")
    expect(listener).toHaveBeenCalledTimes(count)
  })

  it("acompanha a mudança de idioma feita em outro contexto", async () => {
    setLocale("pt-BR")
    watchLocalePreference()

    chromeMock.__state.emitStorageChanged({ "ui.locale": { newValue: "en" } }, "local")
    expect(currentLocale()).toBe("en")

    chromeMock.__state.emitStorageChanged({ "ui.locale": { newValue: "auto" } }, "local")
    chrome.i18n.getUILanguage.mockReturnValue("pt-BR")
    chromeMock.__state.emitStorageChanged({ "ui.locale": { newValue: undefined } }, "local")
    expect(currentLocale()).toBe("pt-BR")
  })

  it("ignora mudanças de outras áreas de armazenamento", () => {
    setLocale("pt-BR")
    watchLocalePreference()

    chromeMock.__state.emitStorageChanged({ "ui.locale": { newValue: "en" } }, "session")
    expect(currentLocale()).toBe("pt-BR")
  })
})
