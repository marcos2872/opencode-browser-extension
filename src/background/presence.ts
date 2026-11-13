/**
 * Presença visual do agente nas abas: borda animada, rótulo "Parar" e cursor
 * virtual. O estado vive aqui (e não no content script) porque o overlay some
 * quando a página navega e precisa ser reenviado.
 *
 * Diferente do comportamento antigo (mostrar/esconder a cada ação), o overlay
 * permanece enquanto o agente está trabalhando e só some depois de um tempo sem
 * atividade, ao terminar a sessão ou quando o usuário clica em Parar.
 */

import {
  INDICATOR_DEFAULT_STATUS,
  INDICATOR_MOVE_MS,
} from "../shared/indicator"

export type PresenceMessage =
  | { type: "indicator:show" }
  | { type: "indicator:hide" }
  | { type: "indicator:status"; text: string; busy: boolean }
  | { type: "indicator:cursor"; x: number; y: number }
  | { type: "indicator:click"; x: number; y: number }

/** Envia a mensagem para a aba; devolve `false` se não havia content script. */
export type PresenceSend = (tabId: number, message: PresenceMessage) => Promise<boolean>

export interface PresenceOptions {
  send: PresenceSend
  /** Diz se a sessão ainda está executando (mantém o overlay durante o "pensar"). */
  isBusy?: (sessionID: string) => boolean
  /** Tempo sem atividade antes de esconder, com a sessão ociosa. */
  idleMs?: number
  /** Tempo sem atividade antes de esconder, enquanto a sessão está ocupada. */
  busyMs?: number
  /** Duração da viagem do cursor; o clique espera esse tempo. */
  moveMs?: number
  /** Aba com `prefers-reduced-motion`: o clique não espera a animação. */
  isReducedMotion?: (tabId: number) => boolean
  sleep?: (ms: number) => Promise<void>
}

interface CursorPoint {
  x: number
  y: number
  at: number
}

interface Entry {
  sessionID: string | null
  status: string
  busy: boolean
  timer: ReturnType<typeof setTimeout> | null
  lastPoint: CursorPoint | null
}

export const DEFAULT_STATUS = INDICATOR_DEFAULT_STATUS

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export class Presence {
  private readonly entries = new Map<number, Entry>()
  private readonly send: PresenceSend
  private readonly isBusy: (sessionID: string) => boolean
  private readonly idleMs: number
  private readonly busyMs: number
  private readonly moveMs: number
  private readonly isReducedMotion: (tabId: number) => boolean
  private readonly sleep: (ms: number) => Promise<void>

  constructor(options: PresenceOptions) {
    this.send = options.send
    this.isBusy = options.isBusy ?? (() => false)
    this.idleMs = options.idleMs ?? 2500
    this.busyMs = options.busyMs ?? 20_000
    this.moveMs = options.moveMs ?? INDICATOR_MOVE_MS
    this.isReducedMotion = options.isReducedMotion ?? (() => false)
    this.sleep = options.sleep ?? defaultSleep
  }

  /** Mostra (ou atualiza) o overlay da aba e cancela qualquer saída agendada. */
  async show(tabId: number, status: string, busy = true, sessionID: string | null = null): Promise<void> {
    const entry = this.touch(tabId, sessionID)
    entry.status = status
    entry.busy = busy
    await this.send(tabId, { type: "indicator:show" })
    await this.send(tabId, { type: "indicator:status", text: status, busy })
  }

  /** A ação terminou: agenda a saída em vez de esconder na hora (evita piscar). */
  release(tabId: number): void {
    const entry = this.entries.get(tabId)
    if (!entry) return
    entry.busy = false
    void this.send(tabId, { type: "indicator:status", text: entry.status, busy: false })
    this.schedule(tabId, entry)
  }

  /**
   * Move o cursor virtual. Com `click`, espera a viagem terminar e dispara a
   * animação de clique, para que o clique real caia junto com ela.
   */
  async cursor(tabId: number, x: number, y: number, sessionID: string | null = null, click = false): Promise<void> {
    const known = this.entries.has(tabId)
    const entry = this.touch(tabId, sessionID)
    if (!known) {
      entry.status = DEFAULT_STATUS
      entry.busy = true
      await this.send(tabId, { type: "indicator:show" })
      await this.send(tabId, { type: "indicator:status", text: entry.status, busy: true })
    }
    try {
      const delivered = await this.send(tabId, { type: "indicator:cursor", x, y })
      if (!delivered) return
      const previous = entry.lastPoint
      const elapsed =
        previous && previous.x === x && previous.y === y
          ? Date.now() - previous.at
          : 0
      // Reduced motion desliga a transição no CSS; não faz sentido esperar.
      const wait = this.isReducedMotion(tabId)
        ? 0
        : Math.max(0, this.moveMs - elapsed)
      entry.lastPoint = { x, y, at: Date.now() }
      if (wait > 0) await this.sleep(wait)
      if (click) await this.send(tabId, { type: "indicator:click", x, y })
    } finally {
      // Ações sem release (hover) também precisam acabar saindo da aba.
      const current = this.entries.get(tabId)
      if (current) this.schedule(tabId, current)
    }
  }

  /** Reenvia o overlay depois de uma navegação (o content script recomeça do zero). */
  async restore(tabId: number): Promise<void> {
    const entry = this.entries.get(tabId)
    if (!entry) return
    await this.send(tabId, { type: "indicator:show" })
    await this.send(tabId, { type: "indicator:status", text: entry.status, busy: entry.busy })
  }

  /** Esconde na hora (Parar, sessão terminada, aba fechada). */
  async hide(tabId: number): Promise<void> {
    const entry = this.entries.get(tabId)
    if (!entry) return
    this.forget(tabId)
    await this.send(tabId, { type: "indicator:hide" })
  }

  async hideSession(sessionID: string): Promise<void> {
    const targets = [...this.entries.entries()].filter(([, entry]) => entry.sessionID === sessionID)
    await Promise.all(targets.map(([tabId]) => this.hide(tabId)))
  }

  async hideAll(): Promise<void> {
    await Promise.all([...this.entries.keys()].map((tabId) => this.hide(tabId)))
  }

  /** Esquece a aba sem enviar nada (aba fechada). */
  forget(tabId: number): void {
    const entry = this.entries.get(tabId)
    if (entry?.timer) clearTimeout(entry.timer)
    this.entries.delete(tabId)
  }

  has(tabId: number): boolean {
    return this.entries.has(tabId)
  }

  private touch(tabId: number, sessionID: string | null): Entry {
    let entry = this.entries.get(tabId)
    if (!entry) {
      entry = {
        sessionID,
        status: DEFAULT_STATUS,
        busy: true,
        timer: null,
        lastPoint: null,
      }
      this.entries.set(tabId, entry)
    }
    if (sessionID) entry.sessionID = sessionID
    // Atividade nova: a saída agendada deixa de valer e é reprogramada no release().
    if (entry.timer) {
      clearTimeout(entry.timer)
      entry.timer = null
    }
    return entry
  }

  private schedule(tabId: number, entry: Entry): void {
    if (entry.timer) clearTimeout(entry.timer)
    const wait = entry.sessionID && this.isBusy(entry.sessionID) ? this.busyMs : this.idleMs
    entry.timer = setTimeout(() => {
      entry.timer = null
      void this.hide(tabId)
    }, wait)
  }
}
