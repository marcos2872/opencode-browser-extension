import { useCallback, useEffect, useState } from "react"
import type { AppSnapshot, ConnectionState, ModelRef, OpencodeConfig, PermissionMode } from "../shared/types"
import { ModelPicker } from "../sidepanel/ModelPicker"
import { request } from "../sidepanel/api"
import { RefreshIcon, TerminalIcon } from "../components/icons"
import { describeRelay } from "../components/relayStatus"
import { useI18n } from "../shared/i18n/react"
import { applyLocalePreference, loadLocale, watchLocalePreference } from "../shared/i18n/runtime"
import {
  getAllowList,
  getDenyList,
  getLocalePreference,
  setPermissionLists,
} from "../shared/storage"
import type { LocalePreference, Translate } from "../shared/i18n"

function describeConnection(connection: ConnectionState, t: Translate): string {
  if (connection.phase === "online") return t("app.status.online")
  if (connection.phase === "connecting") return t("app.status.connecting")
  if (connection.phase === "unconfigured") return t("options.apiUnconfigured")
  switch (connection.failure) {
    case "unauthorized":
      return t("options.apiUnauthorized")
    case "timeout":
      return t("options.apiTimeout")
    case "server_error":
      return t("options.apiServerError")
    case "stream_closed":
      return t("options.apiStreamClosed")
    default:
      return t("options.apiUnreachable")
  }
}

const TOOLS = [
  "tabs_context",
  "tabs_create",
  "tabs_close",
  "tabs_attach",
  "navigate",
  "read_page",
  "find",
  "get_page_text",
  "form_input",
  "computer",
  "javascript_tool",
  "read_console_messages",
  "read_network_requests",
  "resize_window",
  "update_plan",
  "upload_image",
  "gif_creator",
  "browser_batch",
] as const

interface SettingsDraft {
  mode: PermissionMode
  defaultModel: ModelRef | null
  findMode: "heuristic" | "model"
  timeoutSeconds: number
  soundEnabled: boolean
  notifyEnabled: boolean
  bringTabsToFront: boolean
  toolDisplay: "grouped" | "rows" | "full" | "hidden"
  followTabGroups: boolean
  autoGroupNewSessions: boolean
  workspace: string
  allowText: string
  denyText: string
}

function parseHosts(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
}

function draftFromSnapshot(
  snapshot: AppSnapshot,
  allowText: string,
  denyText: string,
): SettingsDraft {
  const config = snapshot.config
  return {
    mode: config?.permissionMode ?? "allow",
    defaultModel: config?.defaultModel ?? snapshot.defaultModel ?? null,
    findMode: config?.findMode ?? "heuristic",
    timeoutSeconds: Math.round((config?.permissionTimeoutMs ?? 60_000) / 1000),
    soundEnabled: config?.soundEnabled !== false,
    notifyEnabled: config?.notifyEnabled !== false,
    bringTabsToFront: config?.bringTabsToFront === true,
    toolDisplay: config?.toolDisplay ?? "grouped",
    followTabGroups: config?.followTabGroups !== false,
    autoGroupNewSessions: config?.autoGroupNewSessions === true,
    workspace: config?.directory ?? "",
    allowText,
    denyText,
  }
}

export default function App() {
  const { t, locale } = useI18n()
  const [language, setLanguage] = useState<LocalePreference>("auto")
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null)
  const [savedDraft, setSavedDraft] = useState<SettingsDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [allowText, setAllowText] = useState("")
  const [denyText, setDenyText] = useState("")
  const [mode, setMode] = useState<PermissionMode>("allow")
  const [defaultModel, setDefaultModel] = useState<ModelRef | null>(null)
  const [modelTouched, setModelTouched] = useState(false)
  const [findMode, setFindMode] = useState<"heuristic" | "model">("heuristic")
  const [timeoutSeconds, setTimeoutSeconds] = useState(60)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [notifyEnabled, setNotifyEnabled] = useState(true)
  const [bringTabsToFront, setBringTabsToFront] = useState(false)
  const [toolDisplay, setToolDisplay] = useState<"grouped" | "rows" | "full" | "hidden">("grouped")
  const [followTabGroups, setFollowTabGroups] = useState(true)
  const [autoGroupNewSessions, setAutoGroupNewSessions] = useState(false)
  const [workspace, setWorkspace] = useState("")
  const [link, setLink] = useState("")
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  function showToast(message: string) {
    setToast(message)
    setTimeout(() => setToast((current) => (current === message ? null : current)), 3000)
  }

  const applyDraft = useCallback((draft: SettingsDraft) => {
    setMode(draft.mode)
    setDefaultModel(draft.defaultModel)
    setFindMode(draft.findMode)
    setTimeoutSeconds(draft.timeoutSeconds)
    setSoundEnabled(draft.soundEnabled)
    setNotifyEnabled(draft.notifyEnabled)
    setBringTabsToFront(draft.bringTabsToFront)
    setToolDisplay(draft.toolDisplay)
    setFollowTabGroups(draft.followTabGroups)
    setAutoGroupNewSessions(draft.autoGroupNewSessions)
    setWorkspace(draft.workspace)
    setAllowText(draft.allowText)
    setDenyText(draft.denyText)
  }, [])

  const currentDraft: SettingsDraft = {
    mode,
    defaultModel,
    findMode,
    timeoutSeconds,
    soundEnabled,
    notifyEnabled,
    bringTabsToFront,
    toolDisplay,
    followTabGroups,
    autoGroupNewSessions,
    workspace,
    allowText,
    denyText,
  }
  const hasChanges = savedDraft !== null && JSON.stringify(currentDraft) !== JSON.stringify(savedDraft)

  useEffect(() => {
    void loadLocale()
    watchLocalePreference()
    void getLocalePreference().then((value) => setLanguage(value ?? "auto"))
    let active = true
    void Promise.all([request({ type: "state:get" }), getAllowList(), getDenyList()]).then(([response, allow, deny]) => {
      if (!active) return
      const allowText = allow.join("\n")
      const denyText = deny.join("\n")
      setAllowText(allowText)
      setDenyText(denyText)
      if (response.ok && response.snapshot) {
        setSnapshot(response.snapshot)
        const draft = draftFromSnapshot(response.snapshot, allowText, denyText)
        applyDraft(draft)
        setSavedDraft(draft)
      }
    }).catch((error: unknown) => {
      if (!active) return
      setToast(error instanceof Error ? error.message : String(error))
    })
    return () => { active = false }
  }, [applyDraft])

  async function pair() {
    if (!link.trim()) return
    setBusy(true)
    const response = await request({ type: "pair", link: link.trim() })
    setBusy(false)
    if (!response.ok) {
      showToast(response.error)
      return
    }
    setLink("")
    setSnapshot(response.snapshot ?? null)
    setModelTouched(false)
    if (response.snapshot) {
      const draft = draftFromSnapshot(response.snapshot, allowText, denyText)
      applyDraft(draft)
      setSavedDraft(draft)
    }
    showToast(t("common.connected"))
  }

  async function reconnectBackend() {
    const response = await request({ type: "connection:reconnect" })
    if (!response.ok) {
      showToast(response.error)
      return
    }
    if (response.snapshot) {
      setSnapshot(response.snapshot)
      if (!modelTouched) {
        setDefaultModel(
          response.snapshot.config?.defaultModel ?? response.snapshot.defaultModel ?? null,
        )
      }
    }
  }

  async function saveSettings() {
    if (!hasChanges || saving) return
    const permissionListsChanged =
      currentDraft.allowText !== savedDraft?.allowText ||
      currentDraft.denyText !== savedDraft?.denyText
    setSaving(true)
    setSaveError(null)
    try {
      const response = await request({
        type: "settings:update",
        patch: {
          permissionMode: currentDraft.mode,
          ...(modelTouched ? { defaultModel: currentDraft.defaultModel ?? undefined } : {}),
          findMode: currentDraft.findMode,
          permissionTimeoutMs: currentDraft.timeoutSeconds * 1000,
          soundEnabled: currentDraft.soundEnabled,
          notifyEnabled: currentDraft.notifyEnabled,
          bringTabsToFront: currentDraft.bringTabsToFront,
          toolDisplay: currentDraft.toolDisplay,
          followTabGroups: currentDraft.followTabGroups,
          autoGroupNewSessions: currentDraft.autoGroupNewSessions,
          directory: currentDraft.workspace.trim() || undefined,
        },
      })
      if (!response.ok) {
        setSaveError(response.error)
        return
      }

      setSnapshot((current) =>
        current && response.snapshot ? { ...current, config: response.snapshot.config } : current,
      )
      setSavedDraft({
        ...currentDraft,
        allowText: savedDraft?.allowText ?? "",
        denyText: savedDraft?.denyText ?? "",
      })
      setModelTouched(false)
      if (permissionListsChanged) {
        try {
          await setPermissionLists(parseHosts(currentDraft.allowText), parseHosts(currentDraft.denyText))
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error)
          const message = t("options.saveListsFailed", { detail })
          setSaveError(message)
          return
        }
      }

      setSavedDraft(currentDraft)
      showToast(t("options.saved"))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setSaveError(message)
    } finally {
      setSaving(false)
    }
  }

  function discardChanges() {
    if (!savedDraft) return
    applyDraft(savedDraft)
    setModelTouched(false)
    setSaveError(null)
  }

  async function unpair() {
    if (!window.confirm(t("options.confirmDisconnect"))) return
    const response = await request({ type: "unpair" })
    if (response.ok) {
      setSnapshot(response.snapshot ?? null)
      showToast(t("options.disconnected"))
    } else showToast(response.error)
  }

  async function openPanel() {
    try {
      const window = await chrome.windows.getCurrent()
      if (window.id !== undefined) {
        await chrome.sidePanel.open({ windowId: window.id })
        return
      }
    } catch {
      // fall through
    }
    await chrome.tabs.create({ url: chrome.runtime.getURL("sidepanel.html") })
  }

  if (!snapshot) {
    return (
      <div className="options-page">
        <div className="options-shell">
          <p className="lead">{t("app.loading")}</p>
        </div>
      </div>
    )
  }

  const config: OpencodeConfig | null = snapshot.config

  return (
    <div className="options-page">
      <div className="options-shell">
        <div className="row">
          <span className="brand-mark">
            <TerminalIcon size={14} />
          </span>
          <h1>{t("options.title")}</h1>
          <span className="spacer" />
          <button className="btn" onClick={() => void openPanel()}>
            {t("options.openPanel")}
          </button>
        </div>
        <p className="lead">{t("options.lead")}</p>

        {config ? (
          <nav className="options-nav" aria-label={t("options.navigation")}>
            <a href="#options-language">{t("options.language.title")}</a>
            <a href="#options-connection">{t("options.connection")}</a>
            <a href="#options-sessions">{t("options.sessions")}</a>
            <a href="#options-access">{t("options.permissions")}</a>
            <a href="#options-behavior">{t("options.behavior")}</a>
            <a href="#options-chat">{t("options.chat")}</a>
          </nav>
        ) : null}

        {config && savedDraft ? (
          <div className="options-savebar">
            <div
              className={`options-savebar-state${hasChanges ? " pending" : ""}`}
              role="status"
              aria-live="polite"
            >
              <span className={`dot ${hasChanges ? "warn" : "ok"}`} />
              {saving
                ? t("options.saving")
                : hasChanges
                  ? t("options.unsaved")
                  : t("options.savedStatus")}
            </div>
            <div className="options-savebar-actions">
              <button
                className="btn"
                disabled={!hasChanges || saving}
                onClick={discardChanges}
              >
                {t("options.discard")}
              </button>
              <button
                className="btn primary"
                disabled={!hasChanges || saving}
                onClick={() => void saveSettings()}
              >
                {saving ? t("options.saving") : t("options.saveChanges")}
              </button>
            </div>
            {saveError ? (
              <p className="options-save-error" role="alert">
                {saveError}
              </p>
            ) : null}
          </div>
        ) : null}

        <section className="card" id="options-language">
          <h2>{t("options.language.title")}</h2>
          <div className="field">
            <label htmlFor="language">{t("options.language.label")}</label>
            <select
              id="language"
              className="select"
              value={language}
              onChange={(event) => {
                const value = event.target.value as LocalePreference
                setLanguage(value)
                void applyLocalePreference(value)
              }}
            >
              <option value="auto">{t("options.language.auto")}</option>
              <option value="pt-BR">Português (Brasil)</option>
              <option value="en">English</option>
            </select>
            <p className="desc">{t("options.language.hint")}</p>
          </div>
        </section>

        <section className="card" id="options-connection">
          <h2>{t("options.connection")}</h2>
          <div className="status-line">
            <div className="status-detail">
              <span
                className={`dot ${
                  snapshot.connection.phase === "online"
                    ? "ok"
                    : snapshot.connection.phase === "offline"
                      ? "err"
                      : "warn"
                }`}
              />
              <span className="status-label">
                {t("options.api", { state: describeConnection(snapshot.connection, t) })}
              </span>
            </div>
            {config ? (
              <button className="btn small" onClick={() => void reconnectBackend()}>
                <RefreshIcon size={13} /> {t("options.reconnect")}
              </button>
            ) : null}
          </div>
          <div className="status-line">
            <div className="status-detail">
              <span className={`dot ${snapshot.relay.connected ? "ok" : "warn"}`} />
              <span className="status-label">
                {t("options.tools", { state: describeRelay(snapshot.relay, locale) })}
              </span>
            </div>
            <button className="btn small" onClick={() => void request({ type: "relay:reconnect" })}>
              <RefreshIcon size={13} /> {t("options.reconnectPlugin")}
            </button>
          </div>
          {config ? (
            <>
              <dl className="kv">
                <dt>{t("options.server")}</dt>
                <dd>{config.baseUrl}</dd>
                <dt>{t("options.token")}</dt>
                <dd>{t("options.tokenHidden", { head: config.token.slice(0, 6), tail: config.token.slice(-4) })}</dd>
              </dl>
              <div className="row">
                <button className="btn danger" disabled={saving} onClick={() => void unpair()}>
                  {t("options.disconnect")}
                </button>
              </div>
            </>
          ) : (
            <div className="field">
              <label htmlFor="pair">{t("options.pairLabel")}</label>
              <input
                id="pair"
                className="input"
                value={link}
                onChange={(event) => setLink(event.target.value)}
                placeholder="http://127.0.0.1:49374/auth/connect/..."
                spellCheck={false}
              />
              <div className="row">
                <button className="btn primary" disabled={busy || !link.trim()} onClick={() => void pair()}>
                  {busy ? t("options.pairBusy") : t("options.pairAction")}
                </button>
              </div>
            </div>
          )}
        </section>

        {config ? (
          <fieldset className="options-form" disabled={saving}>
            <section className="card" id="options-sessions">
              <h2>{t("options.sessions")}</h2>
              <div className="field">
                <span className="field-label">{t("options.defaultModel")}</span>
                <p className="desc">{t("options.defaultModelHint")}</p>
                <div className="row wrap">
                  <ModelPicker
                    models={snapshot.models}
                    value={defaultModel}
                    onChange={(model) => {
                      setDefaultModel(model)
                      setModelTouched(true)
                    }}
                  />
                </div>
                <p className="desc">
                  {t("options.modelsCount", { count: snapshot.models.length })}
                </p>
              </div>
              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={followTabGroups}
                  onChange={(event) => setFollowTabGroups(event.target.checked)}
                />
                <span>{t("options.followGroups")}</span>
              </label>
              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={autoGroupNewSessions}
                  onChange={(event) => setAutoGroupNewSessions(event.target.checked)}
                />
                <span>{t("options.autoGroup")}</span>
              </label>
              <div className="field">
                <label htmlFor="workspace">{t("options.workspace.label")}</label>
                <input
                  id="workspace"
                  className="input"
                  value={workspace}
                  onChange={(event) => setWorkspace(event.target.value)}
                  placeholder="~/.opencode-browser-extensions"
                  spellCheck={false}
                />
                <p className="desc">
                  {t("options.workspace.hint")} <code>~/.opencode-browser-extensions</code>).
                </p>
              </div>
            </section>

            <section className="card" id="options-access">
              <h2>{t("options.permissions")}</h2>
              <p className="desc">{t("options.permissionsHint")}</p>
              <div className="radio-row">
                {(
                  [
                    ["ask", t("options.mode.ask"), t("options.mode.askHint")],
                    ["allow", t("options.mode.allow"), t("options.mode.allowHint")],
                    ["deny", t("options.mode.deny"), t("options.mode.denyHint")],
                  ] as const
                ).map(([value, label, description]) => (
                  <label key={value}>
                    <input
                      type="radio"
                      name="permission-mode"
                      checked={mode === value}
                      onChange={() => setMode(value)}
                    />
                    <span>
                      <strong>{label}</strong>
                      <br />
                      <span className="desc">{description}</span>
                    </span>
                  </label>
                ))}
              </div>
              {mode === "allow" ? (
                <p className="permission-warning" role="note">
                  {t("options.mode.allowWarning")}
                </p>
              ) : null}
              <div className="field">
                <label htmlFor="timeout">{t("options.timeout")}</label>
                <select
                  id="timeout"
                  className="select"
                  value={timeoutSeconds}
                  onChange={(event) => setTimeoutSeconds(Number(event.target.value))}
                >
                  <option value={30}>{t("options.timeout.30")}</option>
                  <option value={60}>{t("options.timeout.60")}</option>
                  <option value={120}>{t("options.timeout.120")}</option>
                  <option value={300}>{t("options.timeout.300")}</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="allow">{t("options.allowList")}</label>
                <textarea
                  id="allow"
                  className="textarea"
                  value={allowText}
                  onChange={(event) => setAllowText(event.target.value)}
                  placeholder={"github.com\nexample.com"}
                  spellCheck={false}
                />
              </div>
              <div className="field">
                <label htmlFor="deny">{t("options.denyList")}</label>
                <textarea
                  id="deny"
                  className="textarea"
                  value={denyText}
                  onChange={(event) => setDenyText(event.target.value)}
                  placeholder="banco.com"
                  spellCheck={false}
                />
              </div>
              <details className="options-details">
                <summary>{t("options.security")}</summary>
                <p className="desc">{t("options.securityHint")}</p>
              </details>
            </section>

            <section className="card" id="options-behavior">
              <h2>{t("options.behavior")}</h2>
              <div className="field">
                <label htmlFor="find-mode">{t("options.findMode")}</label>
                <select
                  id="find-mode"
                  className="select"
                  value={findMode}
                  onChange={(event) => setFindMode(event.target.value as "heuristic" | "model")}
                >
                  <option value="heuristic">{t("options.findMode.heuristic")}</option>
                  <option value="model">{t("options.findMode.model")}</option>
                </select>
              </div>
              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={soundEnabled}
                  onChange={(event) => setSoundEnabled(event.target.checked)}
                />
                <span>{t("options.sound")}</span>
              </label>
              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={notifyEnabled}
                  onChange={(event) => setNotifyEnabled(event.target.checked)}
                />
                <span>{t("options.notify")}</span>
              </label>
              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={bringTabsToFront}
                  onChange={(event) => setBringTabsToFront(event.target.checked)}
                />
                <span>{t("options.bringToFront")}</span>
              </label>
            </section>

            <section className="card" id="options-chat">
              <h2>{t("options.chat")}</h2>
              <div className="field">
                <label htmlFor="tool-display">{t("options.toolDisplay")}</label>
                <select
                  id="tool-display"
                  className="select"
                  value={toolDisplay}
                  onChange={(event) =>
                    setToolDisplay(
                      event.target.value as "grouped" | "rows" | "full" | "hidden",
                    )
                  }
                >
                  <option value="grouped">{t("options.toolDisplay.grouped")}</option>
                  <option value="rows">{t("options.toolDisplay.rows")}</option>
                  <option value="full">{t("options.toolDisplay.full")}</option>
                  <option value="hidden">{t("options.toolDisplay.hidden")}</option>
                </select>
                <p className="desc">{t("options.toolDisplayHint")}</p>
              </div>
              <details className="options-details">
                <summary>{t("options.browserTools")}</summary>
                <p className="desc">{t("options.browserToolsHint")}</p>
                <dl className="kv tools">
                  {TOOLS.map((name) => (
                    <div className="tool-definition" key={name}>
                      <dt>{name}</dt>
                      <dd>{t(`options.tool.${name}`)}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            </section>
          </fieldset>
        ) : null}
      </div>
      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  )
}
