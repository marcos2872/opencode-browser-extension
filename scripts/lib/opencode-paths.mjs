import os from "node:os"
import path from "node:path"

/**
 * Resolve os diretórios globais do OpenCode.
 *
 * O OpenCode usa raízes XDG em todas as plataformas (Linux, macOS e Windows):
 * `XDG_*_HOME` quando definidos, senão os padrões abaixo do home do usuário.
 */
export function resolveRoots(options = {}) {
  const env = options.env ?? process.env
  const home = options.home ?? env.HOME ?? env.USERPROFILE ?? os.homedir()
  const tmp = options.tmp ?? os.tmpdir()
  const xdg = (name, fallback) => {
    const value = env[name]
    return value && value.trim() !== "" ? value : path.join(home, fallback)
  }
  return {
    home,
    config: path.join(xdg("XDG_CONFIG_HOME", ".config"), "opencode"),
    data: path.join(xdg("XDG_DATA_HOME", path.join(".local", "share")), "opencode"),
    cache: path.join(xdg("XDG_CACHE_HOME", ".cache"), "opencode"),
    state: path.join(xdg("XDG_STATE_HOME", path.join(".local", "state")), "opencode"),
    tmp: path.join(tmp, "opencode"),
  }
}

/** Diretório de plugins globais do OpenCode. */
export function pluginsDir(roots) {
  return path.join(roots.config, "plugins")
}

/** Pasta das conversas criadas pela extensão. */
export function workspaceDir(roots) {
  return path.join(roots.home, ".opencode-browser-extensions")
}
