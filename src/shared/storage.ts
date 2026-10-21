import type { OpencodeConfig } from "./types"

const CONFIG_KEY = "opencode.config"
const ALLOW_KEY = "permissions.allow"
const DENY_KEY = "permissions.deny"

export async function getConfig(): Promise<OpencodeConfig | null> {
  const data = await chrome.storage.local.get(CONFIG_KEY)
  const value = data[CONFIG_KEY] as OpencodeConfig | undefined
  return value?.baseUrl && value?.token ? value : null
}

export async function setConfig(config: OpencodeConfig | null): Promise<void> {
  if (config === null) {
    await chrome.storage.local.remove(CONFIG_KEY)
    return
  }
  await chrome.storage.local.set({ [CONFIG_KEY]: config })
}

export async function getAllowList(): Promise<string[]> {
  const data = await chrome.storage.local.get(ALLOW_KEY)
  const value = data[ALLOW_KEY]
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
}

export async function setAllowList(hosts: string[]): Promise<void> {
  await chrome.storage.local.set({ [ALLOW_KEY]: [...new Set(hosts)] })
}

export async function getDenyList(): Promise<string[]> {
  const data = await chrome.storage.local.get(DENY_KEY)
  const value = data[DENY_KEY]
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
}

export async function setDenyList(hosts: string[]): Promise<void> {
  await chrome.storage.local.set({ [DENY_KEY]: [...new Set(hosts)] })
}
