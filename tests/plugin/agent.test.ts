import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { ensureAgentFile } from "../../plugin/browser-relay"

let base: string | null = null

function tempDir(): string {
  base = mkdtempSync(join(tmpdir(), "opencode-browser-agent-"))
  return base
}

afterEach(() => {
  if (base) rmSync(base, { recursive: true, force: true })
  base = null
})

describe("plugin: agente do navegador", () => {
  it("grava o agente no .opencode/agents do diretório informado", () => {
    const directory = tempDir()

    const path = ensureAgentFile(directory)

    expect(path).toBe(
      join(directory, ".opencode", "agents", "opencode-browser.md"),
    )
    const content = readFileSync(path, "utf8")
    expect(content.startsWith("---\n")).toBe(true)
    expect(content).toContain("mode: primary")
    expect(content).toContain('"*": deny')
    expect(content).toContain('"browser_*": allow')
    expect(content).toContain("browser_tabs_context")
  })

  it("é idempotente e reescreve quando o conteúdo muda", () => {
    const directory = tempDir()
    const path = ensureAgentFile(directory)

    expect(ensureAgentFile(directory)).toBe(path)
    const first = readFileSync(path, "utf8")

    expect(ensureAgentFile(directory)).toBe(path)
    expect(readFileSync(path, "utf8")).toBe(first)
  })

  it("cria a pasta quando ela ainda não existe", () => {
    const directory = join(tempDir(), "sub", "pasta")

    const path = ensureAgentFile(directory)

    expect(readFileSync(path, "utf8")).toContain("opencode-browser-agent")
  })
})
