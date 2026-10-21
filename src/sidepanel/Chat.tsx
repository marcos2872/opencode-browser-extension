import type { RefObject } from "react"
import type { ChatMessage } from "../shared/types"
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
