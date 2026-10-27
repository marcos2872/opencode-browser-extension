import type { ChatMessage, ModelInfo, SessionInfo, TokenUsage } from "../shared/types"

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
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
})

/**
 * Resumo da sessão para o rodapé do composer: tokens da última requisição
 * (preenchimento da janela), limite do modelo e custo acumulado.
 *
 * O `contextUsage` vem da API (última mensagem do assistente) e é a fonte
 * autoritativa; o usage das mensagens ao vivo pode ficar parcial durante o
 * streaming e por isso só é usado como fallback.
 */
export function sessionStats(
  messages: ChatMessage[],
  model?: ModelInfo | null,
  session?: SessionInfo | null,
  contextUsage?: TokenUsage,
): SessionStats {
  let messageContext: number | undefined
  let messageCost: number | undefined
  for (const message of messages) {
    if (message.kind !== "assistant" || !message.usage) continue
    if (typeof message.usage.cost === "number") {
      messageCost = (messageCost ?? 0) + message.usage.cost
    }
    messageContext = usageContext(message.usage) ?? messageContext
  }
  const contextUsed = usageContext(contextUsage) ?? messageContext
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

function usageContext(usage?: TokenUsage): number | undefined {
  if (!usage) return undefined
  if (typeof usage.input === "number") {
    return usage.input + (usage.cacheRead ?? usage.cache?.read ?? 0)
  }
  if (typeof usage.total === "number") return usage.total
  return undefined
}

export function formatTokens(value: number): string {
  return tokenFormat.format(value)
}

export function formatCost(value: number): string {
  return costFormat.format(value)
}
