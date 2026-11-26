import { RefreshIcon, SettingsIcon } from "../components/icons"
import { describeRelay } from "../components/relayStatus"
import type { ConnectionState, RelayState } from "../shared/types"
import type { Translate } from "../shared/i18n"
import { useI18n } from "../shared/i18n/react"

interface Props {
  connection: ConnectionState
  relay: RelayState
  onRetry: () => void
  onRetryRelay: () => void
  onOpenOptions: () => void
}

interface Content {
  tone: "warn" | "err"
  title: string
  detail: string
  action?: "retry" | "options"
  actionLabel?: string
}

function describe(connection: ConnectionState, t: Translate): Content | null {
  if (connection.phase === "online" || connection.phase === "unconfigured") {
    return null
  }
  if (connection.phase === "connecting") {
    return {
      tone: "warn",
      title: t("banner.connecting.title"),
      detail: t("banner.connecting.detail"),
    }
  }
  switch (connection.failure) {
    case "unauthorized":
      return {
        tone: "err",
        title: t("banner.unauthorized.title"),
        detail: t("banner.unauthorized.detail"),
        action: "options",
        actionLabel: t("app.openSettings"),
      }
    case "timeout":
      return {
        tone: "err",
        title: t("banner.timeout.title"),
        detail: connection.detail ?? t("banner.timeout.detail"),
        action: "retry",
        actionLabel: t("app.retry"),
      }
    case "server_error":
      return {
        tone: "err",
        title: t("banner.serverError.title"),
        detail: connection.detail ?? t("banner.serverError.detail"),
        action: "retry",
        actionLabel: t("app.retry"),
      }
    case "stream_closed":
      return {
        tone: "warn",
        title: t("banner.streamClosed.title"),
        detail: t("banner.streamClosed.detail"),
        action: "retry",
        actionLabel: t("app.reconnect"),
      }
    default:
      return {
        tone: "err",
        title: t("banner.unreachable.title"),
        detail: t("banner.unreachable.detail"),
        action: "retry",
        actionLabel: t("app.retry"),
      }
  }
}

export function ConnectionBanner({
  connection,
  relay,
  onRetry,
  onRetryRelay,
  onOpenOptions,
}: Props) {
  const { t, locale } = useI18n()
  const content = describe(connection, t)
  const relayOffline = !relay.connected
  if (!content && !relayOffline) return null

  return (
    <div className={`connection-banner ${content?.tone ?? "warn"}`} role="alert">
      <div className="connection-messages">
        {content ? (
          <div className="connection-text">
            <strong>{content.title}</strong>
            <span>{content.detail}</span>
          </div>
        ) : null}
        {relayOffline ? (
          <div className="connection-text">
            <strong>{t("banner.toolsOffline.title")}</strong>
            <span>{describeRelay(relay, locale)}</span>
          </div>
        ) : null}
      </div>
      <div className="connection-actions">
        {content?.action === "retry" ? (
          <button className="btn small" onClick={onRetry}>
            <RefreshIcon size={13} /> {content.actionLabel ?? t("app.retry")}
          </button>
        ) : content?.action === "options" ? (
          <button className="btn small" onClick={onOpenOptions}>
            <SettingsIcon size={13} /> {content.actionLabel ?? t("app.openSettings")}
          </button>
        ) : null}
        {relayOffline ? (
          <button className="btn small" onClick={onRetryRelay}>
            <RefreshIcon size={13} /> {t("banner.reconnectPlugin")}
          </button>
        ) : null}
      </div>
    </div>
  )
}
