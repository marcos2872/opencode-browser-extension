import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
} from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { resolveRoots, workspaceDir } from "./lib/opencode-paths.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const roots = resolveRoots()
const configDir = optionValue("--config-dir") ?? roots.config
const target = path.join(configDir, "plugins")
const skillsDir = path.join(configDir, "skills")
const workspace = workspaceDir(roots)

function optionValue(name) {
  const index = process.argv.indexOf(name)
  if (index < 0) return undefined
  const value = process.argv[index + 1]
  if (!value || value.startsWith("--")) throw new Error(`Informe o valor de ${name}.`)
  return path.resolve(value)
}

function skillVersion(text) {
  const match = /<!--\s*opencode-browser-skill v(\d+)\s*-->/.exec(text)
  return match ? Number(match[1]) : null
}

function installSkill() {
  const source = path.join(root, "plugin", "skills", "browser-relay", "SKILL.md")
  const destinationDir = path.join(skillsDir, "browser-relay")
  const destination = path.join(destinationDir, "SKILL.md")
  const template = readFileSync(source, "utf8")
  mkdirSync(destinationDir, { recursive: true })

  if (!existsSync(destination)) {
    copyFileSync(source, destination)
    return destination
  }

  const current = readFileSync(destination, "utf8")
  const currentVersion = skillVersion(current)
  const templateVersion = skillVersion(template)
  if (currentVersion !== null && templateVersion !== null && currentVersion < templateVersion) {
    copyFileSync(destination, `${destination}.bak-v${currentVersion}`)
    copyFileSync(source, destination)
  }
  return destination
}

mkdirSync(target, { recursive: true })

const legacy = path.join(target, "opencode-browser.ts")
if (existsSync(legacy)) {
  rmSync(legacy)
  console.log(`Cópia antiga removida: ${legacy}`)
}

const destination = path.join(target, "browser-relay.ts")
copyFileSync(path.join(root, "plugin", "browser-relay.ts"), destination)

const agentTemplate = path.join(target, "opencode-browser.agent.md")
copyFileSync(path.join(root, "plugin", "opencode-browser.agent.md"), agentTemplate)
const skill = installSkill()
mkdirSync(workspace, { recursive: true })

console.log(`Plugin instalado em ${destination}`)
console.log(`Template do agente em ${agentTemplate}`)
console.log(`Skill instalada em ${skill}`)
console.log(`Pasta das conversas: ${workspace}`)
console.log("Reinicie o OpenCode (ou aguarde o reload automático) para carregar o plugin.")
