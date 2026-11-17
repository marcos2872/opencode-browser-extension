import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

function readJson(...parts: string[]): Record<string, unknown> {
  return JSON.parse(readFileSync(path.join(root, ...parts), "utf8"))
}

describe("versões", () => {
  it("o manifest da extensão acompanha a versão do pacote", () => {
    // A v0.1.1 saiu com o manifest em 0.1.0: o Chrome não mostrava a versão nova.
    const pkg = readJson("package.json")
    const manifest = readJson("public", "manifest.json")

    expect(manifest.version).toBe(pkg.version)
  })

  it("o lockfile acompanha a versão do pacote", () => {
    const pkg = readJson("package.json")
    const lock = readJson("package-lock.json") as {
      version?: string
      packages?: Record<string, { version?: string }>
    }

    expect(lock.version).toBe(pkg.version)
    expect(lock.packages?.[""]?.version).toBe(pkg.version)
  })

  it("a versão do manifest é aceita pelo Chrome", () => {
    const manifest = readJson("public", "manifest.json")

    expect(manifest.version).toMatch(/^\d+(\.\d+){0,3}$/)
  })
})
