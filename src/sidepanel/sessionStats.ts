import type { ChatMessage, ModelInfo } from "../shared/types"

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
 * (preenchimento da janela), limite do modelo e custo acumulado.
 */
export function sessionStats(
  messages: ChatMessage[],
  model?: ModelInfo | null,
): SessionStats {
  let contextUsed: number | undefined
  let cost: number | undefined
  for (const message of messages) {
    if (message.kind !== "assistant" || !message.usage) continue
    if (typeof message.usage.cost === "number") {
      cost = (cost ?? 0) + message.usage.cost
    }
    if (typeof message.usage.input === "number") {
      contextUsed = message.usage.input
    } else if (typeof message.usage.total === "number") {
      contextUsed = message.usage.total
    }
  }
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
