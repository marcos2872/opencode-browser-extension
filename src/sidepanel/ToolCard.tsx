import { useState } from "react"
import type { FormAnswer, FormInfo, ToolCallView } from "../shared/types"
import { FormCard } from "../components/FormCard"
import { BrowserIcon, CheckIcon, ChevronIcon, QuestionIcon, TerminalIcon, XIcon } from "../components/icons"

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

interface ToolCardProps {
  tool: ToolCallView
  forms?: FormInfo[]
  busyFormID?: string | null
  onFormSubmit?: (form: FormInfo, answer: FormAnswer) => void
  onFormCancel?: (form: FormInfo) => void
  /** `false` usa a linha compacta expansível (padrão do chat). */
  detailed?: boolean
}

/** O form da tool `question` guarda o id da chamada em `metadata.tool.id`. */
export function questionToolID(form: FormInfo): string | undefined {
  const metadata = form.metadata
  if (!metadata || typeof metadata.tool !== "object" || metadata.tool === null) return undefined
  const id = (metadata.tool as Record<string, unknown>).id
  return typeof id === "string" ? id : undefined
}

interface QuestionOption {
  label: string
  description?: string
}

interface QuestionItem {
  header?: string
  question: string
  multiple: boolean
  options: QuestionOption[]
}

export function readQuestions(input: unknown): QuestionItem[] {
  if (!input || typeof input !== "object") return []
  const list = (input as Record<string, unknown>).questions
  if (!Array.isArray(list)) return []
  return list.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return []
    const value = entry as Record<string, unknown>
    const options = Array.isArray(value.options)
      ? value.options.flatMap((option) => {
          if (!option || typeof option !== "object") return []
          const item = option as Record<string, unknown>
          if (typeof item.label !== "string") return []
          return [
            {
              label: item.label,
              description: typeof item.description === "string" ? item.description : undefined,
            },
          ]
        })
      : []
    return [
      {
        header: typeof value.header === "string" ? value.header : undefined,
        question: typeof value.question === "string" ? value.question : "",
        multiple: value.multiple === true,
        options,
      },
    ]
  })
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

function statusLabel(tool: ToolCallView): string {
  if (tool.status === "ok") return "ok"
  if (tool.status === "error") return "erro"
  return "rodando"
}

/** Card de um form pendente; usado pela tool `question` e por forms órfãos. */
export function PendingFormCard({
  form,
  busy,
  onSubmit,
  onCancel,
}: {
  form: FormInfo
  busy: boolean
  onSubmit: (answer: FormAnswer) => void
  onCancel?: () => void
}) {
  return (
    <div className="tool-card tool-card-question">
      <div className="tool-head">
        <span className="tool-icon">
          <QuestionIcon size={13} />
        </span>
        <span>{form.title && form.title !== "Questions" ? form.title : "Pergunta"}</span>
        <span className="spacer" />
        <span className="tool-status running">aguardando</span>
      </div>
      <FormCard key={form.id} form={form} busy={busy} onSubmit={onSubmit} onCancel={onCancel} />
    </div>
  )
}

function QuestionCard({
  tool,
  form,
  busy,
  onFormSubmit,
  onFormCancel,
}: {
  tool: ToolCallView
  form?: FormInfo
  busy: boolean
  onFormSubmit?: (form: FormInfo, answer: FormAnswer) => void
  onFormCancel?: (form: FormInfo) => void
}) {
  // O form pendente é a fonte de verdade: a tool pode já aparecer como "ok" no
  // histórico hidratado mesmo com o servidor ainda esperando a resposta.
  if (form && onFormSubmit) {
    return (
      <PendingFormCard
        form={form}
        busy={busy}
        onSubmit={(answer) => onFormSubmit(form, answer)}
        onCancel={onFormCancel ? () => onFormCancel(form) : undefined}
      />
    )
  }

  const label = statusLabel(tool)
  const questions = readQuestions(tool.input)

  return (
    <div className="tool-card tool-card-question">
      <div className="tool-head">
        <span className="tool-icon">
          <QuestionIcon size={13} />
        </span>
        <span>Pergunta</span>
        <span className="spacer" />
        <span className={`tool-status ${label === "ok" ? "ok" : label === "erro" ? "error" : "running"}`}>
          {label === "ok" ? <CheckIcon size={11} /> : label === "erro" ? <XIcon size={11} /> : null} {label}
        </span>
      </div>

      {questions.length ? (
        <ul className="question-list">
          {questions.map((item, index) => (
            <li key={index}>
              {item.header ? <strong>{item.header}</strong> : null}
              <span>
                {item.question}
                {item.multiple ? <em className="question-multiple"> · múltipla escolha</em> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {tool.output ? <div className="tool-output">{tool.output}</div> : null}
    </div>
  )
}

export function ToolCard({
  tool,
  forms,
  busyFormID,
  onFormSubmit,
  onFormCancel,
  detailed = true,
}: ToolCardProps) {
  const [expanded, setExpanded] = useState(false)

  if (tool.name === "question") {
    const form = forms?.find((item) => questionToolID(item) === tool.id)
    return (
      <QuestionCard
        tool={tool}
        form={form}
        busy={Boolean(form) && busyFormID === form?.id}
        onFormSubmit={onFormSubmit}
        onFormCancel={onFormCancel}
      />
    )
  }

  const label = LABELS[tool.name] ?? tool.name
  const detail = summary(tool)
  const state = statusLabel(tool)
  const hasBody =
    Boolean(tool.images?.length) ||
    Boolean(tool.output) ||
    Boolean(tool.input && Object.keys(tool.input).length > 0)

  if (detailed) {
    return (
      <div className="tool-card">
        <ToolHead tool={tool} label={label} detail={detail} state={state} />
        <ToolBody tool={tool} />
      </div>
    )
  }

  return (
    <div className={`tool-card compact ${tool.status === "error" ? "failed" : ""}`}>
      <ToolHead
        tool={tool}
        label={label}
        detail={detail}
        state={state}
        expandable={hasBody}
        expanded={expanded}
        onToggle={() => setExpanded((value) => !value)}
      />
      {tool.status === "error" && tool.output && !expanded ? (
        <div className="tool-error-line">{firstLine(tool.output)}</div>
      ) : null}
      {expanded ? <ToolBody tool={tool} /> : null}
    </div>
  )
}

function ToolHead({
  tool,
  label,
  detail,
  state,
  expandable = false,
  expanded = false,
  onToggle,
}: {
  tool: ToolCallView
  label: string
  detail: string
  state: string
  expandable?: boolean
  expanded?: boolean
  onToggle?: () => void
}) {
  const content = (
    <>
      <span className="tool-icon">
        {tool.name === "javascript_tool" ? <TerminalIcon size={13} /> : <BrowserIcon size={13} />}
      </span>
      <span>{label}</span>
      {detail ? <span className="status">{detail.slice(0, 80)}</span> : null}
      <span className="spacer" />
      <span className={`tool-status ${state === "ok" ? "ok" : state === "erro" ? "error" : "running"}`}>
        {state === "ok" ? <CheckIcon size={11} /> : state === "erro" ? <XIcon size={11} /> : null} {state}
      </span>
      {expandable ? (
        <ChevronIcon size={12} className={`chevron${expanded ? " open" : ""}`} />
      ) : null}
    </>
  )

  if (!expandable) return <div className="tool-head">{content}</div>
  return (
    <button
      type="button"
      className="tool-head tool-head-button"
      aria-expanded={expanded}
      onClick={onToggle}
    >
      {content}
    </button>
  )
}

function ToolBody({ tool }: { tool: ToolCallView }) {
  return (
    <>
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
    </>
  )
}

function firstLine(text: string): string {
  const line = text.split("\n").find((item) => item.trim()) ?? ""
  return line.length > 160 ? `${line.slice(0, 160)}…` : line
}
