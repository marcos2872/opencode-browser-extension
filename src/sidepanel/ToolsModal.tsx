import { useEffect, useRef, useState } from "react"
import type { ToolCallView } from "../shared/types"
import { BrowserIcon, ChevronIcon, TerminalIcon, XIcon } from "../components/icons"
import { ToolBody, firstLine, toolLabel, toolStatus, toolSummary } from "./ToolCard"

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.max(1, Math.round(ms))}ms`
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

export function toolDuration(tool: ToolCallView): string | null {
  if (!tool.startedAt) return null
  return formatDuration((tool.finishedAt ?? Date.now()) - tool.startedAt)
}

/** Duração total do run: do início da primeira tool até o fim da última. */
export function totalDuration(tools: ToolCallView[]): string | null {
  const starts = tools
    .map((tool) => tool.startedAt)
    .filter((value): value is number => typeof value === "number")
  if (!starts.length) return null
  const ends = tools.map((tool) => tool.finishedAt ?? Date.now())
  return formatDuration(Math.max(...ends) - Math.min(...starts))
}

export function ToolRun({
  tools,
  onOpen,
}: {
  tools: ToolCallView[]
  onOpen: () => void
}) {
  if (!tools.length) return null
  const errors = tools.filter((tool) => tool.status === "error")
  const duration = totalDuration(tools)

  return (
    <div className={`tool-run${errors.length ? " failed" : ""}`}>
      <button type="button" className="tool-run-head" onClick={onOpen}>
        <BrowserIcon size={13} />
        <span>
          {tools.length} ferramenta{tools.length > 1 ? "s" : ""}
        </span>
        {errors.length ? (
          <span className="tool-run-errors">
            {errors.length} erro{errors.length > 1 ? "s" : ""}
          </span>
        ) : null}
        <span className="spacer" />
        {duration ? <span className="tool-run-time">{duration}</span> : null}
        <span className="tool-run-open">ver</span>
      </button>
      {errors.length && errors[0].output ? (
        <div className="tool-error-line">{firstLine(errors[0].output)}</div>
      ) : null}
    </div>
  )
}

export function ToolsModal({
  tools,
  title,
  onClose,
}: {
  tools: ToolCallView[]
  title: string
  onClose: () => void
}) {
  const [onlyErrors, setOnlyErrors] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const onCloseRef = useRef(onClose)
  const errors = tools.filter((tool) => tool.status === "error")
  const visible = onlyErrors ? errors : tools

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  return (
    <div
      className="tools-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="tools-modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="tools-modal-head">
          <strong>{title}</strong>
          <span className="tools-modal-count">
            {tools.length} ferramenta{tools.length > 1 ? "s" : ""}
          </span>
          {errors.length ? (
            <span className="tool-status error">
              {errors.length} erro{errors.length > 1 ? "s" : ""}
            </span>
          ) : null}
          <span className="spacer" />
          <button
            ref={closeRef}
            type="button"
            className="icon-btn"
            onClick={onClose}
            title="Fechar"
            aria-label="Fechar"
          >
            <XIcon size={14} />
          </button>
        </div>

        {errors.length ? (
          <label className="tools-modal-filter">
            <input
              type="checkbox"
              checked={onlyErrors}
              onChange={(event) => setOnlyErrors(event.target.checked)}
            />
            Somente erros
          </label>
        ) : null}

        <div className="tools-modal-list">
          {visible.map((tool) => {
            const state = toolStatus(tool)
            const detail = toolSummary(tool)
            const duration = toolDuration(tool)
            const open = expanded === tool.id
            return (
              <div className={`tool-modal-item ${tool.status}`} key={tool.id}>
                <button
                  type="button"
                  className="tool-item-head"
                  aria-expanded={open}
                  onClick={() => setExpanded(open ? null : tool.id)}
                >
                  <span className="tool-icon">
                    {tool.name === "javascript_tool" ? (
                      <TerminalIcon size={13} />
                    ) : (
                      <BrowserIcon size={13} />
                    )}
                  </span>
                  <span className="tool-item-name">{toolLabel(tool)}</span>
                  {detail ? <span className="status">{detail.slice(0, 60)}</span> : null}
                  <span className="spacer" />
                  {duration ? <span className="tool-item-time">{duration}</span> : null}
                  <span
                    className={`tool-status ${
                      state === "ok" ? "ok" : state === "erro" ? "error" : "running"
                    }`}
                  >
                    {state}
                  </span>
                  <ChevronIcon size={12} className={`chevron${open ? " open" : ""}`} />
                </button>
                {open ? (
                  <div className="tool-item-body">
                    <ToolBody tool={tool} />
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
