import type { ModelInfo, ModelRef } from "../shared/types"

interface Props {
  models: ModelInfo[]
  value: ModelRef | null
  disabled?: boolean
  compact?: boolean
  onChange: (model: ModelRef) => void
}

const keyOf = (model: { providerID: string; id: string }) => `${model.providerID}/${model.id}`

export function ModelPicker({ models, value, disabled, compact, onChange }: Props) {
  const selected = value ? keyOf(value) : ""
  const groups = new Map<string, ModelInfo[]>()
  for (const model of models) {
    const list = groups.get(model.providerID) ?? []
    list.push(model)
    groups.set(model.providerID, list)
  }
  const current = models.find((model) => keyOf(model) === selected)
  const variants = current?.variants ?? []

  return (
    <>
      <select
        className={`select model-select${compact ? " compact" : ""}`}
        value={selected}
        disabled={disabled || models.length === 0}
        onChange={(event) => {
          const [providerID, ...rest] = event.target.value.split("/")
          const id = rest.join("/")
          const model = models.find((item) => item.providerID === providerID && item.id === id)
          const variant = model?.variants?.[0]?.id
          onChange({ id, providerID, ...(variant ? { variant } : {}) })
        }}
        title="Modelo do OpenCode"
      >
        {models.length === 0 ? <option value="">Sem modelos</option> : null}
        {[...groups.entries()].map(([provider, list]) => (
          <optgroup key={provider} label={provider}>
            {list.map((model) => (
              <option key={keyOf(model)} value={keyOf(model)}>
                {model.name ?? model.id}
                {model.capabilities?.tools === false ? " (sem tools)" : ""}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {variants.length > 1 ? (
        <select
          className="select"
          value={value?.variant ?? variants[0]?.id ?? ""}
          disabled={disabled}
          onChange={(event) => {
            if (!value) return
            onChange({ ...value, variant: event.target.value })
          }}
          title="Variante do modelo"
        >
          {variants.map((variant) => (
            <option key={variant.id} value={variant.id}>
              {variant.id}
            </option>
          ))}
        </select>
      ) : null}
    </>
  )
}
