import { beforeEach, describe, expect, it, vi } from "vitest"
import { a11yMock, resetA11yMock } from "./helpers/a11y-mock"
import { pageTools } from "../../../src/background/tools/page"
import type { A11yElement } from "../../../src/background/tools/a11y"
import { makeToolContext } from "../../helpers/factories"

vi.mock("../../../src/background/tools/a11y", () => a11yMock)

function element(partial: Partial<A11yElement> & { ref: string }): A11yElement {
  return {
    role: "button",
    name: "",
    tag: "button",
    rect: { x: 0, y: 0, width: 10, height: 10 },
    ...partial,
  }
}

const TREE = {
  pageContent: "[ref_1] Botão",
  viewport: { width: 1280, height: 720 },
  count: 1,
  url: "https://example.com/",
}

const PAGE = { text: "conteúdo da página", title: "Título", url: "https://example.com/", source: "dom" }

beforeEach(() => {
  resetA11yMock()
  chrome.__state.addTab({ id: 1, url: "https://example.com/", title: "Exemplo", status: "complete" })
})

describe("background/tools/page", () => {
  describe("read_page", () => {
    it("lê o frame principal e mostra o viewport", async () => {
      a11yMock.generateTree.mockResolvedValue(TREE)
      const { ctx, indicator, hideIndicator } = makeToolContext()

      const result = await pageTools.read_page({}, ctx)

      expect(a11yMock.generateTree).toHaveBeenCalledWith(1, 0, {
        filter: "all",
        depth: undefined,
        refId: undefined,
        maxChars: undefined,
        includeHidden: undefined,
      })
      expect(result.content).toContain("[ref_1] Botão")
      expect(result.content).toContain("Viewport: 1280x720")
      expect(result.metadata).toEqual({ count: 1, frames: 1 })
      expect(indicator).toHaveBeenCalledWith(1, "Lendo a página", true)
      expect(hideIndicator).toHaveBeenCalledWith(1)
    })

    it("repassa as opções de árvore", async () => {
      a11yMock.generateTree.mockResolvedValue(TREE)
      const { ctx } = makeToolContext()

      await pageTools.read_page(
        { filter: "interactive", depth: 3, ref_id: "ref_2", max_chars: 900, include_hidden: true, tabId: 4 },
        ctx,
      )

      expect(ctx.tabs.resolveTab).toHaveBeenCalledWith("ses_test", 4)
      expect(a11yMock.generateTree).toHaveBeenCalledWith(1, 0, {
        filter: "interactive",
        depth: 3,
        refId: "ref_2",
        maxChars: 900,
        includeHidden: true,
      })
    })

    it("lê todos os frames quando frames=all", async () => {
      a11yMock.generateTreeFrames.mockResolvedValue({
        frames: [
          { frameId: 0, ...TREE },
          { frameId: 2, ...TREE, pageContent: "[f2_ref_1] Link" },
        ],
        combined: "[ref_1] Botão\n\n[frame 2: https://iframe.example/]\n[f2_ref_1] Link",
        count: 2,
      })
      const { ctx } = makeToolContext()

      const result = await pageTools.read_page({ frames: "all" }, ctx)

      expect(a11yMock.generateTreeFrames).toHaveBeenCalledWith(1, expect.objectContaining({ filter: "all" }))
      expect(a11yMock.generateTree).not.toHaveBeenCalled()
      expect(result.content).toContain("Frames lidos: 2")
      expect(result.content).toContain("prefixo f<frameId>_ref_N")
      expect(result.content).toContain("[frame 2: https://iframe.example/]")
      expect(result.metadata).toEqual({ count: 2, frames: 2 })
    })

    it("aceita os aliases all_frames e allFrames", async () => {
      a11yMock.generateTreeFrames.mockResolvedValue({ frames: [], combined: "", count: 0 })
      const { ctx } = makeToolContext()

      await pageTools.read_page({ all_frames: true }, ctx)
      await pageTools.read_page({ allFrames: true }, ctx)

      expect(a11yMock.generateTreeFrames).toHaveBeenCalledTimes(2)
    })

    it("trunca a árvore muito longa", async () => {
      a11yMock.generateTree.mockResolvedValue({ ...TREE, pageContent: "a".repeat(60_000) })
      const { ctx } = makeToolContext()

      const result = await pageTools.read_page({}, ctx)

      expect(result.content).toContain("[saída truncada em 50000 caracteres]")
      expect(result.content.length).toBeLessThan(60_000)
    })

    it("corta a árvore na última quebra de linha antes do limite", async () => {
      a11yMock.generateTree.mockResolvedValue({ ...TREE, pageContent: `${"a".repeat(100)}\n${"b".repeat(60_000)}` })
      const { ctx } = makeToolContext()

      const result = await pageTools.read_page({}, ctx)

      expect(result.content.startsWith("a".repeat(100))).toBe(true)
      expect(result.content).not.toContain("b".repeat(10))
      expect(result.content).toContain("[saída truncada em 50000 caracteres]")
    })
  })

  describe("find", () => {
    const elements = [
      element({ ref: "ref_1", role: "button", name: "Enviar formulário", tag: "button" }),
      element({ ref: "ref_2", role: "link", name: "Ajuda", tag: "a" }),
      element({ ref: "ref_3", role: "textbox", name: "Email", tag: "input", type: "email", value: "a@b.com" }),
    ]

    it("encontra por tokens e ordena por pontuação", async () => {
      a11yMock.listElements.mockResolvedValue(elements)
      const { ctx } = makeToolContext()

      const result = await pageTools.find({ query: "enviar" }, ctx)

      expect(a11yMock.listElements).toHaveBeenCalledWith(1, 0)
      expect(result.content).toContain('- ref_1: button "Enviar formulário"')
      expect(result.content).toContain('Encontrados 1 elemento(s) para "enviar"')
      expect(result.metadata).toEqual({ count: 1, rankedByModel: false })
    })

    it("casa também por role, tag, type e value", async () => {
      a11yMock.listElements.mockResolvedValue(elements)
      const { ctx } = makeToolContext()

      await expect(pageTools.find({ query: "textbox" }, ctx)).resolves.toMatchObject({
        metadata: { count: 1 },
      })
      await expect(pageTools.find({ query: "email" }, ctx)).resolves.toMatchObject({
        metadata: { count: 1 },
      })
      await expect(pageTools.find({ query: "a@b.com" }, ctx)).resolves.toMatchObject({
        metadata: { count: 1 },
      })
    })

    it("respeita max_results", async () => {
      a11yMock.listElements.mockResolvedValue([
        element({ ref: "ref_1", name: "Botão 1" }),
        element({ ref: "ref_2", name: "Botão 2" }),
        element({ ref: "ref_3", name: "Botão 3" }),
      ])
      const { ctx } = makeToolContext()

      const result = await pageTools.find({ query: "botão", max_results: 2 }, ctx)

      expect(result.metadata).toEqual({ count: 2, rankedByModel: false })
      expect(result.content).toContain("ref_1")
      expect(result.content).toContain("ref_2")
      expect(result.content).not.toContain("ref_3")
    })

    it("limita max_results entre 1 e 50", async () => {
      a11yMock.listElements.mockResolvedValue(
        Array.from({ length: 60 }, (_, index) => element({ ref: `ref_${index + 1}`, name: "Alvo" })),
      )
      const { ctx } = makeToolContext()

      const min = await pageTools.find({ query: "alvo", max_results: 0 }, ctx)
      expect(min.metadata).toEqual({ count: 1, rankedByModel: false })

      const max = await pageTools.find({ query: "alvo", max_results: 999 }, ctx)
      expect(max.metadata).toEqual({ count: 50, rankedByModel: false })
    })

    it("usa o ranking do modelo quando disponível", async () => {
      a11yMock.listElements.mockResolvedValue(elements)
      const { ctx, rank } = makeToolContext()
      rank.mockResolvedValue(["ref_3", "ref_1", "ref_inexistente"])

      const result = await pageTools.find({ query: "ajuda" }, ctx)

      expect(rank).toHaveBeenCalledWith("ajuda", [
        { ref: "ref_1", role: "button", name: "Enviar formulário", type: undefined },
        { ref: "ref_2", role: "link", name: "Ajuda", type: undefined },
        { ref: "ref_3", role: "textbox", name: "Email", type: "email" },
      ])
      expect(result.metadata).toEqual({ count: 2, rankedByModel: true })
      expect(result.content).toContain("(ranking por modelo)")
      expect(result.content.indexOf("ref_3")).toBeLessThan(result.content.indexOf("ref_1"))
    })

    it("cai na heurística quando o ranking devolve null", async () => {
      a11yMock.listElements.mockResolvedValue(elements)
      const { ctx, rank } = makeToolContext()
      rank.mockResolvedValue(null)

      const result = await pageTools.find({ query: "ajuda" }, ctx)

      expect(result.metadata).toEqual({ count: 1, rankedByModel: false })
      expect(result.content).toContain("ref_2")
    })

    it("cai na heurística quando o ranking só devolve refs desconhecidas", async () => {
      a11yMock.listElements.mockResolvedValue(elements)
      const { ctx, rank } = makeToolContext()
      rank.mockResolvedValue(["ref_zzz"])

      const result = await pageTools.find({ query: "ajuda" }, ctx)

      expect(result.metadata).toEqual({ count: 1, rankedByModel: false })
      expect(result.content).toContain("ref_2")
    })

    it("informa quando nada foi encontrado", async () => {
      a11yMock.listElements.mockResolvedValue(elements)
      const { ctx } = makeToolContext()

      const result = await pageTools.find({ query: "inexistente-xyz" }, ctx)

      expect(result.content).toBe(
        'Nenhum elemento encontrado para "inexistente-xyz".\nTente termos mais simples ou use read_page com filter "interactive".',
      )
      expect(result.metadata).toBeUndefined()
    })

    it("busca em todos os frames quando frames=all", async () => {
      a11yMock.listElementsFrames.mockResolvedValue([element({ ref: "f2_ref_1", role: "link", name: "Ajuda" })])
      const { ctx } = makeToolContext()

      const result = await pageTools.find({ query: "ajuda", frames: "all" }, ctx)

      expect(a11yMock.listElementsFrames).toHaveBeenCalledWith(1)
      expect(a11yMock.listElements).not.toHaveBeenCalled()
      expect(result.content).toContain(" em todos os frames")
      expect(result.content).toContain("f2_ref_1")
    })

    it("exige query", async () => {
      const { ctx } = makeToolContext()
      await expect(pageTools.find({}, ctx)).rejects.toThrow("Parâmetro obrigatório ausente: query.")
    })
  })

  describe("get_page_text", () => {
    it("extrai o texto do frame principal", async () => {
      a11yMock.pageText.mockResolvedValue(PAGE)
      const { ctx } = makeToolContext()

      const result = await pageTools.get_page_text({}, ctx)

      expect(a11yMock.pageText).toHaveBeenCalledWith(1, 0, 50_000)
      expect(result.content).toBe("Title: Título\nURL: https://example.com/\nSource: <dom>\n---\nconteúdo da página")
      expect(result.metadata).toEqual({ source: "dom", frames: "main" })
    })

    it("concatena todos os frames quando frames=all", async () => {
      a11yMock.pageTextFrames.mockResolvedValue({ ...PAGE, text: "principal\n\n---\n\nextra" })
      const { ctx } = makeToolContext()

      const result = await pageTools.get_page_text({ frames: "all" }, ctx)

      expect(a11yMock.pageTextFrames).toHaveBeenCalledWith(1, 50_000)
      expect(a11yMock.pageText).not.toHaveBeenCalled()
      expect(result.metadata).toEqual({ source: "dom", frames: "all" })
      expect(result.content).toContain("extra")
    })

    it("limita max_chars entre 1000 e 200000", async () => {
      a11yMock.pageText.mockResolvedValue(PAGE)
      const { ctx } = makeToolContext()

      await pageTools.get_page_text({ max_chars: 10 }, ctx)
      expect(a11yMock.pageText).toHaveBeenLastCalledWith(1, 0, 1000)

      await pageTools.get_page_text({ max_chars: 999_999 }, ctx)
      expect(a11yMock.pageText).toHaveBeenLastCalledWith(1, 0, 200_000)
    })

    it("lança erro quando não há texto", async () => {
      a11yMock.pageText.mockResolvedValue({ ...PAGE, text: "   \n  " })
      const { ctx } = makeToolContext()

      await expect(pageTools.get_page_text({}, ctx)).rejects.toThrow("A página não tem texto legível.")
    })
  })

  describe("form_input", () => {
    it("preenche o campo após aprovação", async () => {
      const { ctx, ask, indicator, hideIndicator } = makeToolContext()

      const result = await pageTools.form_input({ ref: "ref_1", value: "texto" }, ctx)

      expect(ask).toHaveBeenCalledWith({
        kind: "action",
        tool: "form_input",
        title: "Preencher campo ref_1",
        detail: "Exemplo",
        url: "https://example.com/",
        text: "texto",
      })
      expect(a11yMock.setValue).toHaveBeenCalledWith(1, "ref_1", "texto")
      expect(result.content).toContain("Campo ref_1 preenchido.")
      expect(result.metadata).toEqual({ ref: "ref_1" })
      expect(indicator).toHaveBeenCalledWith(1, "Preenchendo ref_1", true)
      expect(hideIndicator).toHaveBeenCalledWith(1)
    })

    it("respeita a negação do usuário", async () => {
      const { ctx, ask } = makeToolContext()
      ask.mockResolvedValue(false)

      const result = await pageTools.form_input({ ref: "ref_1", value: "x" }, ctx)

      expect(result.content).toBe("Preenchimento negado pelo usuário.")
      expect(a11yMock.setValue).not.toHaveBeenCalled()
    })

    it("propaga o erro devolvido pelo content script", async () => {
      a11yMock.setValue.mockResolvedValue({ ok: false, error: "campo somente leitura" })
      const { ctx } = makeToolContext()

      await expect(pageTools.form_input({ ref: "ref_1", value: "x" }, ctx)).rejects.toThrow(
        "campo somente leitura",
      )
    })

    it("usa mensagem padrão quando o erro não é descrito", async () => {
      a11yMock.setValue.mockResolvedValue({ ok: false })
      const { ctx } = makeToolContext()

      await expect(pageTools.form_input({ ref: "ref_1", value: "x" }, ctx)).rejects.toThrow(
        "Falha ao preencher o campo.",
      )
    })

    it("converte valores numéricos e booleanos", async () => {
      const { ctx } = makeToolContext()

      await pageTools.form_input({ ref: "ref_1", value: 42 }, ctx)
      expect(a11yMock.setValue).toHaveBeenLastCalledWith(1, "ref_1", "42")

      await pageTools.form_input({ ref: "ref_1", value: false }, ctx)
      expect(a11yMock.setValue).toHaveBeenLastCalledWith(1, "ref_1", "false")

      await pageTools.form_input({ ref: "ref_1" }, ctx)
      expect(a11yMock.setValue).toHaveBeenLastCalledWith(1, "ref_1", "")
    })

    it("exige ref", async () => {
      const { ctx } = makeToolContext()
      await expect(pageTools.form_input({ value: "x" }, ctx)).rejects.toThrow(
        "Parâmetro obrigatório ausente: ref.",
      )
    })
  })
})
