import type { SessionInfo } from "./types"
import { currentLocale } from "./i18n/runtime"
import { translate } from "./i18n"
import type { Locale } from "./i18n"

/**
 * Nome curto e estável de uma sessão. Usado no seletor, no cabeçalho, no card
 * de permissão e no título do grupo de abas para não divergirem.
 */
export function sessionLabel(
  session: Pick<SessionInfo, "id" | "title" | "slug">,
  locale: Locale = currentLocale(),
): string {
  if (session.title?.trim()) return session.title.trim()
  if (session.slug?.trim()) return session.slug.trim()
  return translate(locale, "session.fallbackLabel", { id: session.id.slice(-6) })
}
