import { useState } from "react"
import type { AgentInfo, SessionInfo, SessionMeta } from "../shared/types"
import type { BrowserTabContext } from "../shared/types"
import { LinkIcon, PlusIcon, TrashIcon, XIcon } from "../components/icons"

interface Props {
  sessions: SessionInfo[]
  activeID: string | null
  busy: boolean
  meta?: SessionMeta[]
  contextTabs: BrowserTabContext[]
  contextError: string | null
  agents: AgentInfo[]
  agent: string | null
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: () => void
  onAttach: () => void
  onDetach: (tabID: number) => void
  onAgent: (agent: string) => void
}

export function titleOf(session: SessionInfo): string {
  if (session.title?.trim()) return session.title.trim()
  if (session.slug?.trim()) return session.slug.trim()
  return `Sessão ${session.id.slice(-6)}`
}

/** Marca na lista as conversas executando ou com resultado não lido. */
function metaSuffix(meta: SessionMeta | undefined): string {
  if (meta?.busy) return " · executando"
  if (meta?.unread) return " · nova resposta"
  return ""
}

function originOf(url: string): string {
  try {
    return new URL(url).origin
  } catch {
    return url || "Aba sem endereço"
  }
}

export function SessionBar({
  sessions,
  activeID,
  busy,
  meta = [],
  contextTabs,
  contextError,
  agents,
  agent,
  onSelect,
  onNew,
  onDelete,
  onAttach,
  onDetach,
  onAgent,
}: Props) {
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
        title="Sessões do OpenCode"
        aria-label="Sessões do OpenCode"
      >
        {sessions.length === 0 ? <option value="">Nenhuma sessão</option> : null}
        {sessions.map((session) => (
          <option key={session.id} value={session.id}>
            {`${titleOf(session)}${metaSuffix(metaBySession.get(session.id))}`}
          </option>
        ))}
      </select>
      {agents.length > 0 ? (
        <select
          className="select agent-select"
          value={agent ?? ""}
          disabled={busy}
          onChange={(event) => onAgent(event.target.value)}
          title="Agente do OpenCode"
        >
          {agents.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name ?? item.id}
            </option>
          ))}
        </select>
      ) : null}
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
          title={
            hasConnectedTabs
              ? `${contextTabs.length} ${contextTabs.length === 1 ? "aba conectada" : "abas conectadas"}. Mostrar abas ou conectar nova`
              : contextError
                ? `${contextError}. Clique para conectar a aba atual`
                : "Conectar aba atual"
          }
          aria-label={
            hasConnectedTabs
              ? `Mostrar ${contextTabs.length} ${contextTabs.length === 1 ? "aba conectada" : "abas conectadas"}`
              : "Conectar aba atual"
          }
          aria-expanded={hasConnectedTabs ? contextMenuOpen : undefined}
          aria-controls={hasConnectedTabs ? "session-attach-menu" : undefined}
        >
          <LinkIcon size={15} />
        </button>
        {contextMenuOpen && hasConnectedTabs ? (
          <div className="session-attach-menu" id="session-attach-menu" aria-label="Abas conectadas">
            <ul>
              {contextTabs.map((tab) => (
                <li key={tab.id}>
                  <div className="context-tab-info">
                    <span className="context-tab-title">{tab.title || "Aba sem título"}</span>
                    <span className="context-tab-url">{originOf(tab.url)}</span>
                  </div>
                  <button
                    className="context-remove"
                    onClick={() => {
                      onDetach(tab.id)
                      setContextMenuOpen(false)
                    }}
                    title={`Remover ${tab.title || "aba"} do contexto`}
                    aria-label={`Remover ${tab.title || "aba"} do contexto`}
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
              <LinkIcon size={14} /> Conectar nova aba
            </button>
          </div>
        ) : null}
      </div>
      <button className="icon-btn" onClick={onNew} disabled={busy} title="Nova conversa">
        <PlusIcon size={16} />
      </button>
      <button className="icon-btn" onClick={onDelete} disabled={!activeID || busy} title="Excluir sessão">
        <TrashIcon size={15} />
      </button>
    </div>
  )
}
