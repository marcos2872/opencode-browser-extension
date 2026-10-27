import { RefreshIcon, SettingsIcon } from "../components/icons"
import { describeRelay } from "../components/relayStatus"
import type { ConnectionState, RelayState } from "../shared/types"

interface Props {
  connection: ConnectionState
  relay: RelayState
  onRetry: () => void
  onOpenOptions: () => void
}

interface Content {
  tone: "warn" | "err"
  title: string
  detail: string
  action?: "retry" | "options"
  actionLabel?: string
}

function describe(connection: ConnectionState): Content | null {
  if (connection.phase === "online" || connection.phase === "unconfigured") {
    return null
  }
  if (connection.phase === "connecting") {
    return {
      tone: "warn",
      title: "Conectando ao OpenCode…",
      detail:
        "Se o servidor ainda não estiver rodando, inicie o OpenCode no terminal com `opencode serve`.",
    }
  }
  switch (connection.failure) {
    case "unauthorized":
      return {
        tone: "err",
        title: "Token do OpenCode inválido ou expirado",
        detail:
          "Rode `opencode pair` no terminal, cole o novo link nas configurações e tente de novo.",
        action: "options",
        actionLabel: "Abrir configurações",
      }
    case "timeout":
      return {
        tone: "err",
        title: "O OpenCode demorou demais para responder",
        detail:
          connection.detail ??
          "O servidor pode estar travado. Reinicie o OpenCode e tente novamente.",
        action: "retry",
        actionLabel: "Tentar novamente",
      }
    case "server_error":
      return {
        tone: "err",
        title: "O OpenCode respondeu com erro",
        detail:
          connection.detail ??
          "Confira o log do servidor do OpenCode e tente novamente.",
        action: "retry",
        actionLabel: "Tentar novamente",
      }
    case "stream_closed":
      return {
        tone: "warn",
        title: "A conexão com o OpenCode foi encerrada",
        detail:
          "Tente reconectar. Se o problema continuar, reinicie o OpenCode no terminal.",
        action: "retry",
        actionLabel: "Reconectar",
      }
    default:
      return {
        tone: "err",
        title: "O OpenCode não está respondendo",
        detail:
          "Inicie o OpenCode no terminal com `opencode serve` e clique em Tentar novamente.",
        action: "retry",
        actionLabel: "Tentar novamente",
      }
  }
}

export function ConnectionBanner({
  connection,
  relay,
  onRetry,
  onOpenOptions,
}: Props) {
  const content = describe(connection)
  if (!content) return null
  const relayOffline = !relay.connected

  return (
    <div className={`connection-banner ${content.tone}`} role="alert">
      <div className="connection-text">
        <strong>{content.title}</strong>
        <span>{content.detail}</span>
        {relayOffline ? (
          <span className="connection-note">{describeRelay(relay)}</span>
        ) : null}
      </div>
      {content.action === "retry" ? (
        <button className="btn small" onClick={onRetry}>
          <RefreshIcon size={13} /> {content.actionLabel ?? "Tentar novamente"}
        </button>
      ) : content.action === "options" ? (
        <button className="btn small" onClick={onOpenOptions}>
          <SettingsIcon size={13} /> {content.actionLabel ?? "Abrir configurações"}
        </button>
      ) : null}
    </div>
  )
}
