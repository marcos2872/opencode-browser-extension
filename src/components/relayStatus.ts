import type { RelayState } from "../shared/types"
import { currentLocale } from "../shared/i18n/runtime"
import { translate } from "../shared/i18n"
import type { Locale } from "../shared/i18n"

/**
 * Texto acionável para o estado do plugin do navegador. Prefere o motivo
 * estruturado (`reason`) e usa `lastError` apenas como detalhe técnico.
 */
export function describeRelay(relay: RelayState, locale: Locale = currentLocale()): string {
  if (relay.connected) return translate(locale, "relay.connected")
  switch (relay.reason) {
    case "missing_plugin":
      return translate(locale, "relay.missing")
    case "rejected":
      return translate(locale, "relay.rejected")
    case "silent":
      return translate(locale, "relay.silent")
    case "closed":
      return translate(locale, "relay.closed")
    default:
      return relay.lastError ?? translate(locale, "relay.disconnected")
  }
}
