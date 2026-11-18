import { useSyncExternalStore } from "react"
import { translate } from "./index"
import { currentLocale, subscribeLocale } from "./runtime"
import type { Locale, MessageArgs, MessageKey } from "./index"

/**
 * Hook de tradução para os componentes React.
 *
 * Re-renderiza quando a preferência de idioma muda (via
 * `subscribeLocale`). O locale vem do store externo, então painel e
 * configurações compartilham o mesmo estado sem Provider.
 */
export function useI18n(): {
  locale: Locale
  t: <K extends MessageKey>(key: K, ...args: MessageArgs<K>) => string
} {
  const locale = useSyncExternalStore(subscribeLocale, currentLocale, currentLocale)
  const t = <K extends MessageKey>(key: K, ...args: MessageArgs<K>): string =>
    translate(locale, key, ...args)
  return { locale, t }
}
