import type { UiRequest, UiResponse } from "../shared/protocol"
import { t } from "../shared/i18n/runtime"

export async function request(message: UiRequest): Promise<UiResponse> {
  try {
    const response = (await chrome.runtime.sendMessage(message)) as UiResponse | undefined
    if (!response) return { ok: false, error: t("background.swSilent") }
    return response
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}
