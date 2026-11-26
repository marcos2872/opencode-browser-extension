import { execFileSync } from "node:child_process"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

const script = join(process.cwd(), "scripts", "install-plugin.mjs")
let base: string | null = null

function tempDir(): string {
  base = mkdtempSync(join(tmpdir(), "opencode-browser-install-"))
  return base
}

function runInstaller(configDir: string, home: string): string {
  return execFileSync(process.execPath, [script, "--config-dir", configDir], {
    encoding: "utf8",
    env: {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      XDG_DATA_HOME: join(home, ".local", "share"),
    },
  })
}

afterEach(() => {
  if (base) rmSync(base, { recursive: true, force: true })
  base = null
})

describe("install-plugin", () => {
  it("instala relay, agente e skill no config solicitado", () => {
    const root = tempDir()
    const home = join(root, "home")
    const configDir = join(root, "config")
    const plugins = join(configDir, "plugins")
    const skill = join(configDir, "skills", "browser-relay", "SKILL.md")
    mkdirSync(plugins, { recursive: true })
    writeFileSync(join(plugins, "opencode-browser.ts"), "legacy", "utf8")

    const output = runInstaller(configDir, home)

    expect(existsSync(join(plugins, "browser-relay.ts"))).toBe(true)
    expect(existsSync(join(plugins, "opencode-browser.agent.md"))).toBe(true)
    expect(existsSync(skill)).toBe(true)
    expect(existsSync(join(home, ".opencode-browser-extensions"))).toBe(true)
    expect(existsSync(join(plugins, "opencode-browser.ts"))).toBe(false)
    expect(output).toContain(skill)
  })

  it("preserva skill sem marcador editada pelo usuário", () => {
    const root = tempDir()
    const home = join(root, "home")
    const configDir = join(root, "config")
    const skill = join(configDir, "skills", "browser-relay", "SKILL.md")
    mkdirSync(join(configDir, "skills", "browser-relay"), { recursive: true })
    writeFileSync(skill, "# Skill personalizada\n", "utf8")

    runInstaller(configDir, home)

    expect(readFileSync(skill, "utf8")).toBe("# Skill personalizada\n")
  })

  it("atualiza uma skill gerenciada antiga e guarda backup", () => {
    const root = tempDir()
    const home = join(root, "home")
    const configDir = join(root, "config")
    const skill = join(configDir, "skills", "browser-relay", "SKILL.md")
    const old = "---\nname: browser-relay\n---\n\n<!-- opencode-browser-skill v0 -->\n\nold\n"
    mkdirSync(join(configDir, "skills", "browser-relay"), { recursive: true })
    writeFileSync(skill, old, "utf8")

    runInstaller(configDir, home)

    expect(readFileSync(skill, "utf8")).toContain("opencode-browser-skill v2")
    expect(readFileSync(`${skill}.bak-v0`, "utf8")).toBe(old)
  })
})
