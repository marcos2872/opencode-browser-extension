import type { RelayState } from "../shared/types"

/**
 * Texto acionável para o estado do plugin do navegador. Prefere o motivo
 * estruturado (`reason`) e usa `lastError` apenas como detalhe técnico.
 */
export function describeRelay(relay: RelayState): string {
  if (relay.connected) return "Plugin conectado"
  switch (relay.reason) {
    case "missing_plugin":
      return "Plugin não encontrado — instale o plugin e reinicie o OpenCode"
    case "rejected":
      return "Plugin recusou a conexão — confira o ID da extensão"
    case "silent":
      return "Plugin parou de responder — reinicie o OpenCode"
    case "closed":
      return "Plugin desconectado — reinicie o OpenCode para reconectar"
    default:
      return relay.lastError ?? "Plugin desconectado"
  }
}
