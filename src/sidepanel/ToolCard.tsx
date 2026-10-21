import type { ToolCallView } from "../shared/types"
import { BrowserIcon, CheckIcon, TerminalIcon, XIcon } from "../components/icons"

const LABELS: Record<string, string> = {
  tabs_context: "Abas do grupo",
  tabs_create: "Nova aba",
  tabs_close: "Fechar aba",
  navigate: "Navegar",
  read_page: "Ler página",
  find: "Buscar elemento",
  get_page_text: "Extrair texto",
  form_input: "Preencher campo",
  computer: "Interagir",
  javascript_tool: "JavaScript",
  read_console_messages: "Console",
  read_network_requests: "Rede",
  resize_window: "Redimensionar",
  update_plan: "Plano",
  browser_batch: "Lote de ações",
}

function summary(tool: ToolCallView): string {
  const input = (tool.input ?? {}) as Record<string, unknown>
  if (typeof input.url === "string") return input.url
  if (typeof input.query === "string") return `"${input.query}"`
  if (typeof input.action === "string") {
    return [
      input.action,
      typeof input.ref === "string" ? input.ref : "",
      Array.isArray(input.coordinate) ? `(${input.coordinate.join(", ")})` : "",
    ]
      .filter(Boolean)
      .join(" ")
  }
  if (typeof input.ref === "string") return input.ref
  if (typeof input.tabId === "number") return `aba ${input.tabId}`
  if (Array.isArray(input.domains)) return input.domains.join(", ")
  if (Array.isArray(input.actions)) return `${input.actions.length} ação(ões)`
  return ""
}

export function ToolCard({ tool }: { tool: ToolCallView }) {
  const label = LABELS[tool.name] ?? tool.name
  const detail = summary(tool)
  const statusLabel = tool.status === "ok" ? "ok" : tool.status === "error" ? "erro" : "rodando"

  return (
    <div className="tool-card">
      <div className="tool-head">
        <span className="tool-icon">
          {tool.name === "javascript_tool" ? <TerminalIcon size={13} /> : <BrowserIcon size={13} />}
        </span>
        <span>{label}</span>
        {detail ? <span className="status">{detail.slice(0, 80)}</span> : null}
        <span className="spacer" />
        <span className={`tool-status ${statusLabel === "ok" ? "ok" : statusLabel === "erro" ? "error" : "running"}`}>
          {statusLabel === "ok" ? <CheckIcon size={11} /> : statusLabel === "erro" ? <XIcon size={11} /> : null}{" "}
          {statusLabel}
        </span>
      </div>

      {tool.images?.length ? (
        <div className="tool-images">
          {tool.images.slice(0, 3).map((image, index) => (
            <img
              key={`${image.name}-${index}`}
              src={`data:${image.mime};base64,${image.data}`}
              alt={image.name}
              loading="lazy"
            />
          ))}
        </div>
      ) : null}

      {tool.input && Object.keys(tool.input).length > 0 ? (
        <details>
          <summary className="sub">Parâmetros</summary>
          <div className="tool-args">{JSON.stringify(tool.input, null, 2)}</div>
        </details>
      ) : null}

      {tool.output ? (
        <details open={tool.status === "error"}>
          <summary className="sub">Resultado</summary>
          <div className="tool-output">{tool.output}</div>
        </details>
      ) : null}
    </div>
  )
}
