import "@testing-library/jest-dom/vitest"
import { afterEach, beforeEach, vi } from "vitest"
import { createChromeMock, type ChromeMock } from "./helpers/chrome"
import { setLocale } from "../src/shared/i18n/runtime"

declare global {
  var chrome: ChromeMock
}

export let chromeMock: ChromeMock

beforeEach(() => {
  // O locale é um cache de módulo: sem reset, um teste que troca o idioma
  // vazaria para o próximo. O mock de `chrome.i18n` fala pt-BR, então o padrão
  // aqui reproduz um navegador em português.
  setLocale("pt-BR")
  chromeMock = createChromeMock()
  vi.stubGlobal("chrome", chromeMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/** Mock ativo do Chrome (recriado a cada teste). */
export function getChromeMock(): ChromeMock {
  return chromeMock
}
