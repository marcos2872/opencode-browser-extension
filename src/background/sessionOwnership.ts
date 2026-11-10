/**
 * Sessões que pertencem à extensão: criadas no painel, escolhidas pelo usuário
 * ou usadas para enviar um prompt. O SSE do OpenCode é global, então sem essa
 * lista uma sessão do CLI ou de um subagente dispararia som, notificação de
 * sistema e badge no ícone.
 *
 * Fica em `chrome.storage.session` (como os grupos de abas): sobrevive ao
 * service worker, mas não a um reinício do navegador nem a um reload/update
 * da extensão. Depois disso, a primeira interação no painel volta a registrar
 * a sessão.
 */
const STORAGE_KEY = "sessionOwnership";

export class SessionOwnership {
  private owned: Set<string> | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  private serialize<T>(task: () => Promise<T>): Promise<T> {
    const next = this.queue.then(task, task);
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async load(): Promise<Set<string>> {
    if (this.owned) return this.owned;
    // Deixa o erro propagar: assim o cache não é envenenado e a próxima
    // chamada tenta ler o storage de novo.
    const stored: Record<string, unknown> = await chrome.storage.session.get(
      STORAGE_KEY,
    );
    const raw = stored[STORAGE_KEY];
    const ids = Array.isArray(raw)
      ? raw.filter(
          (id): id is string => typeof id === "string" && id.length > 0,
        )
      : [];
    this.owned = new Set(ids);
    return this.owned;
  }

  private async save(): Promise<void> {
    const ids = [...(this.owned ?? [])];
    await chrome.storage.session
      .set({ [STORAGE_KEY]: ids })
      .catch(() => undefined);
  }

  async init(): Promise<void> {
    await this.serialize(() => this.load()).catch(() => undefined);
  }

  /** Síncrono para poder ser usado no caminho quente dos eventos SSE. */
  isOwned(sessionID: string): boolean {
    return this.owned?.has(sessionID) ?? false;
  }

  async add(sessionID: string): Promise<void> {
    if (!sessionID) return;
    await this.serialize(async () => {
      const owned = await this.load();
      if (owned.has(sessionID)) return;
      owned.add(sessionID);
      await this.save();
    }).catch(() => undefined);
  }

  async remove(sessionID: string): Promise<void> {
    await this.serialize(async () => {
      const owned = await this.load();
      if (!owned.delete(sessionID)) return;
      await this.save();
    }).catch(() => undefined);
  }

  async clear(): Promise<void> {
    await this.serialize(async () => {
      this.owned = new Set();
      await this.save();
    }).catch(() => undefined);
  }
}

export const ownedSessions = new SessionOwnership();
