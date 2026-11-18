import type { ChatMessage, ToolCallView } from "../shared/types"
import { normalizeToolName } from "./toolNames"
import type { Translate } from "../shared/i18n"
import { messages as translatorFor } from "../shared/i18n"
import type { Locale } from "../shared/i18n"
import { currentLocale } from "../shared/i18n/runtime"

function text(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
}

function computerActivity(
  input: Record<string, unknown>,
  t: Translate,
): string {
  switch (text(input.action)) {
    case "click":
      return t("activity.clicking")
    case "type":
      return t("activity.typing")
    case "key":
      return t("activity.pressingKeys")
    case "scroll":
      return t("activity.scrolling")
    case "hover":
      return t("activity.hovering")
    case "screenshot":
      return t("activity.screenshot")
    case "zoom":
      return t("activity.zoom")
    case "wait":
      return t("activity.waiting")
    default:
      return t("activity.interacting")
  }
}

/** Frase curta, no gerúndio, para o indicador de trabalho. */
export function toolActivity(
  tool: ToolCallView,
  locale: Locale = currentLocale(),
): string {
  const t = translatorFor(locale)
  const input = (tool.input ?? {}) as Record<string, unknown>
  switch (normalizeToolName(tool.name)) {
    case "navigate":
      if (text(input.direction) === "back") return t("activity.back")
      if (text(input.direction) === "forward") return t("activity.forward")
      return t("activity.navigating")
    case "read_page":
      return t("activity.readingPage")
    case "get_page_text":
      return t("activity.readingText")
    case "find":
      return t("activity.finding")
    case "form_input":
      return t("activity.filling")
    case "computer":
      return computerActivity(input, t)
    case "tabs_context":
      return t("activity.tabsContext")
    case "tabs_create":
      return t("activity.tabOpening")
    case "tabs_close":
      return t("activity.tabClosing")
    case "tabs_attach":
      return t("activity.tabAttaching")
    case "javascript_tool":
      return t("activity.script")
    case "read_console_messages":
      return t("activity.console")
    case "read_network_requests":
      return t("activity.network")
    case "resize_window":
      return t("activity.resizing")
    case "update_plan":
      return t("activity.planning")
    case "browser_batch":
    case "batch":
      return t("activity.batch")
    case "upload_image":
      return t("activity.uploading")
    case "gif_creator":
      return t("activity.recording")
    case "question":
      return t("activity.question")
    default:
      return t("activity.working")
  }
}

/** Mensagens do run atual (depois da última mensagem do usuário). */
function currentRun(messages: ChatMessage[]): ChatMessage[] {
  let start = 0
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].kind === "user") {
      start = index + 1
      break
    }
  }
  return messages.slice(start)
}

/**
 * Texto do indicador: a tool em execução agora; se não houver, a última usada
 * no run; se o modelo está escrevendo a resposta, "escrevendo a resposta".
 */
export function activityLabel(
  messages: ChatMessage[],
  locale: Locale = currentLocale(),
): string {
  const t = translatorFor(locale)
  const run = currentRun(messages)
  const tools = run.flatMap((message) =>
    message.kind === "assistant" ? message.tools : [],
  )
  const running = [...tools].reverse().find((tool) => tool.status === "running")
  if (running) return toolActivity(running, locale)

  const last = run.at(-1)
  if (last?.kind === "assistant" && last.streaming) {
    return last.text.trim() ? t("activity.writing") : t("activity.thinking")
  }

  const lastTool = tools.at(-1)
  return lastTool ? toolActivity(lastTool, locale) : t("activity.working")
}

/** Texto completo do indicador, já com o prefixo "trabalhando:". */
export function activityText(
  messages: ChatMessage[],
  locale: Locale = currentLocale(),
): string {
  const t = translatorFor(locale)
  const label = activityLabel(messages, locale)
  if (label === t("activity.working") || label === t("activity.thinking")) return label
  return t("activity.prefix", { detail: label })
}
