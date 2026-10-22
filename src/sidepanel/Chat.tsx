import type { RefObject } from "react"
import type { ChatMessage, TokenUsage } from "../shared/types"
import { Markdown } from "../components/Markdown"
import { ToolCard } from "./ToolCard"

interface Props {
  messages: ChatMessage[]
  busy: boolean
  onSuggestion: (text: string) => void
  bottomRef?: RefObject<HTMLDivElement | null>
}

const SUGGESTIONS = [
  "Abra o Hacker News e resuma as 5 principais notícias de hoje.",
  "Leia a página atual, encontre o formulário de contato e preencha com dados de teste.",
  "Investigue os erros do console e as requisições de rede desta página.",
  "Pesquise o preço de um produto em três lojas e compare em uma tabela.",
]

function usageLabel(usage: TokenUsage): string {
  const formatter = new Intl.NumberFormat("pt-BR")
  const total = usage.total ?? (usage.input ?? 0) + (usage.output ?? 0)
  const parts = [`${formatter.format(total)} tokens`]
  if (usage.input !== undefined) parts.push(`${formatter.format(usage.input)} entrada`)
  if (usage.output !== undefined) parts.push(`${formatter.format(usage.output)} saída`)
  if (usage.cost !== undefined) {
    parts.push(new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD", maximumFractionDigits: 6 }).format(usage.cost))
  }
  return parts.join(" · ")
}

export function Chat({ messages, busy, onSuggestion, bottomRef }: Props) {
  if (messages.length === 0) {
    return (
      <div className="chat">
        <div className="empty">
          <h2>Seu navegador, com os modelos do OpenCode</h2>
          <p>
            O agente roda na sua máquina e ganha um grupo de abas isolado para navegar, ler e
            interagir. Cada ação sensível pede sua permissão.
          </p>
          <div className="suggestions">
            {SUGGESTIONS.map((suggestion) => (
              <button className="suggestion" key={suggestion} onClick={() => onSuggestion(suggestion)}>
                {suggestion}
              </button>
            ))}
          </div>
          {busy ? (
            <div className="thinking">
              <span />
              <span />
              <span /> pensando
            </div>
          ) : null}
          <div ref={bottomRef} />
        </div>
      </div>
    )
  }

  return (
    <div className="chat">
      {messages.map((message) =>
        message.kind === "user" ? (
          <div className="msg msg-user" key={message.id}>
            {message.text}
          </div>
        ) : (
          <div className="msg msg-assistant" key={message.id}>
            <div className="row">
              <span className="msg-meta">OpenCode</span>
              {message.usage ? <span className="usage-meta">{usageLabel(message.usage)}</span> : null}
              {message.streaming ? (
                <span className="thinking">
                  <span />
                  <span />
                  <span />
                </span>
              ) : null}
            </div>
            {message.reasoning ? (
              <details className="reasoning">
                <summary>Raciocínio</summary>
                <div>{message.reasoning}</div>
              </details>
            ) : null}
            {message.text ? <Markdown text={message.text} /> : null}
            {message.tools.map((tool) => (
              <ToolCard key={tool.id} tool={tool} />
            ))}
            {message.error ? <div className="error-banner">{message.error}</div> : null}
            {!message.text && message.tools.length === 0 && message.streaming ? (
              <div className="thinking">
                <span />
                <span />
                <span /> trabalhando
              </div>
            ) : null}
          </div>
        ),
      )}
      {busy && !messages.some((message) => message.kind === "assistant" && message.streaming) ? (
        <div className="thinking">
          <span />
          <span />
          <span /> aguardando o OpenCode
        </div>
      ) : null}
      <div ref={bottomRef} />
    </div>
  )
}
