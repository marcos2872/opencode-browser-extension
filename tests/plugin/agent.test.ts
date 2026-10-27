import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
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
  it("grava o agente na configuração global do OpenCode", () => {
    const directory = tempDir()

    const path = ensureAgentFile(directory)

    expect(path).toBe(
      join(directory, "opencode", "agents", "opencode-browser.md"),
    )
    const content = readFileSync(path, "utf8")
    expect(content.startsWith("---\n")).toBe(true)
    expect(content).toContain("mode: primary")
    expect(content).toContain("permissions:\n  - action: \"*\"")
    expect(content).toContain('action: "browser_*"')
    expect(content).toContain("browser_tabs_context")
  })

  it("não sobrescreve edições manuais do agente", () => {
    const directory = tempDir()
    const path = ensureAgentFile(directory)
    writeFileSync(path, "---\nmode: primary\n---\n\ncustomizado\n", "utf8")

    expect(ensureAgentFile(directory)).toBe(path)
    expect(readFileSync(path, "utf8")).toBe(
      "---\nmode: primary\n---\n\ncustomizado\n",
    )
  })

  it("atualiza um agente antigo e guarda backup", () => {
    const directory = tempDir()
    const path = ensureAgentFile(directory)
    const antigo =
      "---\nmode: primary\n---\n\n<!-- opencode-browser-agent v1 -->\n\ncustomizado\n"
    writeFileSync(path, antigo, "utf8")

    expect(ensureAgentFile(directory)).toBe(path)

    const atual = readFileSync(path, "utf8")
    expect(atual).toContain("<!-- opencode-browser-agent v4 -->")
    expect(atual).not.toBe(antigo)
    expect(existsSync(`${path}.bak-v1`)).toBe(true)
    expect(readFileSync(`${path}.bak-v1`, "utf8")).toBe(antigo)
  })

  it("preserva um agente já atualizado", () => {
    const directory = tempDir()
    const path = ensureAgentFile(directory)
    const atual = `${readFileSync(path, "utf8")}\n<!-- editado -->\n`
    writeFileSync(path, atual, "utf8")

    expect(ensureAgentFile(directory)).toBe(path)
    expect(readFileSync(path, "utf8")).toBe(atual)
  })

  it("cria a pasta quando ela ainda não existe", () => {
    const directory = join(tempDir(), "sub", "pasta")

    const path = ensureAgentFile(directory)

    expect(readFileSync(path, "utf8")).toContain("opencode-browser-agent")
  })
})
