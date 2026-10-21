import type { UiRequest, UiResponse } from "../shared/protocol"

export async function request(message: UiRequest): Promise<UiResponse> {
  try {
    const response = (await chrome.runtime.sendMessage(message)) as UiResponse | undefined
    if (!response) return { ok: false, error: "O service worker não respondeu." }
    return response
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}
