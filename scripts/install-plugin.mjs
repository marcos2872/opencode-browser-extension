import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { pluginsDir, resolveRoots, workspaceDir } from "./lib/opencode-paths.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const roots = resolveRoots()
const target = pluginsDir(roots)
const workspace = workspaceDir(roots)

mkdirSync(target, { recursive: true })

const legacy = path.join(target, "opencode-browser.ts")
if (existsSync(legacy)) {
  rmSync(legacy)
  console.log(`Cópia antiga removida: ${legacy}`)
}

const destination = path.join(target, "browser-relay.ts")
copyFileSync(path.join(root, "plugin", "browser-relay.ts"), destination)
mkdirSync(workspace, { recursive: true })

console.log(`Plugin instalado em ${destination}`)
console.log(`Pasta das conversas: ${workspace}`)
console.log("Reinicie o OpenCode (ou aguarde o reload automático) para carregar o plugin.")
