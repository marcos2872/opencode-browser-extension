import { describe, expect, it } from "vitest"
import { planTools } from "../../../src/background/tools/plan"
import { makeToolContext } from "../../helpers/factories"

describe("background/tools/plan", () => {
  it("exige domains e approach não vazios", async () => {
    const { ctx } = makeToolContext()

    await expect(planTools.update_plan({}, ctx)).rejects.toThrow(
      "update_plan exige `domains` e `approach` como arrays não vazios.",
    )
    await expect(planTools.update_plan({ domains: [], approach: ["passo"] }, ctx)).rejects.toThrow(
      "update_plan exige `domains` e `approach` como arrays não vazios.",
    )
    await expect(planTools.update_plan({ domains: ["x.com"], approach: [] }, ctx)).rejects.toThrow(
      "update_plan exige `domains` e `approach` como arrays não vazios.",
    )
    await expect(planTools.update_plan({ domains: "x.com", approach: "passo" }, ctx)).rejects.toThrow(
      "update_plan exige `domains` e `approach` como arrays não vazios.",
    )
  })

  it("ignora entradas que não são strings úteis", async () => {
    const { ctx, ask } = makeToolContext()

    await expect(
      planTools.update_plan({ domains: [42, "  ", null, "x.com"], approach: [false, "  ", "passo"] }, ctx),
    ).resolves.toMatchObject({ metadata: { approved: true, domains: ["x.com"] } })

    expect(ask).toHaveBeenCalledWith(expect.objectContaining({ plan: { domains: ["x.com"], approach: ["passo"] } }))
  })

  it("pede aprovação do plano com detalhes", async () => {
    const { ctx, ask } = makeToolContext()

    await planTools.update_plan(
      { domains: ["example.com"], approach: ["Abrir a página", "Preencher o formulário"] },
      ctx,
    )

    expect(ask).toHaveBeenCalledWith({
      kind: "plan",
      tool: "update_plan",
      title: "Aprovar plano de navegação",
      detail: "Abrir a página\nPreencher o formulário",
      url: "https://example.com",
      plan: {
        domains: ["example.com"],
        approach: ["Abrir a página", "Preencher o formulário"],
      },
    })
  })

  it("normaliza a URL do pedido quando o domínio já tem esquema", async () => {
    const { ctx, ask } = makeToolContext()

    await planTools.update_plan(
      { domains: ["https://example.com/pagina"], approach: ["Passo único"] },
      ctx,
    )

    expect(ask).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://example.com/pagina" }),
    )
  })

  it("libera os domínios normalizados na sessão", async () => {
    const { ctx, permissions } = makeToolContext()

    const result = await planTools.update_plan(
      {
        domains: ["https://example.com/pagina", "http://sub.outro.com/a/b", "terceiro.com/x?y=1"],
        approach: ["Passo único"],
      },
      ctx,
    )

    expect(permissions.allowForSession.mock.calls).toEqual([
      ["ses_test", "example.com"],
      ["ses_test", "sub.outro.com"],
      ["ses_test", "terceiro.com"],
    ])
    expect(result.metadata).toEqual({
      approved: true,
      domains: ["https://example.com/pagina", "http://sub.outro.com/a/b", "terceiro.com/x?y=1"],
    })
    expect(result.content).toContain(
      "Plano aprovado. Domínios liberados nesta sessão: https://example.com/pagina, http://sub.outro.com/a/b, terceiro.com/x?y=1.",
    )
    expect(result.content).toContain("1. Passo único")
  })

  it("numera os passos do plano aprovado", async () => {
    const { ctx } = makeToolContext()

    const result = await planTools.update_plan(
      { domains: ["a.com"], approach: ["Primeiro", "Segundo", "Terceiro"] },
      ctx,
    )

    expect(result.content).toContain("1. Primeiro\n2. Segundo\n3. Terceiro")
  })

  it("não libera domínios quando o plano é recusado", async () => {
    const { ctx, ask, permissions } = makeToolContext()
    ask.mockResolvedValue(false)

    const result = await planTools.update_plan({ domains: ["x.com"], approach: ["passo"] }, ctx)

    expect(result.content).toBe("Plano recusado pelo usuário. Não navegue para os domínios propostos.")
    expect(result.metadata).toEqual({ approved: false })
    expect(permissions.allowForSession).not.toHaveBeenCalled()
  })
})
