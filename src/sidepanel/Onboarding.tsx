import { useState } from "react"
import type { RelayState } from "../shared/types"
import { describeRelay } from "../components/relayStatus"
import { CheckIcon, LinkIcon, RefreshIcon, TerminalIcon } from "../components/icons"
import { useI18n } from "../shared/i18n/react"

interface Props {
  relay: RelayState
  error?: string | null
  busy: boolean
  onPair: (link: string) => Promise<void>
  onReconnect: () => void
}

const PAIR_COMMAND = "opencode pair"
const PLUGIN_COMMAND = "cp plugin/browser-relay.ts ~/.config/opencode/plugins/"

export function Onboarding({ relay, error, busy, onPair, onReconnect }: Props) {
  const { t } = useI18n()
  const [link, setLink] = useState("")
  const [copied, setCopied] = useState<string | null>(null)

  async function copy(value: string, key: string) {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(key)
      setTimeout(() => setCopied(null), 1500)
    } catch {
      // clipboard may be blocked
    }
  }

  return (
    <div className="onboarding">
      <div className="brand">
        <span className="brand-mark">
          <span style={{ display: "grid", placeItems: "center" }}>
            <TerminalIcon size={14} />
          </span>
        </span>
        <span>OpenCode Browser</span>
      </div>

      <h1>{t("onboarding.title")}</h1>
      <p>
        {t("onboarding.intro.1")} <a href="https://opencode.ai/download" target="_blank">{t("onboarding.intro.product")}</a>
        {t("onboarding.intro.2")}
      </p>

      <ol>
        <li>
          {t("onboarding.step1")}
          <div className="code-line" style={{ marginTop: 6 }}>
            <code>{PAIR_COMMAND}</code>
            <button className="icon-btn" onClick={() => void copy(PAIR_COMMAND, "pair")} title={t("app.copyCommand")}>
              {copied === "pair" ? <CheckIcon size={14} /> : <LinkIcon size={14} />}
            </button>
          </div>
        </li>
        <li>{t("onboarding.step2")}</li>
        <li>{t("onboarding.step3")}</li>
      </ol>

      <div className="field">
        <label htmlFor="pair-link">{t("onboarding.pairLabel")}</label>
        <input
          id="pair-link"
          className="input"
          value={link}
          onChange={(event) => setLink(event.target.value)}
          placeholder="http://127.0.0.1:49374/auth/connect/..."
          spellCheck={false}
          onKeyDown={(event) => {
            if (event.key === "Enter" && link.trim() && !busy) void onPair(link.trim())
          }}
        />
      </div>

      {error ? <div className="error-banner">{error}</div> : null}

      <button
        className="btn primary"
        disabled={busy || !link.trim()}
        onClick={() => void onPair(link.trim())}
      >
        {busy ? t("onboarding.pairBusy") : t("onboarding.pairAction")}
      </button>

      <div className="note">{t("onboarding.tip")}</div>

      <details className="card" style={{ padding: 12 }}>
        <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 13 }}>
          {t("onboarding.plugin.title")}
        </summary>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
          <p className="desc">{t("onboarding.plugin.body")}</p>
          <div className="code-line">
            <code>{PLUGIN_COMMAND}</code>
            <button className="icon-btn" onClick={() => void copy(PLUGIN_COMMAND, "plugin")} title={t("app.copyCommand")}>
              {copied === "plugin" ? <CheckIcon size={14} /> : <LinkIcon size={14} />}
            </button>
          </div>
          <div className="status-line">
            <span className={`dot ${relay.connected ? "ok" : "warn"}`} />
            {relay.connected ? t("onboarding.plugin.connected") : describeRelay(relay)}
            <button className="btn small" onClick={onReconnect}>
              <RefreshIcon size={13} /> {t("onboarding.plugin.reconnect")}
            </button>
          </div>
        </div>
      </details>
    </div>
  )
}
