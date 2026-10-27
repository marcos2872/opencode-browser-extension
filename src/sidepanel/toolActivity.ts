import type { ChatMessage, ToolCallView } from "../shared/types"

function text(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined
}

function computerActivity(input: Record<string, unknown>): string {
  switch (text(input.action)) {
    case "click":
      return "clicando"
    case "type":
      return "digitando"
    case "key":
      return "pressionando teclas"
    case "scroll":
      return "rolando a página"
    case "hover":
      return "passando o mouse"
    case "screenshot":
      return "capturando a tela"
    case "zoom":
      return "ampliando a tela"
    case "wait":
      return "aguardando"
    default:
      return "interagindo com a página"
  }
}

/** Frase curta, no gerúndio, para o indicador de trabalho. */
export function toolActivity(tool: ToolCallView): string {
  const input = (tool.input ?? {}) as Record<string, unknown>
  switch (tool.name) {
    case "navigate":
      if (text(input.direction) === "back") return "voltando uma página"
      if (text(input.direction) === "forward") return "avançando uma página"
      return "navegando"
    case "read_page":
      return "lendo a página"
    case "get_page_text":
      return "lendo o texto da página"
    case "find":
      return "procurando na página"
    case "form_input":
      return "preenchendo um campo"
    case "computer":
      return computerActivity(input)
    case "tabs_context":
      return "verificando as abas"
    case "tabs_create":
      return "abrindo uma aba"
    case "tabs_close":
      return "fechando uma aba"
    case "tabs_attach":
      return "conectando a aba"
    case "javascript_tool":
      return "executando script"
    case "read_console_messages":
      return "lendo o console"
    case "read_network_requests":
      return "verificando a rede"
    case "resize_window":
      return "redimensionando a janela"
    case "update_plan":
      return "planejando os próximos passos"
    case "browser_batch":
      return "executando ações"
    case "upload_image":
      return "enviando um arquivo"
    case "gif_creator":
      return "gravando a tela"
    case "question":
      return "aguardando sua resposta"
    default:
      return "trabalhando"
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
export function activityLabel(messages: ChatMessage[]): string {
  const run = currentRun(messages)
  const tools = run.flatMap((message) =>
    message.kind === "assistant" ? message.tools : [],
  )
  const running = [...tools].reverse().find((tool) => tool.status === "running")
  if (running) return toolActivity(running)

  const last = run.at(-1)
  if (last?.kind === "assistant" && last.streaming && last.text.trim()) {
    return "escrevendo a resposta"
  }

  const lastTool = tools.at(-1)
  return lastTool ? toolActivity(lastTool) : "trabalhando"
}
