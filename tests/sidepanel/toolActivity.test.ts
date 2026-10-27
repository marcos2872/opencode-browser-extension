import { describe, expect, it } from "vitest"
import {
  activityLabel,
  toolActivity,
} from "../../src/sidepanel/toolActivity"
import type { ChatMessage, ToolCallView } from "../../src/shared/types"
import { makeMessage } from "../helpers/factories"

function tool(partial: Partial<ToolCallView> = {}): ToolCallView {
  return { id: "t1", name: "read_page", status: "running", ...partial }
}

describe("toolActivity", () => {
  it("traduz as tools principais", () => {
    expect(toolActivity(tool({ name: "read_page" }))).toBe("lendo a página")
    expect(toolActivity(tool({ name: "javascript_tool" }))).toBe(
      "executando script",
    )
    expect(toolActivity(tool({ name: "tabs_create" }))).toBe("abrindo uma aba")
    expect(toolActivity(tool({ name: "question" }))).toBe(
      "aguardando sua resposta",
    )
  })

  it("detalha navigate e computer", () => {
    expect(toolActivity(tool({ name: "navigate" }))).toBe("navegando")
    expect(
      toolActivity(tool({ name: "navigate", input: { direction: "back" } })),
    ).toBe("voltando uma página")
    expect(
      toolActivity(tool({ name: "navigate", input: { direction: "forward" } })),
    ).toBe("avançando uma página")
    expect(
      toolActivity(tool({ name: "computer", input: { action: "click" } })),
    ).toBe("clicando")
    expect(
      toolActivity(tool({ name: "computer", input: { action: "type" } })),
    ).toBe("digitando")
    expect(
      toolActivity(tool({ name: "computer", input: { action: "scroll" } })),
    ).toBe("rolando a página")
    expect(
      toolActivity(tool({ name: "computer", input: { action: "screenshot" } })),
    ).toBe("capturando a tela")
  })

  it("cai em 'trabalhando' para tool desconhecida", () => {
    expect(toolActivity(tool({ name: "custom" }))).toBe("trabalhando")
  })
})

describe("activityLabel", () => {
  it("prefere a tool em execução", () => {
    const messages: ChatMessage[] = [
      { kind: "user", id: "u1", text: "faça", time: 1 },
      makeMessage({
        id: "a1",
        tools: [
          tool({ id: "t1", name: "read_page", status: "ok" }),
          tool({
            id: "t2",
            name: "computer",
            status: "running",
            input: { action: "click" },
          }),
        ],
      }),
    ]

    expect(activityLabel(messages)).toBe("clicando")
  })

  it("usa a última tool quando nenhuma está rodando", () => {
    const messages: ChatMessage[] = [
      { kind: "user", id: "u1", text: "faça", time: 1 },
      makeMessage({
        id: "a1",
        text: "",
        tools: [tool({ name: "find", status: "ok" })],
      }),
    ]

    expect(activityLabel(messages)).toBe("procurando na página")
  })

  it("mostra 'escrevendo a resposta' durante o texto final", () => {
    const messages: ChatMessage[] = [
      { kind: "user", id: "u1", text: "faça", time: 1 },
      makeMessage({
        id: "a1",
        text: "parcial",
        streaming: true,
        tools: [tool({ status: "ok" })],
      }),
    ]

    expect(activityLabel(messages)).toBe("escrevendo a resposta")
  })

  it("ignora tools de runs anteriores e usa 'trabalhando' sem tool", () => {
    const messages: ChatMessage[] = [
      { kind: "user", id: "u1", text: "um", time: 1 },
      makeMessage({ id: "a1", tools: [tool({ status: "ok" })] }),
      { kind: "user", id: "u2", text: "dois", time: 2 },
      makeMessage({ id: "a2", text: "", tools: [] }),
    ]

    expect(activityLabel(messages)).toBe("trabalhando")
  })
})
