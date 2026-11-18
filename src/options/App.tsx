import { useEffect, useState } from "react"
import type { AppSnapshot, ConnectionState, ModelRef, OpencodeConfig, PermissionMode } from "../shared/types"
import { ModelPicker } from "../sidepanel/ModelPicker"
import { request } from "../sidepanel/api"
import { RefreshIcon, TerminalIcon } from "../components/icons"
import { describeRelay } from "../components/relayStatus"
import { useI18n } from "../shared/i18n/react"
import { applyLocalePreference, loadLocale, watchLocalePreference } from "../shared/i18n/runtime"
import { getLocalePreference } from "../shared/storage"
import type { LocalePreference, Translate } from "../shared/i18n"

const ALLOW_KEY = "permissions.allow"
const DENY_KEY = "permissions.deny"

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

export default function App() {
  const { t, locale } = useI18n()
  const [language, setLanguage] = useState<LocalePreference>("auto")
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null)
  const [allowText, setAllowText] = useState("")
  const [denyText, setDenyText] = useState("")
  const [mode, setMode] = useState<PermissionMode>("allow")
  const [defaultModel, setDefaultModel] = useState<ModelRef | null>(null)
  const [modelTouched, setModelTouched] = useState(false)
  const [defaultAgent, setDefaultAgent] = useState<string>("")
  const [findMode, setFindMode] = useState<"heuristic" | "model">("heuristic")
  const [timeoutSeconds, setTimeoutSeconds] = useState(60)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [notifyEnabled, setNotifyEnabled] = useState(true)
  const [bringTabsToFront, setBringTabsToFront] = useState(false)
  const [toolDisplay, setToolDisplay] = useState<"grouped" | "rows" | "full" | "hidden">("grouped")
  const [browserAgentDefault, setBrowserAgentDefault] = useState(true)
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

  useEffect(() => {
    void loadLocale()
    watchLocalePreference()
    void getLocalePreference().then((value) => setLanguage(value ?? "auto"))
    void request({ type: "state:get" }).then((response) => {
      if (response.ok && response.snapshot) {
        setSnapshot(response.snapshot)
        setMode(response.snapshot.config?.permissionMode ?? "allow")
        setDefaultModel(response.snapshot.config?.defaultModel ?? response.snapshot.defaultModel ?? null)
        setDefaultAgent(response.snapshot.config?.defaultAgent ?? "build")
        setFindMode(response.snapshot.config?.findMode ?? "heuristic")
        setTimeoutSeconds(Math.round((response.snapshot.config?.permissionTimeoutMs ?? 60_000) / 1000))
        setSoundEnabled(response.snapshot.config?.soundEnabled !== false)
        setNotifyEnabled(response.snapshot.config?.notifyEnabled !== false)
        setBringTabsToFront(response.snapshot.config?.bringTabsToFront === true)
        setToolDisplay(response.snapshot.config?.toolDisplay ?? "grouped")
        setBrowserAgentDefault(response.snapshot.config?.browserAgentDefault !== false)
        setFollowTabGroups(response.snapshot.config?.followTabGroups !== false)
        setAutoGroupNewSessions(response.snapshot.config?.autoGroupNewSessions === true)
        setWorkspace(response.snapshot.config?.directory ?? "")
      }
    })
    void chrome.storage.local.get([ALLOW_KEY, DENY_KEY]).then((data) => {
      setAllowText(Array.isArray(data[ALLOW_KEY]) ? data[ALLOW_KEY].join("\n") : "")
      setDenyText(Array.isArray(data[DENY_KEY]) ? data[DENY_KEY].join("\n") : "")
    })
  }, [])

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
    if (!modelTouched) {
      setDefaultModel(
        response.snapshot?.config?.defaultModel ?? response.snapshot?.defaultModel ?? null,
      )
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

  async function savePermissions() {
    const allow = allowText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
    const deny = denyText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
    // Só envia o modelo padrão quando o usuário mexeu no seletor: `undefined`
    // no patch apagaria o valor salvo (ex.: modelo adotado no pareamento).
    await chrome.storage.local.set({ [ALLOW_KEY]: allow, [DENY_KEY]: deny })
    const response = await request({
      type: "settings:update",
      patch: {
        permissionMode: mode,
        ...(modelTouched ? { defaultModel: defaultModel ?? undefined } : {}),
        defaultAgent: defaultAgent || undefined,
        findMode,
        permissionTimeoutMs: timeoutSeconds * 1000,
        soundEnabled,
        notifyEnabled,
        bringTabsToFront,
        toolDisplay,
        browserAgentDefault,
        followTabGroups,
        autoGroupNewSessions,
        directory: workspace.trim() || undefined,
      },
    })
    if (!response.ok) {
      showToast(response.error)
      return
    }
    setSnapshot((current) =>
      current && response.snapshot ? { ...current, config: response.snapshot.config } : current,
    )
    setModelTouched(false)
    showToast(t("options.saved"))
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

        <section className="card">
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

        <section className="card">
          <h2>{t("options.connection")}</h2>
          <div className="status-line">
            <span
              className={`dot ${
                snapshot.connection.phase === "online"
                  ? "ok"
                  : snapshot.connection.phase === "offline"
                    ? "err"
                    : "warn"
              }`}
            />
            {t("options.api", { state: describeConnection(snapshot.connection, t) })}
            {config ? (
              <button className="btn small" onClick={() => void reconnectBackend()}>
                <RefreshIcon size={13} /> {t("options.reconnect")}
              </button>
            ) : null}
          </div>
          <div className="status-line">
            <span className={`dot ${snapshot.relay.connected ? "ok" : "warn"}`} />
            {t("options.tools", { state: describeRelay(snapshot.relay, locale) })}
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
              <div className="row">
                <button className="btn danger" onClick={() => void unpair()}>
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
          <section className="card">
            <h2>{t("options.defaultModel")}</h2>
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
              {snapshot.agents.length > 0 ? (
                <select
                  className="select"
                  value={defaultAgent}
                  onChange={(event) => setDefaultAgent(event.target.value)}
                  title={t("options.defaultAgentTitle")}
                >
                  {snapshot.agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name ?? agent.id}
                    </option>
                  ))}
                </select>
              ) : null}
              <button className="btn" onClick={() => void savePermissions()}>
                {t("common.save")}
              </button>
            </div>
            <p className="desc">
              {t("options.modelsCount", { count: snapshot.models.length })}
            </p>
            <label className="row" style={{ gap: 8, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={browserAgentDefault}
                onChange={(event) => setBrowserAgentDefault(event.target.checked)}
              />
              <span>{t("options.browserAgentDefault")}</span>
            </label>
            <label className="row" style={{ gap: 8, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={followTabGroups}
                onChange={(event) => setFollowTabGroups(event.target.checked)}
              />
              <span>{t("options.followGroups")}</span>
            </label>
            <label className="row" style={{ gap: 8, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={autoGroupNewSessions}
                onChange={(event) => setAutoGroupNewSessions(event.target.checked)}
              />
              <span>{t("options.autoGroup")}</span>
            </label>
          </section>
        ) : null}

        <section className="card">
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

          <div className="row wrap">
            <label className="desc" htmlFor="timeout">
              {t("options.timeout")}
            </label>
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
            <label className="desc" htmlFor="find-mode">
              {t("options.findMode")}
            </label>
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

          <label className="row" style={{ gap: 8, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={soundEnabled}
              onChange={(event) => setSoundEnabled(event.target.checked)}
            />
            <span>{t("options.sound")}</span>
          </label>

          <label className="row" style={{ gap: 8, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={notifyEnabled}
              onChange={(event) => setNotifyEnabled(event.target.checked)}
            />
            <span>{t("options.notify")}</span>
          </label>

          <label className="row" style={{ gap: 8, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={bringTabsToFront}
              onChange={(event) => setBringTabsToFront(event.target.checked)}
            />
            <span>{t("options.bringToFront")}</span>
          </label>

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
              placeholder={"banco.com"}
              spellCheck={false}
            />
          </div>
          <div className="row">
            <button className="btn primary" onClick={() => void savePermissions()}>
              {t("options.savePermissions")}
            </button>
          </div>
        </section>

        <section className="card">
          <h2>{t("options.browserTools")}</h2>
          <p className="desc">{t("options.browserToolsHint")}</p>
          <dl className="kv tools">
            {TOOLS.map((name) => (
              <div key={name} style={{ display: "contents" }}>
                <dt>{name}</dt>
                <dd style={{ fontFamily: "var(--font)", fontSize: 12 }}>
                  {t(`options.tool.${name}`)}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="card">
          <h2>{t("options.security")}</h2>
          <p className="desc">{t("options.securityHint")}</p>
        </section>
      </div>
      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  )
}
