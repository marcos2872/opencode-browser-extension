import type { OpencodeEvent } from "../../shared/protocol"

/**
 * Minimal SSE parser for the OpenCode `/api/event` stream.
 * Yields one parsed JSON payload per `data:` frame.
 */
export async function* parseSse(
  stream: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): AsyncGenerator<OpencodeEvent> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      let boundary = buffer.indexOf("\n\n")
      while (boundary !== -1) {
        const frame = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        const event = parseFrame(frame)
        if (event) yield event
        boundary = buffer.indexOf("\n\n")
      }
    }
  } finally {
    reader.releaseLock()
  }
}

function parseFrame(frame: string): OpencodeEvent | null {
  const data: string[] = []
  for (const line of frame.split("\n")) {
    if (line.startsWith("data:")) data.push(line.slice(5).trimStart())
  }
  if (data.length === 0) return null
  const text = data.join("\n")
  try {
    const parsed = JSON.parse(text) as OpencodeEvent
    if (parsed && typeof parsed.type === "string") return parsed
  } catch {
    // Ignore malformed keepalive frames.
  }
  return null
}
