import type { TokenUsage } from "../../shared/types";

/**
 * Normaliza o usage de uma mensagem do OpenCode. Aceita `tokens`/`cost` no
 * próprio objeto ou aninhados em `usage`, e achata o cache em `cacheRead`.
 */
export function messageUsage(
  message: Record<string, unknown>,
): TokenUsage | undefined {
  const nestedUsage =
    message.usage && typeof message.usage === "object"
      ? (message.usage as Record<string, unknown>)
      : undefined;
  const tokens =
    message.tokens && typeof message.tokens === "object"
      ? (message.tokens as Record<string, unknown>)
      : nestedUsage?.tokens && typeof nestedUsage.tokens === "object"
        ? (nestedUsage.tokens as Record<string, unknown>)
        : (nestedUsage ?? message);
  const cache =
    tokens?.cache && typeof tokens.cache === "object"
      ? (tokens.cache as Record<string, unknown>)
      : undefined;
  const usage: TokenUsage = {};
  for (const key of ["total", "input", "output", "reasoning"] as const) {
    if (typeof tokens?.[key] === "number") usage[key] = tokens[key] as number;
  }
  if (typeof cache?.read === "number") usage.cacheRead = cache.read;
  if (typeof cache?.write === "number") usage.cacheWrite = cache.write;
  const cost = message.cost ?? nestedUsage?.cost;
  if (typeof cost === "number") usage.cost = cost;
  return Object.keys(usage).length > 0 ? usage : undefined;
}
