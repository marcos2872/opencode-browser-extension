import { useState } from "react"
import type { RelayState } from "../shared/types"
import { describeRelay } from "../components/relayStatus"
import { CheckIcon, LinkIcon, RefreshIcon, TerminalIcon } from "../components/icons"

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

      <h1>Conecte o navegador ao OpenCode da sua máquina</h1>
      <p>
        A extensão usa a API local do <a href="https://opencode.ai/download" target="_blank">OpenCode Terminal (v2)</a>. O pareamento gera um token de uso único e expira
        em 5 minutos. Nada sai do seu computador.
      </p>

      <ol>
        <li>
          No terminal, rode:
          <div className="code-line" style={{ marginTop: 6 }}>
            <code>{PAIR_COMMAND}</code>
            <button className="icon-btn" onClick={() => void copy(PAIR_COMMAND, "pair")} title="Copiar comando">
              {copied === "pair" ? <CheckIcon size={14} /> : <LinkIcon size={14} />}
            </button>
          </div>
        </li>
        <li>Copie o link exibido (o mesmo que abre a interface web do OpenCode) e cole abaixo.</li>
        <li>Clique em conectar.</li>
      </ol>

      <div className="field">
        <label htmlFor="pair-link">Link do `opencode pair`</label>
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
        {busy ? "Conectando..." : "Conectar ao OpenCode"}
      </button>

      <div className="note">
        Dica: você pode rodar `opencode pair` de novo a qualquer momento. O token anterior continua
        válido até você desconectar.
      </div>

      <details className="card" style={{ padding: 12 }}>
        <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 13 }}>
          Instalar o plugin de ferramentas do navegador
        </summary>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
          <p className="desc">
            O chat funciona só com a API. Para o agente controlar o Chrome, instale o plugin no
            OpenCode e reinicie o serviço.
          </p>
          <div className="code-line">
            <code>{PLUGIN_COMMAND}</code>
            <button className="icon-btn" onClick={() => void copy(PLUGIN_COMMAND, "plugin")} title="Copiar comando">
              {copied === "plugin" ? <CheckIcon size={14} /> : <LinkIcon size={14} />}
            </button>
          </div>
          <div className="status-line">
            <span className={`dot ${relay.connected ? "ok" : "warn"}`} />
            {relay.connected ? "Plugin conectado" : describeRelay(relay)}
            <button className="btn small" onClick={onReconnect}>
              <RefreshIcon size={13} /> Reconectar
            </button>
          </div>
        </div>
      </details>
    </div>
  )
}
