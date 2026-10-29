import { getConfig } from "../shared/storage"

/**
 * Política de foco da extensão.
 *
 * Por padrão nenhuma ação do agente ativa abas ou janelas: as tools trabalham
 * em segundo plano para não interromper o usuário. Quem quiser ver o navegador
 * sendo conduzido liga "Trazer abas para frente" nas opções.
 */
export async function shouldBringTabsToFront(): Promise<boolean> {
  const config = await getConfig().catch(() => null)
  return config?.bringTabsToFront === true
}

/**
 * Coloca a aba em primeiro plano **somente** quando o usuário liberou a
 * ativação. Devolve `true` quando a aba ficou ativa de fato.
 */
export async function activateTab(tabId: number, reason: string): Promise<boolean> {
  const tab = await chrome.tabs.get(tabId).catch(() => undefined)
  if (!tab) return false
  if (tab.active) return true
  if (!(await shouldBringTabsToFront())) {
    console.debug(`[foco] aba ${tabId} não foi ativada (${reason})`)
    return false
  }
  try {
    await chrome.tabs.update(tabId, { active: true })
    console.debug(`[foco] aba ${tabId} ativada (${reason})`)
    return true
  } catch {
    console.debug(`[foco] falha ao ativar a aba ${tabId} (${reason})`)
    return false
  }
}
