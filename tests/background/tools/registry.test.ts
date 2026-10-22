import { describe, expect, it, vi } from "vitest"
import { ToolRegistry } from "../../../src/background/tools/registry"
import type { ToolResult } from "../../../src/background/tools/types"
import { makeToolContext } from "../../helpers/factories"

function makeHandler(content = "ok", metadata?: Record<string, unknown>) {
  return vi.fn(async (): Promise<ToolResult> => ({ content, metadata }))
}

function parse(result: ToolResult) {
  return JSON.parse(result.content) as {
    ok: boolean
    results: Array<{ index: number; name: string; ok: boolean; output?: string; error?: string }>
  }
}

describe("background/tools/registry", () => {
  describe("list", () => {
    it("lista as ferramentas ordenadas e sempre inclui browser_batch", () => {
      const registry = new ToolRegistry([{ zeta: makeHandler(), alpha: makeHandler() }])
      expect(registry.list()).toEqual(["alpha", "browser_batch", "zeta"])
    })

    it("mescla vários módulos", () => {
      const registry = new ToolRegistry([{ a: makeHandler() }, { b: makeHandler() }])
      expect(registry.list()).toEqual(["a", "b", "browser_batch"])
    })
  })

  describe("run", () => {
    it("despacha pelo nome exato passando args e ctx", async () => {
      const alpha = makeHandler("alpha-ok", { n: 1 })
      const registry = new ToolRegistry([{ alpha }])
      const { ctx } = makeToolContext()

      await expect(registry.run("alpha", { a: 1 }, ctx)).resolves.toEqual({
        content: "alpha-ok",
        metadata: { n: 1 },
      })
      expect(alpha).toHaveBeenCalledWith({ a: 1 }, ctx)
    })

    it("normaliza o prefixo browser_", async () => {
      const alpha = makeHandler()
      const registry = new ToolRegistry([{ alpha }])
      const { ctx } = makeToolContext()

      await registry.run("browser_alpha", {}, ctx)
      expect(alpha).toHaveBeenCalledTimes(1)
    })

    it("lança erro para ferramenta desconhecida", async () => {
      const registry = new ToolRegistry([{ alpha: makeHandler() }])
      const { ctx } = makeToolContext()

      await expect(registry.run("nao_existe", {}, ctx)).rejects.toThrow(
        "Ferramenta desconhecida: nao_existe.",
      )
      await expect(registry.run("browser_nao_existe", {}, ctx)).rejects.toThrow(
        "Ferramenta desconhecida: browser_nao_existe.",
      )
    })

    it("aborta quando o sinal já está cancelado", async () => {
      const alpha = makeHandler()
      const registry = new ToolRegistry([{ alpha }])
      const controller = new AbortController()
      controller.abort()
      const { ctx } = makeToolContext({ signal: controller.signal })

      await expect(registry.run("alpha", {}, ctx)).rejects.toThrow("Execução interrompida pelo usuário.")
      expect(alpha).not.toHaveBeenCalled()
    })
  })

  describe("batch", () => {
    it("exige actions não vazio", async () => {
      const registry = new ToolRegistry([{ alpha: makeHandler() }])
      const { ctx } = makeToolContext()

      await expect(registry.run("browser_batch", {}, ctx)).rejects.toThrow("browser_batch exige `actions`.")
      await expect(registry.run("browser_batch", { actions: [] }, ctx)).rejects.toThrow(
        "browser_batch exige `actions`.",
      )
      await expect(registry.run("browser_batch", { actions: "x" }, ctx)).rejects.toThrow(
        "browser_batch exige `actions`.",
      )
    })

    it("rejeita item de lote chamado batch", async () => {
      const registry = new ToolRegistry([{ alpha: makeHandler() }])
      const { ctx } = makeToolContext()

      const result = await registry.run("browser_batch", { actions: [{ name: "batch", input: {} }] }, ctx)
      const parsed = parse(result)

      expect(parsed.results[0]).toMatchObject({ name: "batch", ok: false, error: "Nome de ação inválido." })
    })

    it("rejeita mais de 20 ações", async () => {
      const registry = new ToolRegistry([{ alpha: makeHandler() }])
      const { ctx } = makeToolContext()
      const actions = Array.from({ length: 21 }, () => ({ name: "alpha", input: {} }))

      await expect(registry.run("browser_batch", { actions }, ctx)).rejects.toThrow(
        "browser_batch aceita no máximo 20 ações.",
      )
    })

    it("aceita exatamente 20 ações", async () => {
      const alpha = makeHandler()
      const registry = new ToolRegistry([{ alpha }])
      const { ctx } = makeToolContext()
      const actions = Array.from({ length: 20 }, () => ({ name: "alpha", input: {} }))

      const result = await registry.run("browser_batch", { actions }, ctx)
      expect(parse(result).results).toHaveLength(20)
      expect(alpha).toHaveBeenCalledTimes(20)
    })

    it("também aceita o nome batch", async () => {
      const alpha = makeHandler("ok")
      const registry = new ToolRegistry([{ alpha }])
      const { ctx } = makeToolContext()

      const result = await registry.run("batch", { actions: [{ name: "alpha" }] }, ctx)
      expect(parse(result)).toEqual({ ok: true, results: [{ index: 0, name: "alpha", ok: true, output: "ok" }] })
    })

    it("marca itens que não são objetos como ação inválida", async () => {
      const registry = new ToolRegistry([{ alpha: makeHandler() }])
      const { ctx } = makeToolContext()

      const result = await registry.run("browser_batch", { actions: [null, "texto", 42] }, ctx)
      const parsed = parse(result)
      expect(parsed.ok).toBe(false)
      expect(parsed.results).toEqual([
        { index: 0, name: "?", ok: false, error: "Ação inválida." },
        { index: 1, name: "?", ok: false, error: "Ação inválida." },
        { index: 2, name: "?", ok: false, error: "Ação inválida." },
      ])
    })

    it("rejeita nome ausente e aninhamento de browser_batch", async () => {
      const registry = new ToolRegistry([{ alpha: makeHandler() }])
      const { ctx } = makeToolContext()

      const result = await registry.run(
        "browser_batch",
        { actions: [{}, { name: 123 }, { name: "browser_batch", input: {} }] },
        ctx,
      )
      const parsed = parse(result)
      expect(parsed.ok).toBe(false)
      expect(parsed.results).toEqual([
        { index: 0, name: "", ok: false, error: "Nome de ação inválido." },
        { index: 1, name: "", ok: false, error: "Nome de ação inválido." },
        { index: 2, name: "browser_batch", ok: false, error: "Nome de ação inválido." },
      ])
    })

    it("continua o lote quando um item falha", async () => {
      const boom = vi.fn(async () => {
        throw new Error("explodiu")
      })
      const alpha = makeHandler("ok")
      const registry = new ToolRegistry([{ boom, alpha }])
      const { ctx } = makeToolContext()

      const result = await registry.run(
        "browser_batch",
        { actions: [{ name: "boom" }, { name: "alpha" }] },
        ctx,
      )
      const parsed = parse(result)
      expect(parsed.ok).toBe(false)
      expect(parsed.results).toEqual([
        { index: 0, name: "boom", ok: false, error: "explodiu" },
        { index: 1, name: "alpha", ok: true, output: "ok" },
      ])
      expect(alpha).toHaveBeenCalledTimes(1)
    })

    it("reporta erro de ferramenta desconhecida dentro do lote", async () => {
      const registry = new ToolRegistry([{ alpha: makeHandler() }])
      const { ctx } = makeToolContext()

      const result = await registry.run("browser_batch", { actions: [{ name: "ghost" }] }, ctx)
      expect(parse(result).results[0]).toEqual({
        index: 0,
        name: "ghost",
        ok: false,
        error: "Ferramenta desconhecida: ghost.",
      })
    })

    it("devolve JSON com ok e results em caso de sucesso", async () => {
      const alpha = makeHandler("saida-a")
      const beta = makeHandler("saida-b")
      const registry = new ToolRegistry([{ alpha, beta }])
      const { ctx } = makeToolContext()

      const result = await registry.run(
        "browser_batch",
        { actions: [{ name: "alpha", input: { x: 1 } }, { name: "browser_beta", input: { y: 2 } }] },
        ctx,
      )
      expect(parse(result)).toEqual({
        ok: true,
        results: [
          { index: 0, name: "alpha", ok: true, output: "saida-a" },
          { index: 1, name: "browser_beta", ok: true, output: "saida-b" },
        ],
      })
      expect(result.metadata).toEqual({ ok: true })
      expect(alpha).toHaveBeenCalledWith({ x: 1 }, ctx)
      expect(beta).toHaveBeenCalledWith({ y: 2 }, ctx)
    })

    it("ignora input que não é objeto", async () => {
      const alpha = makeHandler()
      const registry = new ToolRegistry([{ alpha }])
      const { ctx } = makeToolContext()

      await registry.run(
        "browser_batch",
        { actions: [{ name: "alpha", input: ["x"] }, { name: "alpha", input: "y" }] },
        ctx,
      )
      expect(alpha).toHaveBeenNthCalledWith(1, {}, ctx)
      expect(alpha).toHaveBeenNthCalledWith(2, {}, ctx)
    })

    it("interrompe o lote quando o sinal é cancelado no meio", async () => {
      const controller = new AbortController()
      const stop = vi.fn(async () => {
        controller.abort()
        return { content: "primeiro" }
      })
      const alpha = makeHandler()
      const registry = new ToolRegistry([{ stop, alpha }])
      const { ctx } = makeToolContext({ signal: controller.signal })

      const result = await registry.run(
        "browser_batch",
        { actions: [{ name: "stop" }, { name: "alpha" }] },
        ctx,
      )
      const parsed = parse(result)
      expect(parsed.ok).toBe(false)
      expect(parsed.results).toEqual([
        { index: 0, name: "stop", ok: true, output: "primeiro" },
        { index: 1, name: "?", ok: false, error: "Interrompido pelo usuário." },
      ])
      expect(alpha).not.toHaveBeenCalled()
    })
  })
})
