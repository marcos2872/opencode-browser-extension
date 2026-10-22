import { useEffect, useRef } from "react"
import type { CommandInfo } from "../shared/types"
import { SendIcon, StopIcon } from "../components/icons"

interface Props {
  value: string
  busy: boolean
  disabled?: boolean
  relayConnected: boolean
  commands: CommandInfo[]
  onChange: (value: string) => void
  onSend: () => void
  onStop: () => void
}

export function Composer({
  value,
  busy,
  disabled,
  relayConnected,
  commands,
  onChange,
  onSend,
  onStop,
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    element.style.height = "auto"
    element.style.height = `${Math.min(element.scrollHeight, 160)}px`
  }, [value])

  const slash = /^\/([^\s]*)$/.exec(value)
  const matches = slash
    ? commands
        .filter((command) => command.name.toLowerCase().startsWith(slash[1].toLowerCase()))
        .slice(0, 6)
    : []

  return (
    <div className="composer">
      {matches.length > 0 ? (
        <div className="command-menu">
          {matches.map((command) => (
            <button key={command.name} type="button" onClick={() => onChange(`/${command.name} `)}>
              <span className="command-name">/{command.name}</span>
              {command.description ? <span className="command-desc">{command.description}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
      <div className="composer-box">
        <textarea
          ref={ref}
          value={value}
          rows={1}
          placeholder={busy ? "O agente está trabalhando..." : "Peça algo ao OpenCode..."}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault()
              if (!busy && value.trim()) onSend()
            }
          }}
        />
        <div className="composer-actions">
          {busy ? (
            <button className="send-btn" onClick={onStop} title="Parar">
              <StopIcon size={14} />
            </button>
          ) : (
            <button
              className="send-btn"
              onClick={onSend}
              disabled={disabled || !value.trim()}
              title="Enviar (Enter)"
            >
              <SendIcon size={14} />
            </button>
          )}
        </div>
      </div>
      <div className="composer-hint">
        <span>Enter envia · Shift+Enter quebra linha</span>
        <span
          className="status"
          role="status"
          title={
            relayConnected
              ? "Plugin do navegador conectado; ferramentas disponíveis"
              : "Plugin do navegador desconectado; ferramentas indisponíveis"
          }
        >
          <span className={`dot ${relayConnected ? "ok" : "warn"}`} />
          {relayConnected ? "ferramentas conectadas" : "ferramentas offline"}
        </span>
      </div>
    </div>
  )
}
