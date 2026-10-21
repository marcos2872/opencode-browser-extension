import "@testing-library/jest-dom/vitest"
import { afterEach, beforeEach, vi } from "vitest"
import { createChromeMock, type ChromeMock } from "./helpers/chrome"

declare global {
  var chrome: ChromeMock
}

export let chromeMock: ChromeMock

beforeEach(() => {
  chromeMock = createChromeMock()
  vi.stubGlobal("chrome", chromeMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})
