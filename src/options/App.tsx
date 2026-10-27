import { useEffect, useState } from "react"
import type { AppSnapshot, ConnectionState, ModelRef, OpencodeConfig, PermissionMode } from "../shared/types"
import { ModelPicker } from "../sidepanel/ModelPicker"
import { request } from "../sidepanel/api"
import { RefreshIcon, TerminalIcon } from "../components/icons"
import { describeRelay } from "../components/relayStatus"

const ALLOW_KEY = "permissions.allow"
const DENY_KEY = "permissions.deny"

function describeConnection(connection: ConnectionState): string {
  if (connection.phase === "online") return "online"
  if (connection.phase === "connecting") return "conectando"
  if (connection.phase === "unconfigured") return "não configurada"
  switch (connection.failure) {
    case "unauthorized":
      return "offline — token inválido ou expirado"
    case "timeout":
      return "offline — o servidor não respondeu a tempo"
    case "server_error":
      return "offline — o servidor respondeu com erro"
    case "stream_closed":
      return "offline — conexão encerrada"
    default:
      return "offline — servidor não respondeu"
  }
}

const TOOLS = [
  ["tabs_context", "lista as abas do grupo"],
  ["tabs_create", "cria uma aba no grupo"],
  ["tabs_close", "fecha uma aba do grupo"],
  ["tabs_attach", "move a aba atual para o grupo"],
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
  ["upload_image", "envia arquivos para inputs/drop zones"],
  ["gif_creator", "grava e exporta GIF das ações"],
  ["browser_batch", "executa várias ações em sequência"],
]

export default function App() {
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null)
  const [allowText, setAllowText] = useState("")
  const [denyText, setDenyText] = useState("")
  const [mode, setMode] = useState<PermissionMode>("ask")
  const [defaultModel, setDefaultModel] = useState<ModelRef | null>(null)
  const [defaultAgent, setDefaultAgent] = useState<string>("")
  const [findMode, setFindMode] = useState<"heuristic" | "model">("heuristic")
  const [timeoutSeconds, setTimeoutSeconds] = useState(60)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [notifyEnabled, setNotifyEnabled] = useState(true)
  const [toolDisplay, setToolDisplay] = useState<"grouped" | "rows" | "full">("grouped")
  const [browserAgentDefault, setBrowserAgentDefault] = useState(true)
  const [workspace, setWorkspace] = useState("")
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
        setDefaultAgent(response.snapshot.config?.defaultAgent ?? "build")
        setFindMode(response.snapshot.config?.findMode ?? "heuristic")
        setTimeoutSeconds(Math.round((response.snapshot.config?.permissionTimeoutMs ?? 60_000) / 1000))
        setSoundEnabled(response.snapshot.config?.soundEnabled !== false)
        setNotifyEnabled(response.snapshot.config?.notifyEnabled !== false)
        setToolDisplay(response.snapshot.config?.toolDisplay ?? "grouped")
        setBrowserAgentDefault(response.snapshot.config?.browserAgentDefault !== false)
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
    showToast("Conectado.")
  }

  async function reconnectBackend() {
    const response = await request({ type: "connection:reconnect" })
    if (!response.ok) {
      showToast(response.error)
      return
    }
    if (response.snapshot) setSnapshot(response.snapshot)
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
      patch: {
        permissionMode: mode,
        defaultModel: defaultModel ?? undefined,
        defaultAgent: defaultAgent || undefined,
        findMode,
        permissionTimeoutMs: timeoutSeconds * 1000,
        soundEnabled,
        notifyEnabled,
        toolDisplay,
        browserAgentDefault,
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
            <span
              className={`dot ${
                snapshot.connection.phase === "online"
                  ? "ok"
                  : snapshot.connection.phase === "offline"
                    ? "err"
                    : "warn"
              }`}
            />
            API: {describeConnection(snapshot.connection)}
            {config ? (
              <button className="btn small" onClick={() => void reconnectBackend()}>
                <RefreshIcon size={13} /> Reconectar
              </button>
            ) : null}
          </div>
          <div className="status-line">
            <span className={`dot ${snapshot.relay.connected ? "ok" : "warn"}`} />
            Ferramentas: {describeRelay(snapshot.relay)}
            <button className="btn small" onClick={() => void request({ type: "relay:reconnect" })}>
              <RefreshIcon size={13} /> Reconectar plugin
            </button>
          </div>
          {config ? (
            <>
              <dl className="kv">
                <dt>Servidor</dt>
                <dd>{config.baseUrl}</dd>
                <dt>Token</dt>
                <dd>{config.token.slice(0, 6)}…{config.token.slice(-4)} (oculto)</dd>
              </dl>
              <div className="field">
                <label htmlFor="workspace">Pasta das conversas do navegador</label>
                <input
                  id="workspace"
                  className="input"
                  value={workspace}
                  onChange={(event) => setWorkspace(event.target.value)}
                  placeholder="~/.opencode-browser-extensions"
                  spellCheck={false}
                />
                <p className="desc">
                  As conversas criadas pela extensão ficam nesta pasta e a extensão só lista as
                  que estiverem nela. O plugin cria a pasta e informa o caminho automaticamente
                  (padrão: <code>~/.opencode-browser-extensions</code>).
                </p>
              </div>
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
              {snapshot.agents.length > 0 ? (
                <select
                  className="select"
                  value={defaultAgent}
                  onChange={(event) => setDefaultAgent(event.target.value)}
                  title="Agente padrão"
                >
                  {snapshot.agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name ?? agent.id}
                    </option>
                  ))}
                </select>
              ) : null}
              <button className="btn" onClick={() => void savePermissions()}>
                Salvar
              </button>
            </div>
            <p className="desc">
              {snapshot.models.length} modelo(s) disponível(is). Modelos sem suporte a tools continuam
              servindo para conversar, mas não controlam o navegador.
            </p>
            <label className="row" style={{ gap: 8, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={browserAgentDefault}
                onChange={(event) => setBrowserAgentDefault(event.target.checked)}
              />
              <span>
                Usar o agente `opencode-browser` nas novas sessões (desligue para usar o
                agente selecionado acima)
              </span>
            </label>
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

          <div className="row wrap">
            <label className="desc" htmlFor="timeout">
              Tempo para responder a um pedido:
            </label>
            <select
              id="timeout"
              className="select"
              value={timeoutSeconds}
              onChange={(event) => setTimeoutSeconds(Number(event.target.value))}
            >
              <option value={30}>30 segundos</option>
              <option value={60}>1 minuto</option>
              <option value={120}>2 minutos</option>
              <option value={300}>5 minutos</option>
            </select>
            <label className="desc" htmlFor="find-mode">
              Busca por elemento:
            </label>
            <select
              id="find-mode"
              className="select"
              value={findMode}
              onChange={(event) => setFindMode(event.target.value as "heuristic" | "model")}
            >
              <option value="heuristic">Heurística (grátis)</option>
              <option value="model">Modelo do OpenCode (usa tokens)</option>
            </select>
          </div>

          <label className="row" style={{ gap: 8, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={soundEnabled}
              onChange={(event) => setSoundEnabled(event.target.checked)}
            />
            <span>
              Tocar um aviso sonoro quando o agente terminar ou pedir permissão com o painel fechado
            </span>
          </label>

          <label className="row" style={{ gap: 8, fontSize: 13 }}>
            <input
              type="checkbox"
              checked={notifyEnabled}
              onChange={(event) => setNotifyEnabled(event.target.checked)}
            />
            <span>Mostrar notificação do sistema quando o agente terminar com o painel fechado</span>
          </label>

          <div className="field">
            <label htmlFor="tool-display">Ferramentas no chat</label>
            <select
              id="tool-display"
              className="select"
              value={toolDisplay}
              onChange={(event) =>
                setToolDisplay(event.target.value as "grouped" | "rows" | "full")
              }
            >
              <option value="grouped">Agrupadas (abrem em um modal)</option>
              <option value="rows">Linhas compactas, uma por chamada</option>
              <option value="full">Cards completos, com parâmetros e resultado</option>
            </select>
            <p className="desc">
              No modo agrupado, uma linha resume a execução e abre a lista completa de tools;
              só a ferramenta em execução fica no chat.
            </p>
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
