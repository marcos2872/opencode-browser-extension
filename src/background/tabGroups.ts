interface GroupRecord {
  sessionID: string;
  groupId: number;
  mainTabId: number;
}

const STORAGE_KEY = "tabGroups";
const COLORS = [
  "blue",
  "cyan",
  "green",
  "orange",
  "purple",
  "red",
  "yellow",
  "pink",
] as const;

export interface GroupTab {
  id: number;
  title: string;
  url: string;
  active: boolean;
}

export class TabGroups {
  private records: GroupRecord[] | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor() {
    chrome.tabs.onRemoved.addListener((tabId) => {
      void this.serialize(async () => {
        const records = await this.load();
        let changed = false;
        for (const record of records) {
          if (record.mainTabId !== tabId) continue;
          const tabs = await chrome.tabs
            .query({ groupId: record.groupId })
            .catch(() => []);
          const next = tabs.find((tab) => tab.id !== undefined);
          if (next?.id !== undefined) {
            record.mainTabId = next.id;
          } else {
            this.records = records.filter((item) => item !== record);
          }
          changed = true;
        }
        if (changed) await this.save();
      });
    });
    chrome.tabGroups.onRemoved.addListener((group) => {
      void this.serialize(async () => {
        const records = await this.load();
        const next = records.filter((record) => record.groupId !== group.id);
        if (next.length !== records.length) {
          this.records = next;
          await this.save();
        }
      });
    });
  }

  private serialize<T>(task: () => Promise<T>): Promise<T> {
    const next = this.queue.then(task, task);
    this.queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private async load(force = false): Promise<GroupRecord[]> {
    if (this.records && !force) return this.records;
    const data = await chrome.storage.session.get(STORAGE_KEY);
    const value = data[STORAGE_KEY];
    this.records = Array.isArray(value)
      ? value.filter(
          (item): item is GroupRecord =>
            !!item &&
            typeof item.sessionID === "string" &&
            typeof item.groupId === "number" &&
            typeof item.mainTabId === "number",
        )
      : [];
    return this.records;
  }

  private async save(): Promise<void> {
    await chrome.storage.session.set({ [STORAGE_KEY]: this.records ?? [] });
  }

  async ensure(
    sessionID: string,
    displayName = "OpenCode",
  ): Promise<GroupRecord> {
    return this.serialize(async () => {
      const records = await this.load();
      const existing = records.find((record) => record.sessionID === sessionID);
      if (existing) {
        try {
          await chrome.tabGroups.get(existing.groupId);
          const tabs = await chrome.tabs.query({ groupId: existing.groupId });
          if (tabs.length > 0) {
            if (!tabs.some((tab) => tab.id === existing.mainTabId)) {
              const first = tabs.find((tab) => tab.id !== undefined);
              if (first?.id !== undefined) {
                existing.mainTabId = first.id;
                await this.save();
              }
            }
            return existing;
          }
          // Grupo vazio: descarta o registro antigo antes de recriar.
          this.records = records.filter((record) => record !== existing);
        } catch {
          // Group is gone; recreate below.
          this.records = records.filter((record) => record !== existing);
        }
      }

      const window = await chrome.windows
        .getLastFocused()
        .catch(() => undefined);
      const tab = await chrome.tabs.create({
        windowId: window?.id,
        url: "about:blank",
        active: true,
      });
      if (tab.id === undefined)
        throw new Error("Não foi possível criar a aba do grupo.");
      const groupId = await chrome.tabs.group({ tabIds: [tab.id] });
      const index = records.length;
      await chrome.tabGroups.update(groupId, {
        title: displayName,
        color: COLORS[index % COLORS.length] as chrome.tabGroups.Color,
        collapsed: false,
      });
      const record: GroupRecord = { sessionID, groupId, mainTabId: tab.id };
      this.records = [...(this.records ?? []), record];
      await this.save();
      return record;
    });
  }

  async get(sessionID: string): Promise<GroupRecord | null> {
    const records = await this.load();
    return records.find((record) => record.sessionID === sessionID) ?? null;
  }

  async list(sessionID: string): Promise<GroupTab[]> {
    const record = await this.get(sessionID);
    if (!record) return [];
    try {
      await chrome.tabGroups.get(record.groupId);
    } catch {
      return [];
    }
    const tabs = await chrome.tabs.query({ groupId: record.groupId });
    return tabs
      .filter((tab) => tab.id !== undefined)
      .map((tab) => ({
        id: tab.id as number,
        title: tab.title ?? "",
        url: tab.url ?? tab.pendingUrl ?? "",
        active: tab.active,
      }));
  }

  async resolveTab(
    sessionID: string,
    requested?: number,
  ): Promise<{ tabId: number; groupId: number }> {
    const record = await this.ensure(sessionID);
    const tabs = await chrome.tabs.query({ groupId: record.groupId });
    if (requested !== undefined) {
      const match = tabs.find((tab) => tab.id === requested);
      if (!match) {
        throw new Error(
          `A aba ${requested} não pertence ao grupo desta sessão.`,
        );
      }
      return { tabId: requested, groupId: record.groupId };
    }
    const main =
      tabs.find((tab) => tab.id === record.mainTabId) ??
      tabs.find((tab) => tab.id !== undefined);
    if (!main?.id) throw new Error("O grupo desta sessão não tem abas.");
    return { tabId: main.id, groupId: record.groupId };
  }

  async addTab(sessionID: string, tabId: number): Promise<number> {
    const record = await this.ensure(sessionID);
    await chrome.tabs.group({ tabIds: [tabId], groupId: record.groupId });
    return record.groupId;
  }

  async detachTab(sessionID: string, tabId: number): Promise<void> {
    const record = await this.get(sessionID);
    if (!record) throw new Error("A sessão não tem abas anexadas.");
    const groupTabs = await chrome.tabs.query({ groupId: record.groupId });
    if (!groupTabs.some((tab) => tab.id === tabId)) {
      throw new Error("A aba não pertence ao contexto desta conversa.");
    }
    await chrome.tabs.ungroup(tabId);
  }

  async createTab(
    sessionID: string,
    url = "about:blank",
    active = true,
  ): Promise<number> {
    const record = await this.ensure(sessionID);
    const source = await chrome.tabs
      .get(record.mainTabId)
      .catch(() => undefined);
    const tab = await chrome.tabs.create({
      windowId: source?.windowId,
      url,
      active,
    });
    if (tab.id === undefined) throw new Error("Não foi possível criar a aba.");
    await chrome.tabs.group({ tabIds: [tab.id], groupId: record.groupId });
    return tab.id;
  }

  async closeTab(sessionID: string, tabId: number): Promise<void> {
    const record = await this.ensure(sessionID);
    const tabs = await chrome.tabs.query({ groupId: record.groupId });
    if (!tabs.some((tab) => tab.id === tabId)) {
      throw new Error("A aba não pertence ao grupo desta sessão.");
    }
    await chrome.tabs.remove(tabId);
  }

  async cleanup(): Promise<void> {
    await this.serialize(async () => {
      const records = await this.load(true);
      const known = new Set(records.map((record) => record.groupId));
      let groups: chrome.tabGroups.TabGroup[] = [];
      try {
        groups = await chrome.tabGroups.query({ title: "OpenCode" });
      } catch {
        return;
      }
      let changed = false;
      for (const group of groups) {
        if (known.has(group.id)) continue;
        const tabs = await chrome.tabs
          .query({ groupId: group.id })
          .catch(() => []);
        const ids = tabs
          .map((tab) => tab.id)
          .filter((id): id is number => id !== undefined);
        const blanks = tabs.filter(
          (tab) =>
            !tab.url ||
            tab.url === "about:blank" ||
            tab.url.startsWith("chrome://newtab"),
        );
        const keep = tabs.filter((tab) => !blanks.includes(tab));
        try {
          if (keep.length === 0) {
            for (const id of ids) await chrome.tabs.remove(id);
          } else {
            const keepIds = keep
              .map((tab) => tab.id)
              .filter((id): id is number => id !== undefined);
            for (const id of keepIds) await chrome.tabs.ungroup(id);
          }
        } catch {
          // ignore individual failures
        }
        changed = true;
      }
      if (changed) await this.save();
    });
  }

  async groupOf(sessionID: string): Promise<number | null> {
    const records = await this.load(true);
    const record = records.find((item) => item.sessionID === sessionID);
    if (!record || !Number.isFinite(record.groupId)) return null;
    try {
      await chrome.tabGroups.get(record.groupId);
    } catch {
      return null;
    }
    return record.groupId;
  }
}
