import { useEffect, useRef } from "react"
import type { CommandInfo } from "../shared/types"
import { SendIcon, StopIcon } from "../components/icons"
import { formatCost, formatTokens, type SessionStats } from "./sessionStats"
import { useI18n } from "../shared/i18n/react"

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
  const { t, locale } = useI18n()
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

  const tokens = stats?.contextUsed !== undefined ? formatTokens(stats.contextUsed, locale) : null
  const contextLabel =
    tokens === null
      ? null
      : stats?.percent !== undefined
        ? t("composer.contextPercent", { tokens, percent: stats.percent })
        : t("composer.contextTokens", { tokens })
  const costLabel =
    stats?.cost !== undefined
      ? t("composer.sessionCost", { cost: formatCost(stats.cost, locale) })
      : null
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
            busy ? t("composer.placeholder.busy") : blockedReason ?? t("composer.placeholder.idle")
          }
          disabled={disabled || Boolean(blockedReason)}
          title={blockedReason ?? t("composer.hint")}
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
            <button className="send-btn" onClick={onStop} title={t("composer.stop")}>
              <StopIcon size={14} />
            </button>
          ) : (
            <button
              className="send-btn"
              onClick={onSend}
              disabled={disabled || Boolean(blockedReason) || !value.trim()}
              title={blockedReason ?? t("composer.send")}
            >
              <SendIcon size={14} />
            </button>
          )}
        </div>
      </div>
      <div className="composer-hint">
        <span
          className="composer-usage"
          title={statsLabel ? t("composer.usageHint") : undefined}
        >
          {statsLabel || t("composer.hint")}
        </span>
        <span
          className="status"
          role="status"
          title={relayConnected ? t("composer.toolsOnHint") : t("composer.toolsOffHint")}
        >
          <span className={`dot ${relayConnected ? "ok" : "warn"}`} />
          {relayConnected ? t("composer.toolsOn") : t("composer.toolsOff")}
        </span>
      </div>
    </div>
  )
}
