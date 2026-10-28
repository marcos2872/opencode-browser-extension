import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { captureDir, saveImages } from "../../plugin/browser-relay"

// PNG de 1×1: serve para conferir que os bytes chegam intactos ao arquivo.
const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

let base: string | null = null
const original = process.env.XDG_CACHE_HOME

function tempDir(): string {
  base = mkdtempSync(join(tmpdir(), "opencode-browser-capturas-"))
  process.env.XDG_CACHE_HOME = base
  return base
}

afterEach(() => {
  if (base) rmSync(base, { recursive: true, force: true })
  base = null
  if (original === undefined) delete process.env.XDG_CACHE_HOME
  else process.env.XDG_CACHE_HOME = original
})

describe("plugin: capturas em disco", () => {
  it("grava cada imagem em PNG/JPEG e devolve os caminhos", () => {
    const directory = tempDir()

    const caminhos = saveImages([
      { name: "tela", mime: "image/png", data: PNG },
      { name: "tela", mime: "image/jpeg", data: PNG },
    ])

    expect(caminhos).toHaveLength(2)
    expect(caminhos[0]).toMatch(/captura-\d{8}-\d{6}-1\.png$/)
    expect(caminhos[1]).toMatch(/captura-\d{8}-\d{6}-2\.jpg$/)
    for (const caminho of caminhos) {
      expect(caminho.startsWith(captureDir())).toBe(true)
      expect(existsSync(caminho)).toBe(true)
      expect(readFileSync(caminho)).toEqual(Buffer.from(PNG, "base64"))
      expect(statSync(caminho).mode & 0o777).toBe(0o600)
    }
    expect(captureDir()).toBe(join(directory, "opencode-browser", "capturas"))
  })

  it("não escreve nada quando a resposta não tem imagem", () => {
    const directory = tempDir()

    expect(saveImages([])).toEqual([])
    expect(existsSync(join(directory, "opencode-browser"))).toBe(false)
  })
})
