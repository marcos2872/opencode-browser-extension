import { useState } from "react"
import type { FormAnswer, FormField, FormInfo } from "../shared/types"
import { CheckIcon, XIcon } from "./icons"

type DraftValue = string | string[] | boolean

interface Props {
  form: FormInfo
  busy?: boolean
  onSubmit: (answer: FormAnswer) => void
  onCancel?: () => void
}

function initialDraft(fields: FormField[]): Record<string, DraftValue> {
  const draft: Record<string, DraftValue> = {}
  for (const field of fields) {
    if (field.type === "boolean") draft[field.key] = field.default ?? false
    else if (field.type === "multiselect") draft[field.key] = [...(field.default ?? [])]
    else if (field.type === "number" || field.type === "integer")
      draft[field.key] = field.default === undefined ? "" : String(field.default)
    else if (field.type === "string") draft[field.key] = field.default ?? ""
    else draft[field.key] = ""
  }
  return draft
}

export function buildFormAnswer(
  fields: FormField[],
  draft: Record<string, DraftValue>,
  custom: Record<string, string>,
): FormAnswer {
  const answer: FormAnswer = {}
  for (const field of fields) {
    if (field.type === "external") continue
    const value = draft[field.key]
    if (field.type === "boolean") {
      answer[field.key] = value === true
      continue
    }
    if (field.type === "multiselect") {
      const selected = Array.isArray(value) ? value : []
      const extra = (custom[field.key] ?? "").trim()
      const list = extra ? [...selected, extra] : selected
      if (list.length > 0) answer[field.key] = list
      continue
    }
    if (field.type === "number" || field.type === "integer") {
      const text = String(value ?? "").trim()
      if (!text) continue
      const parsed = Number(text)
      if (Number.isFinite(parsed)) {
        answer[field.key] = field.type === "integer" ? Math.trunc(parsed) : parsed
      }
      continue
    }
    const text = (custom[field.key] ?? "").trim() || String(value ?? "").trim()
    if (text) answer[field.key] = text
  }
  return answer
}

function isComplete(fields: FormField[], answer: FormAnswer): boolean {
  return fields.every((field) => {
    if (!field.required || field.type === "external") return true
    const value = answer[field.key]
    if (value === undefined) return false
    if (Array.isArray(value)) return value.length > 0
    if (typeof value === "string") return value.length > 0
    // Booleano obrigatório já está "respondido" com true ou false; exigir `true`
    // impediria responder "não" com um único checkbox.
    return true
  })
}

export function FormCard({ form, busy, onSubmit, onCancel }: Props) {
  const fields = form.fields.filter((field) => !field.hidden)
  const [draft, setDraft] = useState<Record<string, DraftValue>>(() => initialDraft(fields))
  const [custom, setCustom] = useState<Record<string, string>>({})

  const answer = buildFormAnswer(fields, draft, custom)
  const ready = isComplete(fields, answer)

  function setValue(key: string, value: DraftValue) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  function setCustomText(key: string, text: string) {
    setCustom((current) => ({ ...current, [key]: text }))
  }

  function toggleOption(key: string, option: string) {
    const current = draft[key]
    const list = Array.isArray(current) ? current : []
    setValue(key, list.includes(option) ? list.filter((item) => item !== option) : [...list, option])
  }

  if (fields.length === 0) return null

  return (
    <div className="form-card" role="group" aria-label={form.title || "Pergunta"}>
      {form.title && form.title !== "Questions" ? <h4>{form.title}</h4> : null}

      {fields.map((field) => {
        const value = draft[field.key]
        return (
          <div className="form-field" key={field.key}>
            {field.title ? <div className="form-field-title">{field.title}</div> : null}
            {field.description ? <p className="sub">{field.description}</p> : null}

            {field.type === "boolean" ? (
              <label className="form-check">
                <input
                  type="checkbox"
                  checked={value === true}
                  disabled={busy}
                  onChange={(event) => setValue(field.key, event.target.checked)}
                />
                <span>Sim</span>
              </label>
            ) : null}

            {field.type === "external" ? (
              <a className="form-external" href={field.url} target="_blank" rel="noreferrer">
                {field.url}
              </a>
            ) : null}

            {field.type === "string" && field.options?.length ? (
              <div className="form-options">
                {field.options.map((option) => (
                  <button
                    type="button"
                    key={option.value}
                    className={`form-option ${value === option.value ? "selected" : ""}`}
                    disabled={busy}
                    onClick={() => {
                      setCustomText(field.key, "")
                      setValue(field.key, option.value)
                    }}
                  >
                    <span className="form-option-label">{option.label}</span>
                    {option.description ? (
                      <span className="form-option-desc">{option.description}</span>
                    ) : null}
                  </button>
                ))}
                {field.custom ? (
                  <input
                    className="form-input"
                    type="text"
                    placeholder="Outra resposta"
                    value={custom[field.key] ?? ""}
                    disabled={busy}
                    onChange={(event) => {
                      setValue(field.key, "")
                      setCustomText(field.key, event.target.value)
                    }}
                  />
                ) : null}
              </div>
            ) : null}

            {field.type === "string" && !field.options?.length ? (
              <input
                className="form-input"
                type="text"
                placeholder={field.placeholder}
                value={typeof value === "string" ? value : ""}
                disabled={busy}
                onChange={(event) => setValue(field.key, event.target.value)}
              />
            ) : null}

            {field.type === "multiselect" ? (
              <div className="form-options">
                {field.options.map((option) => {
                  const selected = Array.isArray(value) && value.includes(option.value)
                  return (
                    <button
                      type="button"
                      key={option.value}
                      className={`form-option ${selected ? "selected" : ""}`}
                      disabled={busy}
                      onClick={() => toggleOption(field.key, option.value)}
                    >
                      <span className="form-option-label">{option.label}</span>
                      {option.description ? (
                        <span className="form-option-desc">{option.description}</span>
                      ) : null}
                    </button>
                  )
                })}
                {field.custom ? (
                  <input
                    className="form-input"
                    type="text"
                    placeholder="Outra resposta"
                    value={custom[field.key] ?? ""}
                    disabled={busy}
                    onChange={(event) => setCustomText(field.key, event.target.value)}
                  />
                ) : null}
              </div>
            ) : null}

            {field.type === "number" || field.type === "integer" ? (
              <input
                className="form-input"
                type="number"
                min={field.minimum}
                max={field.maximum}
                step={field.type === "integer" ? 1 : "any"}
                value={typeof value === "string" ? value : ""}
                disabled={busy}
                onChange={(event) => setValue(field.key, event.target.value)}
              />
            ) : null}
          </div>
        )
      })}

      <div className="form-actions">
        <button className="btn primary" disabled={busy || !ready} onClick={() => onSubmit(answer)}>
          <CheckIcon size={15} /> Responder
        </button>
        {onCancel ? (
          <button className="btn" disabled={busy} onClick={onCancel}>
            <XIcon size={15} /> Cancelar
          </button>
        ) : null}
      </div>
    </div>
  )
}
