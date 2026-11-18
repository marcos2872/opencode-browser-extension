import { en } from "./en"
import { pt, type Catalog, type MessageKey } from "./pt-BR"

export type Locale = "pt-BR" | "en"
/** `auto` segue o idioma da interface do navegador. */
export type LocalePreference = Locale | "auto"

export const LOCALES: Locale[] = ["pt-BR", "en"]
export const DEFAULT_LOCALE: Locale = "pt-BR"

const CATALOGS: Record<Locale, Catalog> = { "pt-BR": pt, en }

/** Idioma do navegador (`chrome.i18n.getUILanguage()`) → locale suportado. */
export function resolveLocale(language: string | null | undefined): Locale {
  if (!language) return DEFAULT_LOCALE
  const tag = language.toLowerCase()
  return tag === "pt" || tag.startsWith("pt-") || tag.startsWith("pt_")
    ? "pt-BR"
    : "en"
}

/** Preferência salva + idioma do navegador → locale efetivo. */
export function effectiveLocale(
  preference: LocalePreference | null | undefined,
  browserLanguage: string | null | undefined,
): Locale {
  if (preference === "pt-BR" || preference === "en") return preference
  return resolveLocale(browserLanguage)
}

/** Troca a mensagem por uma função quando ela tem parâmetros. */
export type MessageArgs<K extends MessageKey> =
  Catalog[K] extends (p: infer P) => string ? [p: P] : []

/**
 * Traduz uma chave no locale dado. Mensagens sem parâmetro ignoram `args`;
 * mensagens com parâmetro exigem o objeto (garantido pelo tipo).
 */
export function translate<K extends MessageKey>(
  locale: Locale,
  key: K,
  ...args: MessageArgs<K>
): string {
  const entry = CATALOGS[locale]?.[key] ?? CATALOGS[DEFAULT_LOCALE][key]
  if (typeof entry === "function") {
    return (entry as (p: unknown) => string)(args[0])
  }
  return entry ?? key
}

export type Translate = <K extends MessageKey>(key: K, ...args: MessageArgs<K>) => string

export function translator(
  locale: Locale,
  custom?: Catalog,
): Translate {
  return (key, ...args) => {
    const entry = custom?.[key] ?? CATALOGS[locale]?.[key] ?? CATALOGS[DEFAULT_LOCALE][key]
    if (typeof entry === "function") {
      return (entry as (p: unknown) => string)(args[0])
    }
    return entry ?? key
  }
}

/** `t` no locale informado, como função solta (usada na UI e no background). */
export function messages(locale: Locale): Translate {
  return translator(locale)
}

/**
 * Troca a mensagem no locale; aceita chave ausente do catálogo (fallback para o
 * texto original) sem quebrar o tipo, para casos como `lastError` vindo do plugin.
 */
export function optional(locale: Locale, key: string, fallback: string): string {
  const catalog = CATALOGS[locale] as Record<string, unknown>
  const entry = catalog?.[key]
  return typeof entry === "string" ? entry : fallback
}

export { pt, en }
export type { Catalog, MessageKey }
