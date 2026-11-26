import { useEffect, useRef } from "react"
import type { PermissionDecision, PermissionRequest } from "../shared/types"
import { CheckIcon, XIcon } from "./icons"
import { useI18n } from "../shared/i18n/react"
import type { Catalog } from "../shared/i18n"

/** Rótulo por tool; `null` cai no próprio nome da tool. */
const TOOL_LABEL: Partial<Record<string, keyof Catalog>> = {
  navigate: "permission.tool.navigate",
  computer: "permission.tool.computer",
  form_input: "permission.tool.form_input",
  javascript_tool: "permission.tool.javascript_tool",
  tabs_close: "permission.tool.tabs_close",
  upload_image: "permission.tool.upload_image",
  gif_creator: "permission.tool.gif_creator",
  update_plan: "permission.tool.update_plan",
}

interface Props {
  request: PermissionRequest
  /** Nome da sessão de origem quando o pedido não é da conversa exibida. */
  sessionLabel?: string
  onDecision: (decision: PermissionDecision) => void
}

export function PermissionCard({ request, sessionLabel, onDecision }: Props) {
  const { t } = useI18n()
  const dialogRef = useRef<HTMLDivElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const onDecisionRef = useRef(onDecision)

  useEffect(() => {
    onDecisionRef.current = onDecision
  }, [onDecision])

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    headingRef.current?.focus()

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        onDecisionRef.current({ allowed: false })
      }
      if (event.key === "Enter" && !(event.target instanceof HTMLButtonElement)) {
        event.preventDefault()
        onDecisionRef.current({ allowed: true, scope: "once" })
      }
      if (event.key === "Tab") {
        const focusable = Array.from(
          dialogRef.current?.querySelectorAll<HTMLElement>(
            'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ) ?? [],
        )
        const first = focusable[0]
        const last = focusable.at(-1)
        if (!first || !last) {
          event.preventDefault()
        } else if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("keydown", onKey)
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [])

  const isPlan = request.kind === "plan"
  const isDomain = request.kind === "domain"
  const toolKey = TOOL_LABEL[request.tool]
  const tool = toolKey ? t(toolKey) : request.tool

  return (
    <div
      ref={dialogRef}
      className="permission-card"
      role="dialog"
      aria-modal="true"
      aria-label={t("permission.title")}
    >
      <div>
          <h3 ref={headingRef} tabIndex={-1}>{request.title}</h3>
        <p className="sub">
          {sessionLabel
            ? t("permission.session", { label: sessionLabel })
            : isPlan
              ? t("permission.planIntro")
              : isDomain
                ? t("permission.domainIntro")
                : t("permission.actionIntro", { tool })}
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

      {request.screenshot ? <img src={`data:image/png;base64,${request.screenshot}`} alt={t("permission.screenshotAlt")} /> : null}
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
                <CheckIcon size={15} /> {isPlan ? t("permission.approvePlan") : t("permission.allow")}
              </button>
              <button className="btn" onClick={() => onDecision({ allowed: false })}>
                <XIcon size={15} /> {t("permission.deny")}
              </button>
            </div>
            {isDomain ? (
              <button className="btn" onClick={() => onDecision({ allowed: true, scope: "always" })}>
                {t("permission.allowAlwaysDomain", { domain: request.toDomain ?? "" })}
              </button>
            ) : null}
          </>
        ) : (
          <>
            <div className="permission-main-actions">
              <button className="btn primary" onClick={() => onDecision({ allowed: true, scope: "once" })}>
                {t("permission.allowOnce")} <span className="status">Enter</span>
              </button>
              <button className="btn danger" onClick={() => onDecision({ allowed: false })}>
                {t("permission.denyAction")} <span className="status">Esc</span>
              </button>
            </div>
            <div className="permission-scope-actions">
              <span className="permission-scope-label">{t("permission.scopeLabel")}</span>
              <button className="btn" onClick={() => onDecision({ allowed: true, scope: "site" })}>
                {t("permission.allowSession")}
              </button>
              <button className="btn" onClick={() => onDecision({ allowed: true, scope: "always" })}>
                {t("permission.allowAlways", { host: request.host ?? "" })}
              </button>
            </div>
          </>
        )}
      </div>

      <p className="sub">{t("permission.footnote")}</p>
    </div>
  )
}
