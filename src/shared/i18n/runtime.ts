import { getLocalePreference, setLocalePreference } from "../storage"
import {
  DEFAULT_LOCALE,
  effectiveLocale,
  translate,
  type Locale,
  type LocalePreference,
  type MessageArgs,
  type MessageKey,
} from "./index"

/**
 * Idioma em uso nos contextos da extensão.
 *
 * O locale é resolvido uma vez por contexto (painel, configurações, background,
 * content script, offscreen) e mantido em cache para que `t()` seja síncrono.
 * Quando a preferência muda em `chrome.storage.local`, o cache se atualiza e os
 * assinantes (React) re-renderizam.
 */

let cached: Locale = DEFAULT_LOCALE
const listeners = new Set<() => void>()

/** Idioma da interface do navegador, com fallback para `navigator.language`. */
export function browserLanguage(): string | null {
  try {
    const language = chrome?.i18n?.getUILanguage?.()
    if (language) return language
  } catch {
    // `chrome.i18n` pode não existir (jsdom, páginas de teste)
  }
  return typeof navigator !== "undefined" ? navigator.language : null
}

/** Lê a preferência salva e o idioma do navegador; atualiza o cache. */
export async function loadLocale(): Promise<Locale> {
  const preference = await getLocalePreference().catch(() => null)
  const next = effectiveLocale(preference, browserLanguage())
  setLocale(next)
  return next
}

export function currentLocale(): Locale {
  return cached
}

export function setLocale(locale: Locale): void {
  const changed = locale !== cached
  cached = locale
  if (changed) for (const listener of [...listeners]) listener()
}

export function subscribeLocale(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Aplica a preferência imediatamente (troca no seletor de Configurações) e
 * grava em `chrome.storage.local`, que propaga para os outros contextos.
 */
export async function applyLocalePreference(preference: LocalePreference): Promise<Locale> {
  await setLocalePreference(preference)
  const next = effectiveLocale(preference, browserLanguage())
  setLocale(next)
  return next
}

/**
 * Mantém o cache em dia quando a preferência muda em outro contexto.
 *
 * Idempotente: o painel e as configurações chamam no mount, e uma remontagem
 * (ou o StrictMode) não pode registrar o mesmo listener duas vezes.
 */
let watching = false
export function watchLocalePreference(): void {
  if (watching) return
  if (typeof chrome === "undefined" || !chrome.storage?.onChanged?.addListener) return
  watching = true
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !("ui.locale" in changes)) return
    const value = changes["ui.locale"].newValue as LocalePreference | undefined
    setLocale(effectiveLocale(value ?? null, browserLanguage()))
  })
}

/** Tradução no idioma em uso; síncrona e segura antes do primeiro `loadLocale`. */
export function t<K extends MessageKey>(key: K, ...args: MessageArgs<K>): string {
  return translate(cached, key, ...args)
}
