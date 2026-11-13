/** Rótulo inicial do overlay, antes de a primeira tool informar o status. */
export const INDICATOR_DEFAULT_STATUS = "OpenCode está nesta aba"

/** Duração da viagem do mouse virtual; o clique real espera esse tempo. */
export const INDICATOR_MOVE_MS = 320

/** Quanto tempo o cursor fica visível depois da última ação de mouse. */
export const INDICATOR_CURSOR_IDLE_MS = 3_000

/**
 * Rede de segurança do content script: se o service worker sumir sem mandar
 * `indicator:hide`, o overlay se apaga sozinho depois desse tempo sem mensagens.
 */
export const INDICATOR_WATCHDOG_MS = 120_000
