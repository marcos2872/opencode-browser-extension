import { useEffect, useRef, useState } from "react"
import { PORT_NAME, type UiEvent } from "../shared/protocol"
import type { AppSnapshot, BrowserTabContext, FormAnswer, FormInfo, ModelRef, PermissionDecision, PermissionRequest } from "../shared/types"
import { SettingsIcon, Logo } from "../components/icons"
import { PermissionCard } from "../components/PermissionCard"
import { Chat } from "./Chat"
import { Composer } from "./Composer"
import { ModelPicker } from "./ModelPicker"
import { Onboarding } from "./Onboarding"
import { SessionBar } from "./SessionBar"
import { request } from "./api"

async function listSessionTabs(sessionID: string): Promise<BrowserTabContext[]> {
  const response = await request({ type: "tabs:list", sessionID })
  if (!response.ok) throw new Error(response.error)
  return response.tabs ?? []
}

export default function App() {
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null)
  const [permission, setPermission] = useState<PermissionRequest | null>(null)
  const [formBusyID, setFormBusyID] = useState<string | null>(null)
  const [pairError, setPairError] = useState<string | null>(null)
  const [pairBusy, setPairBusy] = useState(false)
  const [draft, setDraft] = useState("")
  const [selectedModel, setSelectedModel] = useState<ModelRef | null>(null)
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [contextResult, setContextResult] = useState<{
    sessionID: string
    tabs: BrowserTabContext[]
    error: string | null
  } | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  function showToast(message: string) {
    setToast(message)
    setTimeout(() => setToast((current) => (current === message ? null : current)), 3000)
  }

  useEffect(() => {
    let disposed = false
    let port: chrome.runtime.Port | null = null
    let timer: ReturnType<typeof setTimeout> | null = null

    const handle = (message: UiEvent) => {
      if (message.type === "snapshot") setSnapshot(message.snapshot)
      if (message.type === "relay") {
        setSnapshot((current) => (current ? { ...current, relay: message.relay } : current))
      }
      if (message.type === "permission") setPermission(message.request)
      if (message.type === "permission:resolved") {
        setPermission((current) => (current?.id === message.requestId ? null : current))
      }
    }

    const connect = () => {
      if (disposed) return
      port = chrome.runtime.connect({ name: PORT_NAME })
      port.onMessage.addListener(handle)
      port.onDisconnect.addListener(() => {
        port = null
        if (!disposed) timer = setTimeout(connect, 1200)
      })
      void request({ type: "state:get" }).then((response) => {
        if (disposed) return
        if (response.ok && response.snapshot) setSnapshot(response.snapshot)
        else if (!response.ok) showToast(response.error)
      })
    }

    connect()
    return () => {
      disposed = true
      if (timer) clearTimeout(timer)
      port?.disconnect()
    }
  }, [])

  const activeSession = snapshot?.sessions.find((session) => session.id === snapshot.activeSessionID)
  const hasCurrentContext = contextResult?.sessionID === snapshot?.activeSessionID
  const contextTabs = hasCurrentContext ? contextResult?.tabs ?? [] : []
  const contextError = hasCurrentContext ? contextResult?.error ?? null : null
  const toolRevision = snapshot?.messages
    .flatMap((message) => message.kind === "assistant" ? message.tools : [])
    .map((tool) => `${tool.id}:${tool.status}`)
    .join("|") ?? ""

  useEffect(() => {
    const sessionID = snapshot?.activeSessionID
    if (!sessionID) return
    let current = true
    void listSessionTabs(sessionID).then((tabs) => {
      if (!current) return
      setContextResult({ sessionID, tabs, error: null })
    }).catch((error: unknown) => {
      if (!current) return
      setContextResult({
        sessionID,
        tabs: [],
        error: error instanceof Error ? error.message : String(error),
      })
    })
    return () => { current = false }
  }, [snapshot?.activeSessionID, toolRevision])

  useEffect(() => {
    if (!snapshot) return
    setSelectedModel(activeSession?.model ?? snapshot.config?.defaultModel ?? snapshot.defaultModel ?? null)
    setSelectedAgent(activeSession?.agent ?? snapshot.config?.defaultAgent ?? "build")
  }, [snapshot?.activeSessionID])

  useEffect(() => {
    if (!selectedModel && snapshot) {
      setSelectedModel(activeSession?.model ?? snapshot.config?.defaultModel ?? snapshot.defaultModel ?? null)
    }
  }, [snapshot?.config?.defaultModel, snapshot?.defaultModel])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" })
  }, [snapshot?.messages, snapshot?.busy, permission])

  async function pair(link: string) {
    setPairBusy(true)
    setPairError(null)
    const response = await request({ type: "pair", link })
    setPairBusy(false)
    if (!response.ok) setPairError(response.error)
    else showToast("Conectado ao OpenCode.")
  }

  async function changeModel(model: ModelRef) {
    setSelectedModel(model)
    if (snapshot?.activeSessionID) {
      const response = await request({ type: "session:model", model })
      if (!response.ok) showToast(response.error)
      return
    }
    const response = await request({ type: "settings:update", patch: { defaultModel: model } })
    if (!response.ok) showToast(response.error)
  }

  async function changeAgent(agent: string) {
    setSelectedAgent(agent)
    const response = await request({ type: "session:agent", agent })
    if (!response.ok) showToast(response.error)
  }

  async function newSession() {
    const response = await request({
      type: "session:new",
      model: selectedModel ?? undefined,
      agent: selectedAgent ?? undefined,
    })
    if (!response.ok) showToast(response.error)
    else setDraft("")
  }

  async function deleteSession() {
    if (!snapshot?.activeSessionID) return
    if (!window.confirm("Excluir esta sessão? O histórico será removido do OpenCode.")) return
    const response = await request({ type: "session:delete", id: snapshot.activeSessionID })
    if (!response.ok) showToast(response.error)
  }

  async function attachCurrentTab() {
    const sessionID = snapshot?.activeSessionID
    if (!sessionID) return
    const response = await request({ type: "tabs:attach-current" })
    if (!response.ok) {
      showToast(response.error)
      return
    }
    try {
      setContextResult({ sessionID, tabs: await listSessionTabs(sessionID), error: null })
    } catch (error) {
      setContextResult({
        sessionID,
        tabs: [],
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async function detachTab(tabID: number) {
    const sessionID = snapshot?.activeSessionID
    if (!sessionID) return
    const response = await request({ type: "tabs:detach", sessionID, tabID })
    if (!response.ok) {
      showToast(response.error)
      return
    }
    setContextResult({ sessionID, tabs: response.tabs ?? [], error: null })
  }

  async function send() {
    if (!draft.trim()) return
    const text = draft
    const match = /^\/([^\s]+)\s*([\s\S]*)$/.exec(text.trim())
    const command = match ? snapshot?.commands.find((item) => item.name === match[1]) : undefined
    setDraft("")
    const response = command
      ? await request({ type: "command", name: command.name, text: match?.[2] ?? "" })
      : await request({ type: "prompt", text })
    if (!response.ok) {
      showToast(response.error)
      setDraft(text)
    }
  }

  async function decide(decision: PermissionDecision) {
    if (!permission) return
    const id = permission.id
    setPermission(null)
    const response = await request({ type: "permission:respond", requestId: id, decision })
    if (!response.ok) showToast(response.error)
  }

  async function respondForm(form: FormInfo, answer: FormAnswer) {
    setFormBusyID(form.id)
    const response = await request({
      type: "form:respond",
      sessionID: form.sessionID,
      formID: form.id,
      answer,
    })
    setFormBusyID(null)
    if (!response.ok) showToast(response.error)
  }

  async function cancelForm(form: FormInfo) {
    setFormBusyID(form.id)
    const response = await request({
      type: "form:cancel",
      sessionID: form.sessionID,
      formID: form.id,
    })
    setFormBusyID(null)
    if (!response.ok) showToast(response.error)
  }

  if (!snapshot) {
    return (
      <div className="app">
        <div className="empty">
          <div className="thinking">
            <span />
            <span />
            <span /> carregando
          </div>
        </div>
        {toast ? <div className="toast">{toast}</div> : null}
      </div>
    )
  }

  const backendClass =
    snapshot.backend === "online" ? "ok" : snapshot.backend === "offline" ? "err" : "warn"

  return (
    <div className="app">
      <div className="header">
        <div className="brand">
          <span className="brand-mark">
            <Logo size={15} />
          </span>
          <span className="brand-text">OpenCode</span>
        </div>
        <span className="status" title={`API do OpenCode: ${snapshot.backend}`}>
          <span className={`dot ${backendClass}`} />
          {snapshot.backend === "online" ? "online" : snapshot.backend === "offline" ? "offline" : "..."}
        </span>
        <span className="spacer" />
        {snapshot.config ? (
          <ModelPicker
            models={snapshot.models}
            value={selectedModel}
            disabled={snapshot.busy}
            onChange={(model) => void changeModel(model)}
          />
        ) : null}
        <button
          className="icon-btn"
          title="Configurações"
          onClick={() => void request({ type: "open:options" })}
        >
          <SettingsIcon size={16} />
        </button>
      </div>

      {!snapshot.config ? (
        <Onboarding
          relay={snapshot.relay}
          error={pairError}
          busy={pairBusy}
          onPair={pair}
          onReconnect={() => void request({ type: "relay:reconnect" })}
        />
      ) : (
        <>
          <SessionBar
            sessions={snapshot.sessions}
            activeID={snapshot.activeSessionID}
            busy={snapshot.busy}
            contextTabs={contextTabs}
            contextError={contextError}
            agents={snapshot.agents}
            agent={selectedAgent}
            onSelect={(id) => void request({ type: "session:select", id })}
            onNew={() => void newSession()}
            onDelete={() => void deleteSession()}
            onAttach={() => void attachCurrentTab()}
            onDetach={(tabID) => void detachTab(tabID)}
            onAgent={(agent) => void changeAgent(agent)}
          />
          <Chat
            messages={snapshot.messages}
            busy={snapshot.busy}
            onSuggestion={setDraft}
            bottomRef={bottomRef}
            forms={snapshot.forms}
            busyFormID={formBusyID}
            onFormSubmit={(form, answer) => void respondForm(form, answer)}
            onFormCancel={(form) => void cancelForm(form)}
          />
          {snapshot.statusMessage ? (
            <div className="status-banner">
              <span className="spinner" />
              {snapshot.statusMessage}
            </div>
          ) : null}
          <Composer
            value={draft}
            busy={snapshot.busy}
            disabled={!snapshot.config}
            relayConnected={snapshot.relay.connected}
            commands={snapshot.commands}
            onChange={setDraft}
            onSend={() => void send()}
            onStop={() => void request({ type: "interrupt" })}
          />
        </>
      )}

      {permission ? (
        <div className="overlay">
          <PermissionCard request={permission} onDecision={(decision) => void decide(decision)} />
        </div>
      ) : null}

      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  )
}
