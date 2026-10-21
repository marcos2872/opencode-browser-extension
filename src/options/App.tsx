import { useEffect, useState } from "react"
import type { AppSnapshot, ModelRef, OpencodeConfig, PermissionMode } from "../shared/types"
import { ModelPicker } from "../sidepanel/ModelPicker"
import { request } from "../sidepanel/api"
import { RefreshIcon, TerminalIcon } from "../components/icons"

const ALLOW_KEY = "permissions.allow"
const DENY_KEY = "permissions.deny"

const TOOLS = [
  ["tabs_context", "lista as abas do grupo"],
  ["tabs_create", "cria uma aba no grupo"],
  ["tabs_close", "fecha uma aba do grupo"],
  ["navigate", "navega, volta e avança"],
  ["read_page", "árvore de acessibilidade com refs"],
  ["find", "busca elementos por texto/role"],
  ["get_page_text", "extrai o texto principal"],
  ["form_input", "preenche campos por ref"],
  ["computer", "clique, digitação, teclas, scroll, screenshot"],
  ["javascript_tool", "executa JS na página"],
  ["read_console_messages", "lê console e erros"],
  ["read_network_requests", "lê requisições de rede"],
  ["resize_window", "redimensiona a janela"],
  ["update_plan", "pede aprovação de domínios"],
  ["browser_batch", "executa várias ações em sequência"],
]

export default function App() {
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null)
  const [allowText, setAllowText] = useState("")
  const [denyText, setDenyText] = useState("")
  const [mode, setMode] = useState<PermissionMode>("ask")
  const [defaultModel, setDefaultModel] = useState<ModelRef | null>(null)
  const [link, setLink] = useState("")
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  function showToast(message: string) {
    setToast(message)
    setTimeout(() => setToast((current) => (current === message ? null : current)), 3000)
  }

  useEffect(() => {
    void request({ type: "state:get" }).then((response) => {
      if (response.ok && response.snapshot) {
        setSnapshot(response.snapshot)
        setMode(response.snapshot.config?.permissionMode ?? "ask")
        setDefaultModel(response.snapshot.config?.defaultModel ?? response.snapshot.defaultModel ?? null)
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
    showToast("Conectado.")
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
    await chrome.storage.local.set({ [ALLOW_KEY]: allow, [DENY_KEY]: deny })
    const response = await request({
      type: "settings:update",
      patch: { permissionMode: mode, defaultModel: defaultModel ?? undefined },
    })
    if (!response.ok) {
      showToast(response.error)
      return
    }
    setSnapshot((current) =>
      current && response.snapshot ? { ...current, config: response.snapshot.config } : current,
    )
    showToast("Permissões salvas.")
  }

  async function unpair() {
    if (!window.confirm("Desconectar deste OpenCode? O token será removido.")) return
    const response = await request({ type: "unpair" })
    if (response.ok) {
      setSnapshot(response.snapshot ?? null)
      showToast("Desconectado.")
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
          <p className="lead">Carregando...</p>
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
          <h1>OpenCode Browser</h1>
          <span className="spacer" />
          <button className="btn" onClick={() => void openPanel()}>
            Abrir painel
          </button>
        </div>
        <p className="lead">
          Configurações da extensão que conecta o Chrome aos modelos do OpenCode local.
        </p>

        <section className="card">
          <h2>Conexão</h2>
          <div className="status-line">
            <span className={`dot ${snapshot.backend === "online" ? "ok" : snapshot.backend === "offline" ? "err" : "warn"}`} />
            API: {snapshot.backend === "online" ? "online" : snapshot.backend === "offline" ? "offline" : "desconhecida"}
          </div>
          <div className="status-line">
            <span className={`dot ${snapshot.relay.connected ? "ok" : "warn"}`} />
            Ferramentas: {snapshot.relay.connected ? "plugin conectado" : snapshot.relay.lastError ?? "plugin desconectado"}
            <button className="btn small" onClick={() => void request({ type: "relay:reconnect" })}>
              <RefreshIcon size={13} /> Reconectar
            </button>
          </div>
          {config ? (
            <>
              <dl className="kv">
                <dt>Servidor</dt>
                <dd>{config.baseUrl}</dd>
                <dt>Token</dt>
                <dd>{config.token.slice(0, 6)}…{config.token.slice(-4)} (oculto)</dd>
                <dt>Diretório</dt>
                <dd>{config.directory ?? "padrão do servidor"}</dd>
              </dl>
              <div className="row">
                <button className="btn danger" onClick={() => void unpair()}>
                  Desconectar
                </button>
              </div>
            </>
          ) : (
            <div className="field">
              <label htmlFor="pair">Link do `opencode pair`</label>
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
                  {busy ? "Conectando..." : "Conectar"}
                </button>
              </div>
            </div>
          )}
        </section>

        {config ? (
          <section className="card">
            <h2>Modelo padrão</h2>
            <p className="desc">
              Usado ao criar novas sessões. Você pode trocar por conversa no seletor do painel.
            </p>
            <div className="row wrap">
              <ModelPicker
                models={snapshot.models}
                value={defaultModel}
                onChange={(model) => setDefaultModel(model)}
              />
              <button className="btn" onClick={() => void savePermissions()}>
                Salvar
              </button>
            </div>
            <p className="desc">
              {snapshot.models.length} modelo(s) disponível(is). Modelos sem suporte a tools continuam
              servindo para conversar, mas não controlam o navegador.
            </p>
          </section>
        ) : null}

        <section className="card">
          <h2>Permissões</h2>
          <p className="desc">
            Ações que mudam a página (clicar, digitar, navegar, executar JS) pedem confirmação. Leitura
            de página, console e rede é liberada.
          </p>
          <div className="radio-row">
            {(
              [
                ["ask", "Perguntar a cada site (recomendado)", "Pede na primeira ação em cada domínio."],
                ["allow", "Permitir ações automaticamente", "Não pergunta; usa a lista de bloqueio abaixo."],
                ["deny", "Bloquear ações", "Só leitura; nenhuma interação é executada."],
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

          <div className="field">
            <label htmlFor="allow">Sites sempre permitidos (um por linha)</label>
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
            <label htmlFor="deny">Sites sempre bloqueados (um por linha)</label>
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
              Salvar permissões
            </button>
          </div>
        </section>

        <section className="card">
          <h2>Ferramentas do navegador</h2>
          <p className="desc">
            Expostas ao OpenCode pelo plugin `browser-relay` (namespace `browser`). O agente só vê
            abas do grupo criado para a sessão.
          </p>
          <dl className="kv tools">
            {TOOLS.map(([name, description]) => (
              <div key={name} style={{ display: "contents" }}>
                <dt>{name}</dt>
                <dd style={{ fontFamily: "var(--font)", fontSize: 12 }}>{description}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="card">
          <h2>Segurança</h2>
          <p className="desc">
            O token de pareamento fica no `chrome.storage.local` deste navegador e é enviado apenas
            para o servidor local do OpenCode. O plugin escuta em `ws://127.0.0.1:8799` e aceita
            somente a origem desta extensão. Ainda assim, trate automação de navegador como código:
            revise as permissões e nunca deixe o modo "permitir automaticamente" ligado em sites
            sensíveis.
          </p>
        </section>
      </div>
      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  )
}
