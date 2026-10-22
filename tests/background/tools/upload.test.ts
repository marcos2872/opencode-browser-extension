import { beforeEach, describe, expect, it, vi } from "vitest"
import { a11yMock, resetA11yMock } from "./helpers/a11y-mock"
import { uploadTools } from "../../../src/background/tools/upload"
import { makeToolContext } from "../../helpers/factories"

vi.mock("../../../src/background/tools/a11y", () => a11yMock)

const BASE64 = "iVBORw0KGgoAAAANSUhEUg=="

beforeEach(() => {
  resetA11yMock()
  chrome.__state.addTab({ id: 1, url: "https://example.com/", title: "Exemplo", status: "complete" })
})

describe("background/tools/upload", () => {
  it("exige files", async () => {
    const { ctx } = makeToolContext()

    await expect(uploadTools.upload_image({ ref: "ref_1" }, ctx)).rejects.toThrow(
      "Informe `files` com [{ data: <base64>, name, mimeType }].",
    )
    await expect(uploadTools.upload_image({ ref: "ref_1", files: [] }, ctx)).rejects.toThrow(
      "Informe `files` com [{ data: <base64>, name, mimeType }].",
    )
    await expect(uploadTools.upload_image({ ref: "ref_1", files: "nada" }, ctx)).rejects.toThrow(
      "Informe `files` com [{ data: <base64>, name, mimeType }].",
    )
    expect(a11yMock.uploadFiles).not.toHaveBeenCalled()
  })

  it("ignora itens sem data", async () => {
    const { ctx } = makeToolContext()

    await expect(
      uploadTools.upload_image({ ref: "ref_1", files: [null, "x", { data: "" }, { data: 42 }] }, ctx),
    ).rejects.toThrow("Informe `files` com [{ data: <base64>, name, mimeType }].")
  })

  it("exige ref", async () => {
    const { ctx } = makeToolContext()
    await expect(uploadTools.upload_image({ files: [{ data: BASE64 }] }, ctx)).rejects.toThrow(
      "Parâmetro obrigatório ausente: ref.",
    )
  })

  it("envia no máximo 3 arquivos", async () => {
    const { ctx } = makeToolContext()

    await uploadTools.upload_image(
      {
        ref: "ref_1",
        files: [
          { data: "YQ==", name: "a.png" },
          { data: "Yg==", name: "b.png" },
          { data: "Yw==", name: "c.png" },
          { data: "ZA==", name: "d.png" },
        ],
      },
      ctx,
    )

    const sent = a11yMock.uploadFiles.mock.calls[0][2]
    expect(sent).toHaveLength(3)
    expect(sent.map((file: { name: string }) => file.name)).toEqual(["a.png", "b.png", "c.png"])
  })

  it("recusa arquivo acima do limite de base64", async () => {
    const { ctx } = makeToolContext()
    const huge = "a".repeat(7 * 1024 * 1024 + 1)

    await expect(
      uploadTools.upload_image({ ref: "ref_1", files: [{ data: huge, name: "grande.bin" }] }, ctx),
    ).rejects.toThrow("O arquivo grande.bin excede o limite de ~5 MB.")
    expect(a11yMock.uploadFiles).not.toHaveBeenCalled()
  })

  it("usa nome padrão quando o nome está ausente ou em branco", async () => {
    const { ctx } = makeToolContext()

    await uploadTools.upload_image({ ref: "ref_1", files: [{ data: "YQ==" }, { data: "Yg==", name: "   " }] }, ctx)

    expect(a11yMock.uploadFiles).toHaveBeenCalledWith(1, "ref_1", [
      { data: "YQ==", name: "arquivo-1.bin", mimeType: undefined },
      { data: "Yg==", name: "arquivo-2.bin", mimeType: undefined },
    ])
  })

  it("aceita mime_type e dá prioridade a mimeType", async () => {
    const { ctx } = makeToolContext()

    await uploadTools.upload_image(
      {
        ref: "ref_1",
        files: [
          { data: "YQ==", name: "a.png", mime_type: "image/png" },
          { data: "Yg==", name: "b.png", mimeType: "image/jpeg", mime_type: "image/png" },
        ],
      },
      ctx,
    )

    expect(a11yMock.uploadFiles).toHaveBeenCalledWith(1, "ref_1", [
      { data: "YQ==", name: "a.png", mimeType: "image/png" },
      { data: "Yg==", name: "b.png", mimeType: "image/jpeg" },
    ])
  })

  it("respeita a negação do usuário", async () => {
    const { ctx, ask } = makeToolContext()
    ask.mockResolvedValue(false)

    const result = await uploadTools.upload_image(
      { ref: "ref_1", files: [{ data: BASE64, name: "a.png" }] },
      ctx,
    )

    expect(result.content).toBe("Upload negado pelo usuário.")
    expect(a11yMock.uploadFiles).not.toHaveBeenCalled()
    expect(ask).toHaveBeenCalledWith({
      kind: "action",
      tool: "upload_image",
      title: "Enviar arquivo para a página",
      detail: "a.png",
      url: "https://example.com/",
    })
  })

  it("envia para input de arquivo", async () => {
    const { ctx, indicator, hideIndicator } = makeToolContext()
    a11yMock.uploadFiles.mockResolvedValue({ ok: true, target: "input" })

    const result = await uploadTools.upload_image(
      { ref: "ref_1", files: [{ data: BASE64, name: "foto.png" }] },
      ctx,
    )

    expect(a11yMock.uploadFiles).toHaveBeenCalledWith(1, "ref_1", [
      { data: BASE64, name: "foto.png", mimeType: undefined },
    ])
    expect(result.content).toBe("Arquivo(s) enviados (foto.png) via input de arquivo.")
    expect(result.metadata).toEqual({ ref: "ref_1", count: 1 })
    expect(indicator).toHaveBeenCalledWith(1, "Enviando arquivo", true)
    expect(hideIndicator).toHaveBeenCalledWith(1)
  })

  it("envia via drag & drop quando o alvo não é input", async () => {
    const { ctx } = makeToolContext()
    a11yMock.uploadFiles.mockResolvedValue({ ok: true, target: "drop" })

    const result = await uploadTools.upload_image({ ref: "ref_1", files: [{ data: BASE64, name: "a.png" }] }, ctx)

    expect(result.content).toBe("Arquivo(s) enviados (a.png) via drag & drop.")
  })

  it("propaga erro do content script", async () => {
    const { ctx } = makeToolContext()
    a11yMock.uploadFiles.mockResolvedValue({ ok: false, error: "elemento não aceita arquivos" })

    await expect(
      uploadTools.upload_image({ ref: "ref_1", files: [{ data: BASE64, name: "a.png" }] }, ctx),
    ).rejects.toThrow("elemento não aceita arquivos")
  })

  it("usa mensagem padrão quando o erro não é descrito", async () => {
    const { ctx } = makeToolContext()
    a11yMock.uploadFiles.mockResolvedValue({ ok: false })

    await expect(
      uploadTools.upload_image({ ref: "ref_1", files: [{ data: BASE64, name: "a.png" }] }, ctx),
    ).rejects.toThrow("Falha ao enviar o arquivo.")
  })

  it("encaminha a ref de iframe sem alterar", async () => {
    const { ctx } = makeToolContext()

    await uploadTools.upload_image({ ref: "f3_ref_2", files: [{ data: BASE64, name: "a.png" }] }, ctx)

    expect(a11yMock.uploadFiles).toHaveBeenCalledWith(1, "f3_ref_2", [
      { data: BASE64, name: "a.png", mimeType: undefined },
    ])
  })

  it("respeita o tabId informado", async () => {
    const { ctx } = makeToolContext()

    await uploadTools.upload_image({ ref: "ref_1", tabId: 9, files: [{ data: BASE64, name: "a.png" }] }, ctx)

    expect(ctx.tabs.resolveTab).toHaveBeenCalledWith("ses_test", 9)
  })
})
