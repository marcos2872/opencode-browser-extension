import { useEffect, useRef } from "react"
import type { CommandInfo } from "../shared/types"
import { SendIcon, StopIcon } from "../components/icons"
import { formatCost, formatTokens, type SessionStats } from "./sessionStats"

const MIN_HEIGHT = 22
const MAX_HEIGHT = 160

/**
 * Ajusta a altura ao conteúdo. Com o campo vazio, remove o inline e deixa o
 * CSS/`rows` definir — assim um valor residual nunca fica congelado no teto.
 */
function fit(element: HTMLTextAreaElement): void {
  if (!element.value) {
    element.style.height = ""
    return
  }
  element.style.height = "0px"
  const next = Math.min(
    Math.max(element.scrollHeight, MIN_HEIGHT),
    MAX_HEIGHT,
  )
  element.style.height = `${next}px`
}

interface Props {
  value: string
  busy: boolean
  disabled?: boolean
  blockedReason?: string | null
  relayConnected: boolean
  stats?: SessionStats | null
  commands: CommandInfo[]
  onChange: (value: string) => void
  onSend: () => void
  onStop: () => void
}

export function Composer({
  value,
  busy,
  disabled,
  blockedReason,
  relayConnected,
  stats,
  commands,
  onChange,
  onSend,
  onStop,
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    fit(element)
  }, [value])

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const onWindowResize = () => fit(element)
    window.addEventListener("resize", onWindowResize)
    let width = element.clientWidth
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            if (element.clientWidth === width) return
            width = element.clientWidth
            fit(element)
          })
    if (observer) observer.observe(element.parentElement ?? element)
    return () => {
      window.removeEventListener("resize", onWindowResize)
      observer?.disconnect()
    }
  }, [])

  const slash = /^\/([^\s]*)$/.exec(value)
  const matches = slash
    ? commands
        .filter((command) => command.name.toLowerCase().startsWith(slash[1].toLowerCase()))
        .slice(0, 6)
    : []

  const contextLabel =
    stats?.contextUsed !== undefined
      ? stats.contextLimit
        ? `Contexto ${formatTokens(stats.contextUsed)} / ${formatTokens(stats.contextLimit)} (${stats.percent}%)`
        : `Contexto ${formatTokens(stats.contextUsed)} tokens`
      : null
  const costLabel =
    stats?.cost !== undefined ? `Sessão ${formatCost(stats.cost)}` : null
  const statsLabel = [contextLabel, costLabel].filter(Boolean).join(" · ")

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
          placeholder={
            busy
              ? "O agente está trabalhando..."
              : blockedReason ?? "Peça algo ao OpenCode..."
          }
          disabled={disabled || Boolean(blockedReason)}
          title={blockedReason ?? "Enter envia · Shift+Enter quebra linha"}
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
              disabled={disabled || Boolean(blockedReason) || !value.trim()}
              title={blockedReason ?? "Enviar (Enter)"}
            >
              <SendIcon size={14} />
            </button>
          )}
        </div>
      </div>
      <div className="composer-hint">
        <span
          className="composer-usage"
          title={
            statsLabel
              ? "Tokens da última requisição / janela do modelo · custo informado pelo OpenCode"
              : undefined
          }
        >
          {statsLabel || "Enter envia · Shift+Enter quebra linha"}
        </span>
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
