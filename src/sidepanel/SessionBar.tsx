import { useState } from "react"
import type { SessionInfo, SessionMeta } from "../shared/types"
import type { BrowserTabContext } from "../shared/types"
import { sessionLabel } from "../shared/sessionLabel"
import { LinkIcon, PlusIcon, TrashIcon, XIcon } from "../components/icons"
import { useI18n } from "../shared/i18n/react"
import type { Translate } from "../shared/i18n"

interface Props {
  sessions: SessionInfo[]
  activeID: string | null
  busy: boolean
  /** Requisição de nova conversa em andamento (evita duplo clique). */
  creating?: boolean
  meta?: SessionMeta[]
  contextTabs: BrowserTabContext[]
  contextError: string | null
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: () => void
  onAttach: () => void
  onDetach: (tabID: number) => void
}

/** Marca na lista as conversas executando ou com resultado não lido. */
function metaSuffix(meta: SessionMeta | undefined, t: Translate): string {
  if (meta?.busy) return t("session.busySuffix")
  if (meta?.unread) return t("session.unreadSuffix")
  return ""
}

function originOf(url: string, t: Translate): string {
  try {
    return new URL(url).origin
  } catch {
    return url || t("session.tabNoAddress")
  }
}

export function SessionBar({
  sessions,
  activeID,
  busy,
  creating = false,
  meta = [],
  contextTabs,
  contextError,
  onSelect,
  onNew,
  onDelete,
  onAttach,
  onDetach,
}: Props) {
  const { t } = useI18n()
  const [contextMenuOpen, setContextMenuOpen] = useState(false)
  const hasConnectedTabs = contextTabs.length > 0
  const metaBySession = new Map(meta.map((item) => [item.sessionID, item]))

  return (
    <div className="session-bar">
      <select
        className="select"
        value={activeID ?? ""}
        disabled={sessions.length === 0}
        onChange={(event) => onSelect(event.target.value)}
        title={t("session.listTitle")}
        aria-label={t("session.listTitle")}
      >
        {sessions.length === 0 ? <option value="">{t("session.empty")}</option> : null}
        {sessions.map((session) => (
          <option key={session.id} value={session.id}>
            {`${sessionLabel(session)}${metaSuffix(metaBySession.get(session.id), t)}`}
          </option>
        ))}
      </select>
      <div className="session-attach-control">
        <button
          className={`icon-btn session-attach${hasConnectedTabs ? " connected" : ""}`}
          onClick={() => {
            if (!hasConnectedTabs) {
              onAttach()
              return
            }
            setContextMenuOpen((open) => !open)
          }}
          disabled={busy || !activeID}
          title={t("session.attach.title", {
            count: hasConnectedTabs ? contextTabs.length : 0,
            error: contextError,
          })}
          aria-label={t("session.attach.aria", {
            count: hasConnectedTabs ? contextTabs.length : 0,
          })}
          aria-expanded={hasConnectedTabs ? contextMenuOpen : undefined}
          aria-controls={hasConnectedTabs ? "session-attach-menu" : undefined}
        >
          <LinkIcon size={15} />
          {hasConnectedTabs ? (
            <span className="session-attach-count" aria-hidden="true">
              {contextTabs.length}
            </span>
          ) : null}
        </button>
        {contextMenuOpen && hasConnectedTabs ? (
          <div
            className="session-attach-menu"
            id="session-attach-menu"
            role="region"
            aria-label={t("session.attach.menu")}
          >
            <ul>
              {contextTabs.map((tab) => (
                <li key={tab.id}>
                  <div className="context-tab-info">
                    <span className="context-tab-title">{tab.title || t("session.tabNoTitle")}</span>
                    <span className="context-tab-url">{originOf(tab.url, t)}</span>
                  </div>
                  <button
                    className="context-remove"
                    onClick={() => {
                      onDetach(tab.id)
                      setContextMenuOpen(false)
                    }}
                    title={t("session.attach.remove", { title: tab.title })}
                    aria-label={t("session.attach.remove", { title: tab.title })}
                  >
                    <XIcon size={14} />
                  </button>
                </li>
              ))}
            </ul>
            <button
              className="session-attach-add"
              onClick={() => {
                setContextMenuOpen(false)
                onAttach()
              }}
              disabled={busy}
            >
              <LinkIcon size={14} /> {t("session.attach.add")}
            </button>
          </div>
        ) : null}
      </div>
      <button
        className="icon-btn"
        onClick={onNew}
        disabled={creating}
        aria-busy={creating}
        aria-label={t("session.new")}
        title={creating ? t("session.newBusy") : t("session.new")}
      >
        <PlusIcon size={16} />
      </button>
      <button
        className="icon-btn"
        onClick={onDelete}
        disabled={!activeID || busy}
        title={t("session.delete")}
        aria-label={t("session.delete")}
      >
        <TrashIcon size={15} />
      </button>
    </div>
  )
}
