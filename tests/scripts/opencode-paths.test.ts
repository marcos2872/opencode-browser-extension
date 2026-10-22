import path from "node:path"
import { describe, expect, it } from "vitest"
import { pluginsDir, resolveRoots, workspaceDir } from "../../scripts/lib/opencode-paths.mjs"

describe("scripts/opencode-paths", () => {
  it("resolve as raízes XDG padrão a partir do home", () => {
    const roots = resolveRoots({ env: {}, home: "/home/teste", tmp: "/tmp" })

    expect(roots.home).toBe("/home/teste")
    expect(roots.config).toBe(path.join("/home/teste", ".config", "opencode"))
    expect(roots.data).toBe(path.join("/home/teste", ".local", "share", "opencode"))
    expect(roots.cache).toBe(path.join("/home/teste", ".cache", "opencode"))
    expect(roots.state).toBe(path.join("/home/teste", ".local", "state", "opencode"))
    expect(roots.tmp).toBe(path.join("/tmp", "opencode"))
  })

  it("respeita XDG_*_HOME quando definidos", () => {
    const roots = resolveRoots({
      env: {
        XDG_CONFIG_HOME: "/xdg/config",
        XDG_DATA_HOME: "/xdg/data",
        XDG_CACHE_HOME: "/xdg/cache",
        XDG_STATE_HOME: "/xdg/state",
      },
      home: "/home/teste",
      tmp: "/tmp",
    })

    expect(roots.config).toBe(path.join("/xdg/config", "opencode"))
    expect(roots.data).toBe(path.join("/xdg/data", "opencode"))
    expect(roots.cache).toBe(path.join("/xdg/cache", "opencode"))
    expect(roots.state).toBe(path.join("/xdg/state", "opencode"))
  })

  it("usa USERPROFILE quando não há HOME (Windows)", () => {
    const roots = resolveRoots({ env: { USERPROFILE: "C:\\Users\\teste" }, home: undefined, tmp: "C:\\Temp" })

    expect(roots.home).toBe("C:\\Users\\teste")
    expect(roots.config).toBe(path.join("C:\\Users\\teste", ".config", "opencode"))
    expect(workspaceDir(roots)).toBe(path.join("C:\\Users\\teste", ".opencode-browser-extensions"))
  })

  it("ignora XDG vazio ou só com espaços", () => {
    const roots = resolveRoots({ env: { XDG_CONFIG_HOME: "   " }, home: "/home/teste", tmp: "/tmp" })

    expect(roots.config).toBe(path.join("/home/teste", ".config", "opencode"))
  })

  it("monta o diretório de plugins e a pasta de conversas", () => {
    const roots = resolveRoots({ env: {}, home: "/Users/teste", tmp: "/tmp" })

    expect(pluginsDir(roots)).toBe(path.join("/Users/teste", ".config", "opencode", "plugins"))
    expect(workspaceDir(roots)).toBe(path.join("/Users/teste", ".opencode-browser-extensions"))
  })

  it("resolve a partir do ambiente real quando nada é informado", () => {
    const roots = resolveRoots()

    expect(roots.home.length).toBeGreaterThan(0)
    expect(pluginsDir(roots).endsWith(path.join("opencode", "plugins"))).toBe(true)
    expect(workspaceDir(roots).endsWith(".opencode-browser-extensions")).toBe(true)
  })
})
