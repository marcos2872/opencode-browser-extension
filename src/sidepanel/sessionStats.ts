import type { ChatMessage, ModelInfo, SessionInfo } from "../shared/types"

export interface SessionStats {
  contextUsed?: number
  contextLimit?: number
  percent?: number
  cost?: number
}

const tokenFormat = new Intl.NumberFormat("pt-BR")
const costFormat = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 4,
})

/**
 * Resumo da sessão para o rodapé do composer: tokens da última requisição
 * (preenchimento da janela), limite do modelo e custo acumulado. Quando o
 * histórico vem hidratado (sem usage por mensagem), usa o resumo da sessão.
 */
export function sessionStats(
  messages: ChatMessage[],
  model?: ModelInfo | null,
  session?: SessionInfo | null,
): SessionStats {
  let contextUsed: number | undefined
  let messageCost: number | undefined
  for (const message of messages) {
    if (message.kind !== "assistant" || !message.usage) continue
    if (typeof message.usage.cost === "number") {
      messageCost = (messageCost ?? 0) + message.usage.cost
    }
    if (typeof message.usage.input === "number") {
      contextUsed =
        message.usage.input +
        (message.usage.cacheRead ?? message.usage.cache?.read ?? 0)
    } else if (typeof message.usage.total === "number") {
      contextUsed = message.usage.total
    }
  }
  if (contextUsed === undefined && session?.tokens) {
    const tokens = session.tokens
    if (typeof tokens.input === "number") {
      contextUsed =
        tokens.input + (tokens.cacheRead ?? tokens.cache?.read ?? 0)
    } else if (typeof tokens.total === "number") {
      contextUsed = tokens.total
    }
  }
  // O custo da sessão é autoritativo; o somatório cobre runs antes do refresh.
  const cost =
    typeof session?.cost === "number" ? session.cost : messageCost
  const contextLimit = model?.limit?.context
  const percent =
    contextUsed !== undefined && contextLimit
      ? Math.min(100, Math.round((contextUsed / contextLimit) * 100))
      : undefined
  return { contextUsed, contextLimit, percent, cost }
}

export function formatTokens(value: number): string {
  return tokenFormat.format(value)
}

export function formatCost(value: number): string {
  return costFormat.format(value)
}
