import { useState } from "react"
import type { FormAnswer, FormInfo, ToolCallView } from "../shared/types"
import type { Translate } from "../shared/i18n"
import { FormCard } from "../components/FormCard"
import { BrowserIcon, CheckIcon, ChevronIcon, QuestionIcon, TerminalIcon, XIcon } from "../components/icons"
import { normalizeToolName } from "./toolNames"
import type { Catalog } from "../shared/i18n"
import { useI18n } from "../shared/i18n/react"

/** Tool → chave do catálogo; `undefined` mostra o nome cru. */
const LABELS: Partial<Record<string, keyof Catalog>> = {
  tabs_context: "tool.tabs_context",
  tabs_create: "tool.tabs_create",
  tabs_close: "tool.tabs_close",
  tabs_attach: "tool.tabs_attach",
  navigate: "tool.navigate",
  read_page: "tool.read_page",
  find: "tool.find",
  get_page_text: "tool.get_page_text",
  form_input: "tool.form_input",
  computer: "tool.computer",
  javascript_tool: "tool.javascript_tool",
  read_console_messages: "tool.read_console_messages",
  read_network_requests: "tool.read_network_requests",
  resize_window: "tool.resize_window",
  update_plan: "tool.update_plan",
  upload_image: "tool.upload_image",
  gif_creator: "tool.gif_creator",
  browser_batch: "tool.browser_batch",
  batch: "tool.batch",
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

export function toolLabel(tool: ToolCallView, t: Translate): string {
  const name = normalizeToolName(tool.name)
  const key = LABELS[name]
  return key ? t(key) : tool.name
}

export function toolSummary(tool: ToolCallView, t: Translate): string {
  return summary(tool, t)
}

export function toolStatus(tool: ToolCallView, t: Translate): string {
  return statusLabel(tool, t)
}

function summary(tool: ToolCallView, t: Translate): string {
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
  if (typeof input.tabId === "number") return t("tool.tabRef", { id: input.tabId })
  if (Array.isArray(input.domains)) return input.domains.join(", ")
  if (Array.isArray(input.actions)) return t("tool.actionsCount", { count: input.actions.length })
  return ""
}

function statusLabel(tool: ToolCallView, t: Translate): string {
  if (tool.status === "ok") return t("tool.status.ok")
  if (tool.status === "error") return t("tool.status.error")
  return t("tool.status.running")
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
  const { t } = useI18n()
  return (
    <div className="tool-card tool-card-question">
      <div className="tool-head">
        <span className="tool-icon">
          <QuestionIcon size={13} />
        </span>
        <span>{form.title && form.title !== "Questions" ? form.title : t("form.question")}</span>
        <span className="spacer" />
        <span className="tool-status running">{t("tool.status.waiting")}</span>
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
  const { t } = useI18n()
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

  const label = statusLabel(tool, t)
  const questions = readQuestions(tool.input)

  return (
    <div className="tool-card tool-card-question">
      <div className="tool-head">
        <span className="tool-icon">
          <QuestionIcon size={13} />
        </span>
        <span>{t("tool.question")}</span>
        <span className="spacer" />
        <span
          className={`tool-status ${
            tool.status === "ok" ? "ok" : tool.status === "error" ? "error" : "running"
          }`}
        >
          {tool.status === "ok" ? <CheckIcon size={11} /> : tool.status === "error" ? <XIcon size={11} /> : null} {label}
        </span>
      </div>

      {questions.length ? (
        <ul className="question-list">
          {questions.map((item, index) => (
            <li key={index}>
              {item.header ? <strong>{item.header}</strong> : null}
              <span>
                {item.question}
                {item.multiple ? <em className="question-multiple">{t("tool.multipleChoice")}</em> : null}
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
  const { t } = useI18n()
  const [expanded, setExpanded] = useState(false)

  if (normalizeToolName(tool.name) === "question") {
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

  const name = normalizeToolName(tool.name)
  const labelKey = LABELS[name]
  const label = labelKey ? t(labelKey) : tool.name
  const detail = summary(tool, t)
  const state = statusLabel(tool, t)
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
        {normalizeToolName(tool.name) === "javascript_tool" ? (
          <TerminalIcon size={13} />
        ) : (
          <BrowserIcon size={13} />
        )}
      </span>
      <span>{label}</span>
      {detail ? <span className="status">{detail.slice(0, 80)}</span> : null}
      <span className="spacer" />
      <span
        className={`tool-status ${
          tool.status === "ok" ? "ok" : tool.status === "error" ? "error" : "running"
        }`}
      >
        {tool.status === "ok" ? <CheckIcon size={11} /> : tool.status === "error" ? <XIcon size={11} /> : null} {state}
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

export function ToolBody({ tool }: { tool: ToolCallView }) {
  const { t } = useI18n()
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
          <summary className="sub">{t("tool.params")}</summary>
          <div className="tool-args">{JSON.stringify(tool.input, null, 2)}</div>
        </details>
      ) : null}

      {tool.output ? (
        <details open={tool.status === "error"}>
          <summary className="sub">{t("tool.result")}</summary>
          <div className="tool-output">{tool.output}</div>
        </details>
      ) : null}
    </>
  )
}

export function firstLine(text: string): string {
  const line = text.split("\n").find((item) => item.trim()) ?? ""
  return line.length > 160 ? `${line.slice(0, 160)}…` : line
}
