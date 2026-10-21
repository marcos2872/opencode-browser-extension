import type { AgentInfo, SessionInfo } from "../shared/types"
import { LinkIcon, PlusIcon, TrashIcon } from "../components/icons"

interface Props {
  sessions: SessionInfo[]
  activeID: string | null
  busy: boolean
  agents: AgentInfo[]
  agent: string | null
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: () => void
  onAgent: (agent: string) => void
  onAttach: () => void
}

function titleOf(session: SessionInfo): string {
  if (session.title?.trim()) return session.title.trim()
  if (session.slug?.trim()) return session.slug.trim()
  return `Sessão ${session.id.slice(-6)}`
}

export function SessionBar({
  sessions,
  activeID,
  busy,
  agents,
  agent,
  onSelect,
  onNew,
  onDelete,
  onAgent,
  onAttach,
}: Props) {
  return (
    <div className="session-bar">
      <select
        className="select"
        value={activeID ?? ""}
        disabled={sessions.length === 0}
        onChange={(event) => onSelect(event.target.value)}
        title="Sessões do OpenCode"
      >
        {sessions.length === 0 ? <option value="">Nenhuma sessão</option> : null}
        {sessions.map((session) => (
          <option key={session.id} value={session.id}>
            {titleOf(session)}
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
      <button className="icon-btn" onClick={onAttach} disabled={busy} title="Anexar a aba atual ao grupo">
        <LinkIcon size={15} />
      </button>
      <button className="icon-btn" onClick={onNew} disabled={busy} title="Nova conversa">
        <PlusIcon size={16} />
      </button>
      <button className="icon-btn" onClick={onDelete} disabled={!activeID || busy} title="Excluir sessão">
        <TrashIcon size={15} />
      </button>
    </div>
  )
}
