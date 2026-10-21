import { Plugin } from "@opencode/plugin"

/**
 * Ponte entre o OpenCode e a extensão OpenCode Browser.
 *
 * A extensão conecta em ws://127.0.0.1:8799. Quando o modelo chama uma tool
 * `browser_*`, este plugin envia um `tool_request` e espera o `tool_result`.
 */

const PORT = Number(process.env.OPENCODE_BROWSER_RELAY_PORT ?? 8799)
const EXPECTED_EXTENSION_ID =
  process.env.OPENCODE_BROWSER_EXTENSION_ID ?? "meapihkmghapjefepmkckpikedpimhin"
const ALLOW_ANY_EXTENSION = process.env.OPENCODE_BROWSER_ALLOW_ANY_EXTENSION === "1"
const CALL_TIMEOUT_MS = 180_000

type ImagePayload = { name: string; mime: string; data: string }

type ToolResponse = {
  ok: boolean
  content?: string
  images?: ImagePayload[]
  error?: string
  metadata?: Record<string, unknown>
}

type Progress = (update: Record<string, unknown>) => Promise<void>

type Socket = {
  data: SocketData
  send(data: string): void
  close(code?: number, reason?: string): void
}

type Pending = {
  socket: Socket
  resolve: (value: ToolResponse) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
  progress?: Progress
}

type SocketData = { origin: string; id: string }

let active: Socket | null = null
const pending = new Map<string, Pending>()

function log(message: string, error?: unknown): void {
  const suffix = error instanceof Error ? `: ${error.message}` : error ? `: ${String(error)}` : ""
  console.error(`[opencode-browser] ${message}${suffix}`)
}

function isAllowedOrigin(origin: string): boolean {
  if (!origin.startsWith("chrome-extension://")) return false
  if (ALLOW_ANY_EXTENSION) return true
  return origin === `chrome-extension://${EXPECTED_EXTENSION_ID}`
}

function send(socket: Socket | null, payload: unknown): boolean {
  if (!socket) return false
  try {
    socket.send(JSON.stringify(payload))
    return true
  } catch {
    return false
  }
}

function failPending(socket: Socket, reason: string): void {
  for (const [id, item] of pending) {
    if (item.socket !== socket) continue
    clearTimeout(item.timer)
    pending.delete(id)
    item.reject(new Error(reason))
  }
}

function callTool(
  tool: string,
  args: Record<string, unknown>,
  context: { sessionID: string; signal: AbortSignal; progress: Progress },
): Promise<ToolResponse> {
  if (!active) {
    throw new Error(
      "A extensão OpenCode Browser não está conectada. Abra o side panel da extensão no Chrome e verifique o status do plugin.",
    )
  }
  const id = `call_${crypto.randomUUID()}`
  const socket = active

  return new Promise<ToolResponse>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      send(socket, { type: "cancel", id })
      reject(new Error(`A extensão não respondeu em ${CALL_TIMEOUT_MS / 1000}s.`))
    }, CALL_TIMEOUT_MS)

    pending.set(id, {
      socket,
      resolve,
      reject,
      timer,
      progress: context.progress,
    })

    const onAbort = () => {
      const item = pending.get(id)
      if (!item) return
      pending.delete(id)
      clearTimeout(item.timer)
      send(socket, { type: "cancel", id })
      reject(new Error("Execução cancelada."))
    }
    context.signal.addEventListener("abort", onAbort, { once: true })

    const sent = send(socket, {
      type: "tool_request",
      id,
      tool,
      args,
      sessionID: context.sessionID,
    })
    if (!sent) {
      pending.delete(id)
      clearTimeout(timer)
      reject(new Error("Falha ao enviar o pedido para a extensão."))
    }
  })
}

function buildContent(result: ToolResponse) {
  const text = result.content?.trim() || "(sem saída)"
  // O OpenCode aceita bytes em base64 no campo `uri` de Tool.FileContent.
  const images = (result.images ?? []).slice(0, 3).map((image) => ({
    type: "file" as const,
    uri: image.data,
    mime: image.mime,
    name: image.name,
  }))
  if (images.length === 0) return text
  return [{ type: "text" as const, text }, ...images]
}

// ---------------------------------------------------------------------------
// Especificações das tools (JSON Schema)
// ---------------------------------------------------------------------------

const tabId = { type: "number", description: "ID da aba dentro do grupo desta sessão." }

const tools = [
  {
    name: "tabs_context",
    description:
      "Lista as abas do grupo desta sessão. Use antes de qualquer ferramenta que exija tabId. Se não houver grupo, use createIfEmpty.",
    input: {
      type: "object",
      properties: {
        createIfEmpty: { type: "boolean", description: "Cria um grupo/aba se ainda não existir." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "tabs_create",
    description: "Cria uma nova aba dentro do grupo desta sessão e devolve o tabId.",
    input: {
      type: "object",
      properties: { url: { type: "string" }, active: { type: "boolean" } },
      additionalProperties: false,
    },
  },
  {
    name: "tabs_attach",
    description:
      "Move uma aba existente (informada por tabId ou a aba ativa do navegador) para o grupo desta sessão, dando ao agente acesso ao que já está aberto. Pede permissão. A aba sai do grupo atual do usuário.",
    input: {
      type: "object",
      properties: { tabId },
      additionalProperties: false,
    },
  },
  {
    name: "tabs_close",
    description: "Fecha uma aba do grupo desta sessão.",
    input: { type: "object", properties: { tabId }, required: ["tabId"], additionalProperties: false },
  },
  {
    name: "navigate",
    description:
      "Navega para uma URL ou vai para trás/frente no histórico. Pede permissão para domínios novos.",
    input: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL absoluta ou domínio; https:// é adicionado se faltar." },
        direction: { type: "string", enum: ["back", "forward"] },
        tabId,
      },
      additionalProperties: false,
    },
  },
  {
    name: "read_page",
    description:
      "Retorna a árvore de acessibilidade da página com refs (ref_1, ref_2...). Use as refs em computer/form_input/find. Com frames=all, refs de iframes vêm prefixadas como f<frameId>_ref_N.",
    input: {
      type: "object",
      properties: {
        filter: { type: "string", enum: ["interactive", "all"] },
        depth: { type: "number" },
        ref_id: { type: "string" },
        max_chars: { type: "number" },
        include_hidden: { type: "boolean" },
        frames: { type: "string", enum: ["main", "all"] },
        tabId,
      },
      additionalProperties: false,
    },
  },
  {
    name: "find",
    description:
      "Busca heurística por elementos usando texto/role/nome. Retorna até 20 refs. Prefira read_page filter=interactive para páginas grandes.",
    input: {
      type: "object",
      properties: {
        query: { type: "string" },
        max_results: { type: "number" },
        frames: { type: "string", enum: ["main", "all"] },
        tabId,
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "get_page_text",
    description: "Extrai o texto principal da página (artigo/main/body), sem HTML. Com frames=all, concatena também o texto dos iframes.",
    input: {
      type: "object",
      properties: { max_chars: { type: "number" }, frames: { type: "string", enum: ["main", "all"] }, tabId },
      additionalProperties: false,
    },
  },
  {
    name: "form_input",
    description: "Preenche um campo identificado por ref (input, textarea, select ou contenteditable).",
    input: {
      type: "object",
      properties: { ref: { type: "string" }, value: { type: "string" }, tabId },
      required: ["ref", "value"],
      additionalProperties: false,
    },
  },
  {
    name: "computer",
    description:
      "Interage com a página via eventos confiáveis: click, type, key, scroll, hover, screenshot, zoom e wait. Use ref de read_page/find ou coordinate [x,y]. Refs de iframe (f<id>_ref_N) funcionam para click/hover/scroll/type via eventos de DOM.",
    input: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["click", "type", "key", "scroll", "hover", "screenshot", "zoom", "wait"],
        },
        ref: { type: "string" },
        coordinate: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 },
        text: { type: "string" },
        keys: { type: "string", description: "Ex.: Enter, Tab, Ctrl+A." },
        submit: { type: "boolean" },
        click_count: { type: "number" },
        button: { type: "string", enum: ["left", "right", "middle"] },
        scroll_direction: { type: "string", enum: ["up", "down", "left", "right"] },
        scroll_amount: { type: "number" },
        duration: { type: "number", description: "Segundos para action=wait (máx. 10)." },
        region: { type: "array", items: { type: "number" }, minItems: 4, maxItems: 4 },
        tabId,
      },
      required: ["action"],
      additionalProperties: false,
    },
  },
  {
    name: "javascript_tool",
    description:
      "Executa JavaScript no contexto da página. Retorna o valor da última expressão. Pede permissão e corta a saída em 50 KB.",
    input: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["javascript_exec"] },
        text: { type: "string", description: "Código JavaScript." },
        tabId,
      },
      required: ["text"],
      additionalProperties: false,
    },
  },
  {
    name: "read_console_messages",
    description:
      "Lê mensagens de console/erros da aba. O monitoramento começa quando a ferramenta é usada; recarregue a página para capturar o carregamento.",
    input: {
      type: "object",
      properties: {
        pattern: { type: "string" },
        onlyErrors: { type: "boolean" },
        limit: { type: "number" },
        clear: { type: "boolean" },
        tabId,
      },
      additionalProperties: false,
    },
  },
  {
    name: "read_network_requests",
    description:
      "Lê requisições de rede (XHR/fetch/documentos) da aba. O monitoramento começa quando a ferramenta é usada.",
    input: {
      type: "object",
      properties: {
        urlPattern: { type: "string" },
        limit: { type: "number" },
        clear: { type: "boolean" },
        tabId,
      },
      additionalProperties: false,
    },
  },
  {
    name: "resize_window",
    description: "Redimensiona a janela da aba para testar layouts responsivos.",
    input: {
      type: "object",
      properties: { width: { type: "number" }, height: { type: "number" }, tabId },
      required: ["width", "height"],
      additionalProperties: false,
    },
  },
  {
    name: "update_plan",
    description:
      "Apresenta um plano de navegação (domínios + passos) para aprovação. Os domínios aprovados ficam liberados nesta sessão.",
    input: {
      type: "object",
      properties: {
        domains: { type: "array", items: { type: "string" } },
        approach: { type: "array", items: { type: "string" } },
      },
      required: ["domains", "approach"],
      additionalProperties: false,
    },
  },
  {
    name: "upload_image",
    description:
      "Envia arquivos (bytes em base64) para um input[type=file] ou área de drag & drop identificada por ref. Pede permissão. Máximo de 3 arquivos e ~5 MB cada.",
    input: {
      type: "object",
      properties: {
        ref: { type: "string", description: "Ref do input de arquivo ou do alvo de drop." },
        files: {
          type: "array",
          minItems: 1,
          maxItems: 3,
          items: {
            type: "object",
            properties: {
              data: { type: "string", description: "Bytes do arquivo em base64." },
              name: { type: "string" },
              mimeType: { type: "string" },
            },
            required: ["data", "name"],
            additionalProperties: false,
          },
        },
        tabId,
      },
      required: ["ref", "files"],
      additionalProperties: false,
    },
  },
  {
    name: "browser_batch",
    description: "Executa até 20 ferramentas browser_* em sequência. Use para reduzir idas e voltas.",
    input: {
      type: "object",
      properties: {
        actions: {
          type: "array",
          minItems: 1,
          maxItems: 20,
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              input: { type: "object" },
            },
            required: ["name", "input"],
            additionalProperties: false,
          },
        },
      },
      required: ["actions"],
      additionalProperties: false,
    },
  },
] as const

export default Plugin.define({
  id: "opencode.browser-relay",
  async setup(ctx) {
    let server: { stop(force?: boolean): void } | null = null
    try {
      server = Bun.serve<SocketData>({
        hostname: "127.0.0.1",
        port: PORT,
        fetch(request, bunServer) {
          const url = new URL(request.url)
          if (url.pathname !== "/" && url.pathname !== "/ws") {
            return new Response("Not found", { status: 404 })
          }
          const origin = request.headers.get("origin") ?? ""
          if (!isAllowedOrigin(origin)) {
            return new Response("Forbidden origin", { status: 403 })
          }
          const upgraded = bunServer.upgrade(request, {
            data: { origin, id: crypto.randomUUID() },
          })
          if (!upgraded) return new Response("WebSocket upgrade failed", { status: 400 })
          return undefined
        },
        websocket: {
          open(socket) {
            if (active && active !== socket) {
              try {
                active.close(1000, "Nova conexão da extensão")
              } catch {
                // ignore
              }
            }
            active = socket
            log(`extensão conectada (${socket.data.origin})`)
            send(socket, { type: "ready", v: 1 })
          },
          message(socket, raw) {
            if (typeof raw !== "string") return
            let message: Record<string, unknown>
            try {
              message = JSON.parse(raw) as Record<string, unknown>
            } catch {
              return
            }
            if (message.type === "hello") {
              if (!ALLOW_ANY_EXTENSION && message.extensionId !== EXPECTED_EXTENSION_ID) {
                socket.close(1008, "Extensão não autorizada")
                return
              }
              return
            }
            if (message.type === "pong") return
            if (message.type === "progress" && typeof message.id === "string") {
              const item = pending.get(message.id)
              if (item?.progress) {
                void item.progress({
                  phase: message.phase ?? "running",
                  detail: message.detail,
                })
              }
              return
            }
            if (message.type === "tool_result" && typeof message.id === "string") {
              const item = pending.get(message.id)
              if (!item) return
              pending.delete(message.id)
              clearTimeout(item.timer)
              if (message.ok === false) {
                item.reject(new Error(typeof message.error === "string" ? message.error : "A extensão retornou um erro."))
                return
              }
              item.resolve({
                ok: true,
                content: typeof message.content === "string" ? message.content : undefined,
                images: Array.isArray(message.images) ? (message.images as ImagePayload[]) : undefined,
                metadata:
                  message.metadata && typeof message.metadata === "object"
                    ? (message.metadata as Record<string, unknown>)
                    : undefined,
              })
            }
          },
          close(socket) {
            if (active === socket) active = null
            failPending(socket, "A extensão desconectou durante a execução.")
            log("extensão desconectada")
          },
        },
      })
      log(`relay ouvindo em ws://127.0.0.1:${PORT}`)
    } catch (error) {
      log(`não foi possível abrir o relay na porta ${PORT}`, error)
    }

    await ctx.tool.transform((editor) => {
      editor.namespace({
        name: "browser",
        description:
          "Controla o Chrome através da extensão OpenCode Browser (abas, acessibilidade, cliques, screenshots, console e rede).",
      })
      for (const spec of tools) {
        editor.add({
          name: spec.name,
          description: spec.description,
          input: spec.input,
          options: { namespace: "browser", codemode: false },
          execute: async (input: unknown, context: { sessionID: string; signal: AbortSignal; progress: Progress }) => {
            const args =
              input && typeof input === "object" && !Array.isArray(input)
                ? (input as Record<string, unknown>)
                : {}
            const result = await callTool(spec.name, args, {
              sessionID: context.sessionID,
              signal: context.signal,
              progress: context.progress,
            })
            return {
              content: buildContent(result),
              metadata: result.metadata,
            }
          },
        })
      }
    })

    return () => {
      for (const [id, item] of pending) {
        clearTimeout(item.timer)
        pending.delete(id)
        item.reject(new Error("O plugin do OpenCode foi encerrado."))
      }
      try {
        server?.stop(true)
      } catch {
        // ignore
      }
      active = null
    }
  },
})
