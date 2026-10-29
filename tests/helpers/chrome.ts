import { vi } from "vitest"

type AnyFn = (...args: any[]) => any

export class FakeEvent {
  listeners: AnyFn[] = []

  addListener(listener: AnyFn): void {
    this.listeners.push(listener)
  }

  removeListener(listener: AnyFn): void {
    this.listeners = this.listeners.filter((item) => item !== listener)
  }

  hasListener(listener: AnyFn): boolean {
    return this.listeners.includes(listener)
  }

  emit(...args: any[]): void {
    for (const listener of [...this.listeners]) listener(...args)
  }

  clear(): void {
    this.listeners = []
  }
}

type StorageChanges = Record<string, { oldValue?: unknown; newValue?: unknown }>

export class FakeStorageArea {
  data = new Map<string, unknown>()

  constructor(
    private readonly areaName: string,
    private readonly onChanged?: (changes: StorageChanges, area: string) => void,
  ) {}

  async get(keys?: string | string[] | Record<string, unknown> | null): Promise<Record<string, unknown>> {
    if (keys === undefined || keys === null) {
      return Object.fromEntries(this.data)
    }
    if (typeof keys === "string") {
      return this.data.has(keys) ? { [keys]: this.data.get(keys) } : {}
    }
    if (Array.isArray(keys)) {
      const output: Record<string, unknown> = {}
      for (const key of keys) if (this.data.has(key)) output[key] = this.data.get(key)
      return output
    }
    const output: Record<string, unknown> = { ...keys }
    for (const [key, value] of Object.entries(keys)) {
      if (this.data.has(key)) output[key] = this.data.get(key)
    }
    return output
  }

  async set(items: Record<string, unknown>): Promise<void> {
    const changes: StorageChanges = {}
    for (const [key, value] of Object.entries(items)) {
      changes[key] = { oldValue: this.data.get(key), newValue: value }
      this.data.set(key, value)
    }
    this.onChanged?.(changes, this.area)
  }

  async remove(keys: string | string[]): Promise<void> {
    const list = Array.isArray(keys) ? keys : [keys]
    const changes: StorageChanges = {}
    for (const key of list) {
      if (!this.data.has(key)) continue
      changes[key] = { oldValue: this.data.get(key) }
      this.data.delete(key)
    }
    this.onChanged?.(changes, this.area)
  }

  async clear(): Promise<void> {
    const changes: StorageChanges = {}
    for (const [key, value] of this.data) changes[key] = { oldValue: value }
    this.data.clear()
    this.onChanged?.(changes, this.area)
  }

  get area(): string {
    return this.areaName
  }
}

export interface FakeTab {
  id: number
  url: string
  pendingUrl?: string
  title: string
  active: boolean
  windowId: number
  groupId: number
  status: string
  openerTabId?: number
}

export interface FakeTabGroup {
  id: number
  title: string
  color: string
  collapsed: boolean
  windowId: number
}

export interface FakePort {
  name: string
  onMessage: FakeEvent
  onDisconnect: FakeEvent
  postMessage: (message: unknown) => void
  disconnect: () => void
  sent: unknown[]
  disconnected: boolean
}

export interface ChromeMock {
  runtime: {
    id: string
    getURL: (path: string) => string
    getManifest: () => Record<string, unknown>
    onMessage: FakeEvent
    onConnect: FakeEvent
    onStartup: FakeEvent
    onInstalled: FakeEvent
    onSuspend: FakeEvent
    onMessageExternal: FakeEvent
    sendMessage: ReturnType<typeof vi.fn>
    connect: ReturnType<typeof vi.fn>
    lastError: { message: string } | undefined
    openOptionsPage: ReturnType<typeof vi.fn>
    reload: ReturnType<typeof vi.fn>
  }
  storage: {
    local: FakeStorageArea
    session: FakeStorageArea
    managed: FakeStorageArea
    onChanged: FakeEvent
  }
  tabs: {
    get: ReturnType<typeof vi.fn>
    query: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    remove: ReturnType<typeof vi.fn>
    group: ReturnType<typeof vi.fn>
    ungroup: ReturnType<typeof vi.fn>
    move: ReturnType<typeof vi.fn>
    goBack: ReturnType<typeof vi.fn>
    goForward: ReturnType<typeof vi.fn>
    sendMessage: ReturnType<typeof vi.fn>
    onUpdated: FakeEvent
    onRemoved: FakeEvent
    onCreated: FakeEvent
    onActivated: FakeEvent
    onMoved: FakeEvent
  }
  tabGroups: {
    get: ReturnType<typeof vi.fn>
    query: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    onRemoved: FakeEvent
    onUpdated: FakeEvent
    TAB_GROUP_ID_NONE: number
    Color: Record<string, string>
  }
  scripting: {
    executeScript: ReturnType<typeof vi.fn>
    insertCSS: ReturnType<typeof vi.fn>
    removeCSS: ReturnType<typeof vi.fn>
  }
  debugger: {
    attach: ReturnType<typeof vi.fn>
    detach: ReturnType<typeof vi.fn>
    sendCommand: ReturnType<typeof vi.fn>
    onEvent: FakeEvent
    onDetach: FakeEvent
  }
  alarms: {
    create: ReturnType<typeof vi.fn>
    clear: ReturnType<typeof vi.fn>
    getAll: ReturnType<typeof vi.fn>
    onAlarm: FakeEvent
  }
  sidePanel: {
    setPanelBehavior: ReturnType<typeof vi.fn>
    open: ReturnType<typeof vi.fn>
  }
  offscreen: {
    hasDocument: ReturnType<typeof vi.fn>
    createDocument: ReturnType<typeof vi.fn>
    closeDocument: ReturnType<typeof vi.fn>
  }
  notifications: {
    create: ReturnType<typeof vi.fn>
    clear: ReturnType<typeof vi.fn>
    onClicked: FakeEvent
  }
  downloads: {
    download: ReturnType<typeof vi.fn>
    onChanged: FakeEvent
  }
  windows: {
    getLastFocused: ReturnType<typeof vi.fn>
    getCurrent: ReturnType<typeof vi.fn>
    getAll: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    remove: ReturnType<typeof vi.fn>
    onRemoved: FakeEvent
    onCreated: FakeEvent
    onFocusChanged: FakeEvent
    WINDOW_ID_NONE: number
  }
  commands: {
    onCommand: FakeEvent
  }
  action: {
    setBadgeText: ReturnType<typeof vi.fn>
    setTitle: ReturnType<typeof vi.fn>
    setBadgeBackgroundColor: ReturnType<typeof vi.fn>
    setBadgeTextColor: ReturnType<typeof vi.fn>
    getUserSettings: ReturnType<typeof vi.fn>
    onClicked: FakeEvent
  }
  permissions: {
    contains: ReturnType<typeof vi.fn>
    remove: ReturnType<typeof vi.fn>
    onAdded: FakeEvent
    onRemoved: FakeEvent
  }
  __state: {
    tabs: Map<number, FakeTab>
    groups: Map<number, FakeTabGroup>
    ports: FakePort[]
    addTab: (partial?: Partial<FakeTab>) => FakeTab
    addGroup: (partial?: Partial<FakeTabGroup>) => FakeTabGroup
    emitStorageChanged: (changes: StorageChanges, area: "local" | "session") => void
    /** Simula o Chrome em primeiro plano (true) ou atrás de outro app (false). */
    setWindowFocused: (focused: boolean) => void
  }
}

function fakePort(name: string): FakePort {
  const port: FakePort = {
    name,
    onMessage: new FakeEvent(),
    onDisconnect: new FakeEvent(),
    sent: [],
    disconnected: false,
    postMessage(message) {
      port.sent.push(message)
      port.onMessage.emit(message)
    },
    disconnect() {
      port.disconnected = true
      port.onDisconnect.emit(port)
    },
  }
  return port
}

export function createChromeMock(): ChromeMock {
  const tabs = new Map<number, FakeTab>()
  const groups = new Map<number, FakeTabGroup>()
  const ports: FakePort[] = []
  let nextTabId = 1
  let nextGroupId = 100
  let windowFocused = true

  const runtimeOnMessage = new FakeEvent()
  const storageOnChanged = new FakeEvent()

  const local = new FakeStorageArea("local", (changes, area) => storageOnChanged.emit(changes, area))
  const session = new FakeStorageArea("session", (changes, area) => storageOnChanged.emit(changes, area))
  const managed = new FakeStorageArea("managed", (changes, area) => storageOnChanged.emit(changes, area))

  const runtime = {
    id: "test-extension-id",
    getURL: (path: string) => `chrome-extension://test-extension-id/${path.replace(/^\//, "")}`,
    getManifest: () => ({ version: "0.0.0", action: { default_title: "Test" } }),
    onMessage: runtimeOnMessage,
    onConnect: new FakeEvent(),
    onStartup: new FakeEvent(),
    onInstalled: new FakeEvent(),
    onSuspend: new FakeEvent(),
    onMessageExternal: new FakeEvent(),
    sendMessage: vi.fn(async (message: unknown, sender: unknown = {}) => {
      for (const listener of runtimeOnMessage.listeners) {
        let responded = false
        let value: unknown
        const sendResponse = (response: unknown) => {
          responded = true
          value = response
          return true
        }
        const result = listener(message, sender, sendResponse)
        if (result === true) await new Promise((resolve) => setTimeout(resolve, 0))
        if (responded) return value
      }
      return undefined
    }),
    connect: vi.fn((info?: { name?: string }) => {
      const port = fakePort(info?.name ?? "")
      ports.push(port)
      runtime.onConnect.emit(port)
      return port
    }),
    lastError: undefined as { message: string } | undefined,
    openOptionsPage: vi.fn(async () => undefined),
    reload: vi.fn(),
  }

  /**
   * No Chrome real só existe uma aba ativa por janela: ativar uma desativa as
   * irmãs. Sem isso os testes de foco dão falso positivo.
   */
  const deactivateSiblings = (tab: FakeTab): void => {
    if (!tab.active) return
    for (const other of tabs.values()) {
      if (other.id !== tab.id && other.windowId === tab.windowId) other.active = false
    }
  }

  const tabsApi = {
    get: vi.fn(async (id: number) => {
      const tab = tabs.get(id)
      if (!tab) throw new Error(`No tab with id: ${id}`)
      return tab
    }),    query: vi.fn(async (filter: Record<string, unknown> = {}) => {
      let list = [...tabs.values()]
      if (typeof filter.groupId === "number") list = list.filter((tab) => tab.groupId === filter.groupId)
      if (typeof filter.url === "string") {
        const pattern = String(filter.url).replace(/\*/g, "")
        list = list.filter((tab) => tab.url.includes(pattern))
      }
      if (filter.active === true) list = list.filter((tab) => tab.active)
      if (filter.currentWindow === true || filter.lastFocusedWindow === true) {
        const windowId = list.find((tab) => tab.active)?.windowId ?? list[0]?.windowId
        if (windowId !== undefined) list = list.filter((tab) => tab.windowId === windowId)
      }
      return list
    }),
    create: vi.fn(async (props: Partial<FakeTab> = {}) => {
      const tab: FakeTab = {
        id: nextTabId++,
        url: props.url ?? "about:blank",
        title: props.title ?? "",
        active: props.active ?? true,
        windowId: props.windowId ?? 1,
        groupId: props.groupId ?? -1,
        status: "complete",
      }
      tabs.set(tab.id, tab)
      deactivateSiblings(tab)
      return tab
    }),
    update: vi.fn(async (id: number, props: Partial<FakeTab> = {}) => {
      const tab = tabs.get(id)
      if (!tab) throw new Error(`No tab with id: ${id}`)
      Object.assign(tab, props)
      deactivateSiblings(tab)
      return tab
    }),
    remove: vi.fn(async (ids: number | number[]) => {
      for (const id of Array.isArray(ids) ? ids : [ids]) tabs.delete(id)
    }),
    group: vi.fn(async ({ tabIds, groupId }: { tabIds: number | number[]; groupId?: number }) => {
      const ids = Array.isArray(tabIds) ? tabIds : [tabIds]
      const target = groupId ?? nextGroupId++
      let group = groups.get(target)
      if (!group) {
        group = {
          id: target,
          title: "",
          color: "blue",
          collapsed: false,
          windowId: tabs.get(ids[0])?.windowId ?? 1,
        }
        groups.set(target, group)
      }
      for (const id of ids) {
        const tab = tabs.get(id)
        if (!tab) continue
        tab.groupId = target
        // Como no Chrome, agrupar move a aba para a janela do grupo.
        if (tab.windowId !== group.windowId) {
          tab.windowId = group.windowId
          deactivateSiblings(tab)
        }
      }
      return target
    }),
    ungroup: vi.fn(async (ids: number | number[]) => {
      for (const id of Array.isArray(ids) ? ids : [ids]) {
        const tab = tabs.get(id)
        if (tab) tab.groupId = -1
      }
    }),
    move: vi.fn(async (id: number, props: { windowId?: number; index?: number } = {}) => {
      const tab = tabs.get(id)
      if (!tab) throw new Error(`No tab with id: ${id}`)
      if (typeof props.windowId === "number") {
        tab.windowId = props.windowId
        deactivateSiblings(tab)
      }
      return tab
    }),
    goBack: vi.fn(async () => undefined),
    goForward: vi.fn(async () => undefined),
    sendMessage: vi.fn(async () => undefined),
    onUpdated: new FakeEvent(),
    onRemoved: new FakeEvent(),
    onCreated: new FakeEvent(),
    onActivated: new FakeEvent(),
    onMoved: new FakeEvent(),
  }

  const tabGroupsApi = {
    get: vi.fn(async (id: number) => {
      const group = groups.get(id)
      if (!group) throw new Error(`No group with id: ${id}`)
      return group
    }),
    query: vi.fn(async (filter: Record<string, unknown> = {}) => {
      let list = [...groups.values()]
      if (typeof filter.title === "string") list = list.filter((group) => group.title === filter.title)
      if (typeof filter.windowId === "number") list = list.filter((group) => group.windowId === filter.windowId)
      return list
    }),
    update: vi.fn(async (id: number, props: Partial<FakeTabGroup> = {}) => {
      const group = groups.get(id)
      if (!group) throw new Error(`No group with id: ${id}`)
      Object.assign(group, props)
      return group
    }),
    onRemoved: new FakeEvent(),
    onUpdated: new FakeEvent(),
    TAB_GROUP_ID_NONE: -1,
    Color: {
      GREY: "grey",
      BLUE: "blue",
      RED: "red",
      YELLOW: "yellow",
      GREEN: "green",
      PINK: "pink",
      PURPLE: "purple",
      CYAN: "cyan",
      ORANGE: "orange",
    },
  }

  const debuggerApi = {
    attach: vi.fn((_target: unknown, _version: string, callback?: () => void) => callback?.()),
    detach: vi.fn((_target: unknown, callback?: () => void) => callback?.()),
    sendCommand: vi.fn(
      (_target: unknown, _method: string, _params: unknown, callback?: (result: unknown) => void) =>
        callback?.(undefined),
    ),
    onEvent: new FakeEvent(),
    onDetach: new FakeEvent(),
  }

  const addTab = (partial: Partial<FakeTab> = {}): FakeTab => {
    const tab: FakeTab = {
      id: partial.id ?? nextTabId++,
      url: partial.url ?? "https://example.com/",
      title: partial.title ?? "Example",
      active: partial.active ?? true,
      windowId: partial.windowId ?? 1,
      groupId: partial.groupId ?? -1,
      status: partial.status ?? "complete",
      openerTabId: partial.openerTabId,
    }
    tabs.set(tab.id, tab)
    return tab
  }

  const addGroup = (partial: Partial<FakeTabGroup> = {}): FakeTabGroup => {
    const group: FakeTabGroup = {
      id: partial.id ?? nextGroupId++,
      title: partial.title ?? "OpenCode",
      color: partial.color ?? "blue",
      collapsed: partial.collapsed ?? false,
      windowId: partial.windowId ?? 1,
    }
    groups.set(group.id, group)
    return group
  }

  return {
    runtime,
    storage: { local, session, managed, onChanged: storageOnChanged },
    tabs: tabsApi,
    tabGroups: tabGroupsApi,
    scripting: {
      executeScript: vi.fn(async () => []),
      insertCSS: vi.fn(async () => undefined),
      removeCSS: vi.fn(async () => undefined),
    },
    debugger: debuggerApi,
    alarms: {
      create: vi.fn(),
      clear: vi.fn(async () => true),
      getAll: vi.fn(async () => []),
      onAlarm: new FakeEvent(),
    },
    sidePanel: {
      setPanelBehavior: vi.fn(async () => undefined),
      open: vi.fn(async () => undefined),
    },
    offscreen: {
      hasDocument: vi.fn(async () => false),
      createDocument: vi.fn(async () => undefined),
      closeDocument: vi.fn(async () => undefined),
    },
    notifications: {
      create: vi.fn(async () => "notification-id"),
      clear: vi.fn(async () => true),
      onClicked: new FakeEvent(),
    },
    downloads: {
      download: vi.fn(async () => 1),
      onChanged: new FakeEvent(),
    },
    windows: {
      getLastFocused: vi.fn(async () => ({ id: 1, focused: windowFocused })),
      getCurrent: vi.fn(async () => ({ id: 1, focused: windowFocused })),
      getAll: vi.fn(async () => [{ id: 1, focused: windowFocused }]),
      create: vi.fn(async () => ({ id: 2, tabs: [{ id: 99 }] })),
      update: vi.fn(async () => ({ id: 1 })),
      remove: vi.fn(async () => undefined),
      onRemoved: new FakeEvent(),
      onCreated: new FakeEvent(),
      onFocusChanged: new FakeEvent(),
      WINDOW_ID_NONE: -1,
    },
    commands: { onCommand: new FakeEvent() },
    action: {
      setBadgeText: vi.fn(async () => undefined),
      setTitle: vi.fn(async () => undefined),
      setBadgeBackgroundColor: vi.fn(async () => undefined),
      setBadgeTextColor: vi.fn(async () => undefined),
      getUserSettings: vi.fn(async () => ({ isOnToolbar: true })),
      onClicked: new FakeEvent(),
    },
    permissions: {
      contains: vi.fn(async () => true),
      remove: vi.fn(async () => true),
      onAdded: new FakeEvent(),
      onRemoved: new FakeEvent(),
    },
    __state: {
      tabs,
      groups,
      ports,
      addTab,
      addGroup,
      emitStorageChanged: (changes, area) => storageOnChanged.emit(changes, area),
      setWindowFocused: (focused) => {
        windowFocused = focused
      },
    },
  }
}
