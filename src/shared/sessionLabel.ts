import type { SessionInfo } from "./types"

/**
 * Nome curto e estável de uma sessão. Usado no seletor, no cabeçalho, no card
 * de permissão e no título do grupo de abas para não divergirem.
 */
export function sessionLabel(
  session: Pick<SessionInfo, "id" | "title" | "slug">,
): string {
  if (session.title?.trim()) return session.title.trim()
  if (session.slug?.trim()) return session.slug.trim()
  return `Sessão ${session.id.slice(-6)}`
}
