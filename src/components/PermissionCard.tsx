import { useEffect } from "react"
import type { PermissionDecision, PermissionRequest } from "../shared/types"
import { CheckIcon, XIcon } from "./icons"

const TOOL_LABEL: Record<string, string> = {
  navigate: "Navegação",
  computer: "Interação com a página",
  form_input: "Preenchimento de formulário",
  javascript_tool: "Execução de JavaScript",
  tabs_close: "Fechamento de aba",
  upload_image: "Upload de imagem",
  update_plan: "Plano de navegação",
}

interface Props {
  request: PermissionRequest
  /** Nome da sessão de origem quando o pedido não é da conversa exibida. */
  sessionLabel?: string
  onDecision: (decision: PermissionDecision) => void
}

export function PermissionCard({ request, sessionLabel, onDecision }: Props) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        onDecision({ allowed: false })
      }
      if (event.key === "Enter" && !(event.target instanceof HTMLButtonElement)) {
        event.preventDefault()
        onDecision({ allowed: true, scope: "once" })
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onDecision])

  const isPlan = request.kind === "plan"
  const isDomain = request.kind === "domain"
  const tool = TOOL_LABEL[request.tool] ?? request.tool

  return (
    <div
      className="permission-card"
      role="dialog"
      aria-modal="true"
      aria-label="Pedido de permissão"
    >
      <div>
        <h3>{request.title}</h3>
        <p className="sub">
          {sessionLabel
            ? `Sessão: ${sessionLabel}`
            : isPlan
              ? "O agente quer visitar estes domínios antes de continuar."
              : isDomain
                ? "O agente quer mudar de domínio. Isso muda o que ele pode acessar."
                : `${tool} · pedido de permissão`}
        </p>
      </div>

      {request.host ? (
        <div className="permission-host">
          <span className="dot warn" />
          <span>{request.host}</span>
        </div>
      ) : null}

      {request.detail && !isPlan ? <p className="sub">{request.detail}</p> : null}

      {isPlan && request.plan ? (
        <>
          <div className="chips">
            {request.plan.domains.map((domain) => (
              <span className="chip" key={domain}>
                {domain}
              </span>
            ))}
          </div>
          <ol className="plan-list">
            {request.plan.approach.map((step, index) => (
              <li key={index}>{step}</li>
            ))}
          </ol>
        </>
      ) : null}

      {request.screenshot ? <img src={`data:image/png;base64,${request.screenshot}`} alt="Prévia da ação" /> : null}
      {request.text ? <div className="permission-preview">{request.text}</div> : null}

      {isDomain && request.fromDomain && request.toDomain ? (
        <div className="permission-host">
          {request.fromDomain} → {request.toDomain}
        </div>
      ) : null}

      <div className="permission-actions">
        {isPlan || isDomain ? (
          <>
            <div className="row">
              <button className="btn primary" onClick={() => onDecision({ allowed: true, scope: "site" })}>
                <CheckIcon size={15} /> {isPlan ? "Aprovar plano" : "Permitir"}
              </button>
              <button className="btn" onClick={() => onDecision({ allowed: false })}>
                <XIcon size={15} /> Recusar
              </button>
            </div>
            {isDomain ? (
              <button className="btn" onClick={() => onDecision({ allowed: true, scope: "always" })}>
                Permitir sempre para {request.toDomain}
              </button>
            ) : null}
          </>
        ) : (
          <>
            <button className="btn primary" onClick={() => onDecision({ allowed: true, scope: "once" })}>
              Permitir uma vez <span className="status">Enter</span>
            </button>
            <button className="btn" onClick={() => onDecision({ allowed: true, scope: "site" })}>
              Permitir nesta sessão
            </button>
            <button className="btn" onClick={() => onDecision({ allowed: true, scope: "always" })}>
              Permitir sempre para {request.host || "este site"}
            </button>
            <button className="btn danger" onClick={() => onDecision({ allowed: false })}>
              Negar <span className="status">Esc</span>
            </button>
          </>
        )}
      </div>

      <p className="sub">
        Você pode revogar permissões em Configurações. O agente nunca deve comprar, criar contas ou
        burlar captchas sem sua confirmação.
      </p>
    </div>
  )
}
