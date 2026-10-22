import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

interface ElementInfo {
  ref: string
  role: string
  name: string
  tag: string
  type?: string
  value?: string
  checked?: boolean
  disabled?: boolean
  rect: { x: number; y: number; width: number; height: number }
}

interface TreeOptions {
  filter?: "interactive" | "all"
  depth?: number
  refId?: string
  maxChars?: number
  includeHidden?: boolean
}

interface TreeResult {
  pageContent: string
  viewport: { width: number; height: number }
  count: number
  url: string
}

interface UploadFile {
  data: string
  name: string
  mimeType?: string
}

interface A11yApi {
  generate: (options?: TreeOptions) => TreeResult
  elements: () => ElementInfo[]
  resolve: (ref: string) => (ElementInfo & { x: number; y: number }) | null
  setValue: (ref: string, value: string) => { ok: boolean; error?: string }
  pageText: (maxChars?: number) => { text: string; title: string; url: string; source: string }
  clickRef: (ref: string) => { ok: boolean; error?: string }
  hoverRef: (ref: string) => { ok: boolean; error?: string }
  scrollRef: (ref: string) => { ok: boolean; error?: string }
  focusRef: (ref: string) => { ok: boolean; error?: string }
  uploadFiles: (ref: string, files: UploadFile[]) => { ok: boolean; target?: string; error?: string }
}

const SCROLL_OPTIONS = { block: "center", inline: "center", behavior: "instant" }
const MOUSE_TYPES = ["mouseover", "mousemove", "mousedown", "mouseup", "click"] as const

/**
 * jsdom não implementa `DataTransfer`; o mock abaixo cobre apenas o que
 * `uploadFiles` usa (`items.add` e `files`).
 */
class FakeDataTransfer {
  readonly files: File[] = []
  readonly items = {
    add: (file: File): void => {
      this.files.push(file)
    },
  }
}

/** jsdom também não implementa `DragEvent`. */
class FakeDragEvent extends Event {
  readonly dataTransfer: unknown

  constructor(type: string, init: DragEventInit = {}) {
    super(type, init)
    this.dataTransfer = init.dataTransfer
  }
}

const NativeMouseEvent = MouseEvent

/**
 * No ambiente jsdom do vitest o global `window` é um objeto comum (não passa no
 * brand check de `MouseEventInit.view`), então `view` é removido quando não é
 * uma Window real. Em navegador isso não é necessário.
 */
class TestMouseEvent extends NativeMouseEvent {
  constructor(type: string, init: MouseEventInit = {}) {
    const { view, ...rest } = init
    super(type, view instanceof Window ? init : rest)
  }
}

let api: A11yApi
let scrollIntoView: ReturnType<typeof vi.fn>

function fakeRect(x = 0, y = 0, width = 100, height = 20): DOMRect {
  return {
    x,
    y,
    width,
    height,
    top: y,
    left: x,
    right: x + width,
    bottom: y + height,
    toJSON: () => ({}),
  } as DOMRect
}

/**
 * O nome acessível do body é o texto de toda a página, então ele é ignorado
 * na busca por ref para evitar casar com um contêiner.
 */
function refFor(name: string, tag?: string): string {
  const info = api.elements().find(
    (item) => item.name === name && item.tag !== "body" && (!tag || item.tag === tag),
  )
  if (!info) throw new Error(`Ref para "${name}" não encontrada`)
  return info.ref
}

/** jsdom exige que `files` seja um FileList real; o teste usa uma propriedade própria. */
function prepareFileInput(input: HTMLInputElement): void {
  Object.defineProperty(input, "files", { configurable: true, writable: true, value: null })
}

beforeEach(async () => {
  document.body.innerHTML = ""
  document.title = "Página de teste"
  delete (window as { __opencodeA11y?: unknown }).__opencodeA11y

  scrollIntoView = vi.fn()
  ;(Element.prototype as unknown as { scrollIntoView: unknown }).scrollIntoView = scrollIntoView
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(fakeRect())

  // jsdom não implementa `innerText` (usado por pageText) nem `isContentEditable`.
  Object.defineProperty(HTMLElement.prototype, "innerText", {
    configurable: true,
    get(this: HTMLElement) {
      return this.textContent ?? ""
    },
  })
  Object.defineProperty(HTMLElement.prototype, "isContentEditable", {
    configurable: true,
    get(this: HTMLElement) {
      const value = this.getAttribute("contenteditable")
      return value !== null && value !== "false"
    },
  })

  vi.stubGlobal("DataTransfer", FakeDataTransfer)
  vi.stubGlobal("DragEvent", FakeDragEvent)
  vi.stubGlobal("MouseEvent", TestMouseEvent)

  vi.resetModules()
  await import("../../src/content/a11y")
  api = (window as unknown as { __opencodeA11y: A11yApi }).__opencodeA11y
})

afterEach(() => {
  delete (Element.prototype as unknown as { scrollIntoView?: unknown }).scrollIntoView
  delete (HTMLElement.prototype as unknown as { innerText?: unknown }).innerText
  delete (HTMLElement.prototype as unknown as { isContentEditable?: unknown }).isContentEditable
})

describe("content/a11y — instalação", () => {
  it("instala a API em window.__opencodeA11y", () => {
    expect(api).toBeTruthy()
    for (const key of [
      "generate",
      "elements",
      "resolve",
      "setValue",
      "pageText",
      "clickRef",
      "hoverRef",
      "scrollRef",
      "focusRef",
      "uploadFiles",
    ]) {
      expect(typeof (api as unknown as Record<string, unknown>)[key]).toBe("function")
    }
  })

  it("não reinstala quando já existe uma instância", async () => {
    const first = (window as unknown as { __opencodeA11y: A11yApi }).__opencodeA11y
    vi.resetModules()
    await import("../../src/content/a11y")
    expect((window as unknown as { __opencodeA11y: A11yApi }).__opencodeA11y).toBe(first)
  })
})

describe("content/a11y — generate", () => {
  it("usa o filtro 'all' por padrão e devolve url, viewport, count e linhas da árvore", () => {
    document.body.innerHTML = `
      <main>
        <h1>Título</h1>
        <button>Enviar</button>
        <a href="/x">Link</a>
        <input type="text" placeholder="Nome" value="Ana">
        <div style="display:none">Oculto</div>
      </main>`

    const result = api.generate()

    expect(result.url).toBe(location.href)
    expect(result.viewport).toEqual({ width: window.innerWidth, height: window.innerHeight })
    expect(result.count).toBe(7)
    expect(result.pageContent).toMatch(/\[ref_\d+\] heading "Título"/)
    expect(result.pageContent).toMatch(/\[ref_\d+\] button "Enviar"/)
    expect(result.pageContent).toMatch(/\[ref_\d+\] link "Link"/)
    expect(result.pageContent).toMatch(/\[ref_\d+\] textbox "Nome" = "Ana"/)
    expect(result.pageContent).toContain("Oculto")
  })

  it("no filtro interativo ignora texto, elementos não interativos e ocultos", () => {
    document.body.innerHTML = `
      <h1>Título</h1>
      <p aria-label="Parágrafo">Parágrafo</p>
      <button aria-label="Visível">Visível</button>
      <button aria-label="Escondido" style="display:none">Escondido</button>
      <div role="tab" aria-label="Aba">Aba</div>
      <input type="range" aria-label="Faixa">
      <div tabindex="0" aria-label="Focável">Focável</div>
      <div onclick="void 0" aria-label="Clicável">Clicável</div>
      <div tabindex="-1" aria-label="Sem foco">Sem foco</div>`

    const result = api.generate({ filter: "interactive" })

    expect(result.pageContent).toContain("Visível")
    expect(result.pageContent).toContain("Aba")
    expect(result.pageContent).toContain("Faixa")
    expect(result.pageContent).toContain("Focável")
    expect(result.pageContent).toContain("Clicável")
    expect(result.pageContent).not.toContain("heading")
    expect(result.pageContent).not.toContain("Parágrafo")
    expect(result.pageContent).not.toContain("Escondido")
    expect(result.pageContent).not.toContain("Sem foco")
  })

  it("inclui ocultos no filtro interativo apenas com includeHidden", () => {
    document.body.innerHTML = `<button aria-label="Escondido" style="display:none">Escondido</button>`

    expect(api.generate({ filter: "interactive" }).count).toBe(0)
    expect(api.generate({ filter: "interactive", includeHidden: true }).count).toBe(1)
  })

  it("respeita depth, com mínimo de 1 nível", () => {
    document.body.innerHTML = `<div id="lvl1"><div id="lvl2"><button>Profundo</button></div></div>`

    const shallow = api.generate({ depth: 2 })
    expect(shallow.count).toBe(3)
    expect(shallow.pageContent).not.toMatch(/button "Profundo"/)

    expect(api.generate({ depth: 0 }).count).toBe(2)
    expect(api.generate({ depth: 99 }).count).toBe(4)
  })

  it("limita o recuo da árvore a 12 níveis", () => {
    let html = ""
    for (let index = 0; index < 16; index += 1) html += "<div>"
    html += `<button aria-label="Fundo">Fundo</button>`
    for (let index = 0; index < 16; index += 1) html += "</div>"
    document.body.innerHTML = html

    const deepest = api.generate({ depth: 20 }).pageContent.split("\n").at(-1) ?? ""

    expect(deepest.startsWith(" ".repeat(24))).toBe(true)
    expect(deepest.startsWith(" ".repeat(26))).toBe(false)
    expect(deepest).toContain('button "Fundo"')
  })

  it("usa refId como raiz da árvore", () => {
    document.body.innerHTML = `<div><button aria-label="Alvo">Alvo</button></div>`
    const ref = refFor("Alvo", "button")

    const result = api.generate({ refId: ref })

    expect(result.count).toBe(1)
    expect(result.pageContent).toBe(`[${ref}] button "Alvo"`)
  })

  it("devolve mensagem quando a refId não existe", () => {
    document.body.innerHTML = `<button>X</button>`

    const result = api.generate({ refId: "ref_404" })

    expect(result).toMatchObject({ pageContent: "Ref ref_404 não encontrada.", count: 0 })
    expect(result.url).toBe(location.href)
    expect(result.viewport).toEqual({ width: window.innerWidth, height: window.innerHeight })
  })

  it("trunca o conteúdo em maxChars (mínimo de 1000) na última quebra de linha", () => {
    document.body.innerHTML = Array.from(
      { length: 120 },
      (_, index) => `<button aria-label="Botão ${index}">Botão ${index}</button>`,
    ).join("")

    const full = api.generate()
    expect(full.pageContent.length).toBeGreaterThan(2000)

    const truncated = api.generate({ maxChars: 1000 })
    expect(truncated.count).toBe(full.count)
    expect(truncated.pageContent).toContain(`[truncado em 1000 de ${full.pageContent.length} caracteres]`)
    const content = truncated.pageContent.split("\n\n[truncado")[0] ?? ""
    expect(content.length).toBeLessThanOrEqual(1000)
    expect(content.split("\n").length).toBeGreaterThan(5)

    expect(api.generate({ maxChars: 10 }).pageContent).toContain("truncado em 1000 de")
  })

  it("ignora tags script/style/noscript/template", () => {
    document.body.innerHTML = `
      <script>window.__scriptExecutou = true</script>
      <style>.x { color: red }</style>
      <noscript>Sem JS</noscript>
      <template><button>Do template</button></template>
      <button aria-label="Ok">Ok</button>`

    const result = api.generate()

    // body + botão: script/style/noscript/template não entram na árvore
    expect(result.count).toBe(2)
    expect(result.pageContent.split("\n")).toHaveLength(2)
    expect(result.pageContent).toContain('button "Ok"')
    expect(api.elements().map((info) => info.tag)).toEqual(["body", "button"])
    expect((window as unknown as { __scriptExecutou?: boolean }).__scriptExecutou).toBeUndefined()
  })

  it("mantém a ref estável para o mesmo elemento e incrementa para novos", () => {
    document.body.innerHTML = `<button aria-label="Enviar">Enviar</button><span aria-label="Extra">Extra</span>`

    const first = api.elements()
    const buttonRef = first.find((info) => info.name === "Enviar")?.ref
    const maxRef = Math.max(...first.map((info) => Number(info.ref.replace("ref_", ""))))

    const second = api.elements()
    expect(second.find((info) => info.name === "Enviar")?.ref).toBe(buttonRef)

    const novo = document.createElement("button")
    novo.setAttribute("aria-label", "Novo")
    document.body.appendChild(novo)

    const third = api.elements()
    const novoRef = third.find((info) => info.name === "Novo")?.ref ?? ""
    expect(Number(novoRef.replace("ref_", ""))).toBeGreaterThan(maxRef)
    expect(third.find((info) => info.name === "Enviar")?.ref).toBe(buttonRef)
  })

  it("marca (disabled) em input, textarea e select desabilitados", () => {
    document.body.innerHTML = `
      <input aria-label="Parado" disabled>
      <textarea aria-label="Notas" disabled></textarea>
      <select aria-label="UF" disabled><option>SP</option></select>
      <input aria-label="Ativo">`

    const result = api.generate()

    expect(result.pageContent).toMatch(/\[ref_\d+\] textbox "Parado" \(disabled\)/)
    expect(result.pageContent).toMatch(/\[ref_\d+\] textbox "Notas" \(disabled\)/)
    expect(result.pageContent).toMatch(/\[ref_\d+\] combobox "UF" = "SP" \(disabled\)/)
    expect(result.pageContent).not.toContain('"Ativo" (disabled)')
  })

  it("marca (disabled) em <button> desabilitado", () => {
    document.body.innerHTML = `<button aria-label="Parado" disabled>Parado</button>`

    const result = api.generate()
    const button = api.elements().find((info) => info.tag === "button")

    expect(result.pageContent).toMatch(/\[ref_\d+\] button "Parado" \(disabled\)/)
    expect(button?.disabled).toBe(true)
  })

  it("mostra checked/unchecked e linhas sem nome", () => {
    document.body.innerHTML = `
      <input type="checkbox" aria-label="Aceito" checked>
      <input type="checkbox" aria-label="Recusado">
      <div></div>`

    const result = api.generate()

    expect(result.pageContent).toMatch(/\[ref_\d+\] checkbox "Aceito" = "on" \(checked\)/)
    expect(result.pageContent).toMatch(/\[ref_\d+\] checkbox "Recusado" = "on" \(unchecked\)/)
    expect(result.pageContent).toMatch(/^ {2}\[ref_\d+\] generic$/m)
  })

  it("usa documentElement como raiz quando não há body", () => {
    const body = document.body
    body.remove()
    try {
      const result = api.generate()

      expect(result.count).toBe(1)
      expect(result.pageContent).toMatch(/^\[ref_\d+\] generic/)
      expect(api.elements().map((info) => info.tag)).toEqual(["html"])
    } finally {
      document.documentElement.appendChild(body)
    }
  })
})

describe("content/a11y — elements", () => {
  it("devolve infos com ref, role, tag, rect e ignora script/style/ocultos", () => {
    document.body.innerHTML = `
      <script>window.__scriptExecutou = true</script>
      <style>.x { color: red }</style>
      <button aria-label="Botão">Botão</button>
      <div aria-label="Oculto" style="display:none">Oculto</div>`

    const infos = api.elements()
    const tags = infos.map((info) => info.tag)

    expect(tags).toEqual(["body", "button"])
    const button = infos.find((info) => info.tag === "button")
    expect(button).toMatchObject({
      role: "button",
      name: "Botão",
      ref: expect.stringMatching(/^ref_\d+$/),
      rect: { x: 0, y: 0, width: 100, height: 20 },
    })
  })

  it("não considera visível o elemento sem filhos e sem dimensões", () => {
    document.body.innerHTML = `<div aria-label="Vazio"></div><button aria-label="Ok">Ok</button>`
    const vazio = document.querySelector<HTMLElement>('[aria-label="Vazio"]')
    vazio!.getBoundingClientRect = () => fakeRect(0, 0, 0, 0)

    const infos = api.elements()

    expect(infos.some((info) => info.name === "Vazio")).toBe(false)
    expect(infos.some((info) => info.name === "Ok")).toBe(true)
  })

  it("limita a varredura a 30 níveis de profundidade", () => {
    let html = ""
    for (let index = 0; index < 40; index += 1) html += "<div>"
    html += `<button aria-label="Fundo">Fundo</button>`
    for (let index = 0; index < 40; index += 1) html += "</div>"
    document.body.innerHTML = html

    const infos = api.elements()

    expect(infos.some((info) => info.tag === "button")).toBe(false)
    expect(infos).toHaveLength(31)
  })

  it(
    "limita a coleta a 4000 elementos",
    () => {
      document.body.innerHTML = Array.from({ length: 4050 }, () => `<button>X</button>`).join("")

      expect(api.elements()).toHaveLength(4000)
    },
    20_000,
  )

  it("descreve tipos, valores, checked e disabled", () => {
    document.body.innerHTML = `
      <input type="text" aria-label="Nome" value="Ana">
      <input type="checkbox" aria-label="Aceito" checked>
      <textarea aria-label="Notas" disabled>texto</textarea>
      <select aria-label="UF">
        <option value="sp">São Paulo</option>
        <option value="rj">Rio</option>
      </select>`

    const infos = api.elements()
    const byName = (name: string) => infos.find((info) => info.name === name)

    expect(byName("Nome")).toMatchObject({ role: "textbox", tag: "input", type: "text", value: "Ana", disabled: false })
    expect(byName("Aceito")).toMatchObject({ role: "checkbox", checked: true, type: "checkbox" })
    expect(byName("Notas")).toMatchObject({ role: "textbox", tag: "textarea", value: "texto", disabled: true })
    expect(byName("UF")).toMatchObject({ role: "combobox", tag: "select", value: "São Paulo" })
  })

  it("mapeia tags e tipos de input para roles ARIA", () => {
    document.body.innerHTML = `
      <h1 aria-label="h1"></h1><h2 aria-label="h2"></h2><h3 aria-label="h3"></h3>
      <h4 aria-label="h4"></h4><h5 aria-label="h5"></h5><h6 aria-label="h6"></h6>
      <nav aria-label="nav"></nav><main aria-label="main"></main><header aria-label="header"></header>
      <footer aria-label="footer"></footer><section aria-label="section"></section>
      <article aria-label="article"></article><aside aria-label="aside"></aside>
      <form aria-label="form"></form><table aria-label="table"></table>
      <ul aria-label="ul"><li aria-label="li">i</li></ul><ol aria-label="ol"></ol>
      <label aria-label="label">l</label><dialog open aria-label="dialog"></dialog>
      <select aria-label="select"></select><textarea aria-label="textarea"></textarea>
      <img alt="alt da imagem" aria-label="imagem">
      <input type="submit" aria-label="submit"><input type="reset" aria-label="reset">
      <input type="button" aria-label="button"><input type="file" aria-label="file">
      <input type="search" aria-label="search"><input type="range" aria-label="range">
      <input type="checkbox" aria-label="checkbox"><input type="radio" aria-label="radio">
      <input aria-label="sem tipo">
      <div role="tab" aria-label="tab"></div>
      <div aria-label="div generica"></div>
      <span aria-label="span generico"></span>`

    const byName = new Map(api.elements().map((info) => [info.name, info.role]))

    expect(Object.fromEntries(byName)).toMatchObject({
      h1: "heading",
      h2: "heading",
      h3: "heading",
      h4: "heading",
      h5: "heading",
      h6: "heading",
      nav: "navigation",
      main: "main",
      header: "banner",
      footer: "contentinfo",
      section: "region",
      article: "article",
      aside: "complementary",
      form: "form",
      table: "table",
      ul: "list",
      li: "listitem",
      ol: "list",
      label: "label",
      dialog: "dialog",
      select: "combobox",
      textarea: "textbox",
      imagem: "image",
      submit: "button",
      reset: "button",
      button: "button",
      file: "button",
      search: "searchbox",
      range: "slider",
      checkbox: "checkbox",
      radio: "radio",
      "sem tipo": "textbox",
      tab: "tab",
      "div generica": "generic",
      "span generico": "generic",
    })
  })

  it("marca contenteditable como textbox e interativo", () => {
    document.body.innerHTML = `<div contenteditable="true" aria-label="Editor">Editor</div>`

    const editor = api.elements().find((info) => info.name === "Editor" && info.tag === "div")

    expect(editor).toMatchObject({ role: "textbox", tag: "div" })
    expect(api.generate({ filter: "interactive" }).pageContent).toContain("Editor")
  })
})

describe("content/a11y — nomes acessíveis", () => {
  it("prioriza aria-label, depois aria-labelledby, alt, label, placeholder, valor e título", () => {
    document.body.innerHTML = `
      <span id="rotulo">Rótulo externo</span>
      <button aria-label="Fechar">X</button>
      <button aria-labelledby="rotulo"></button>
      <img alt="Foto" aria-label="Imagem rotulada">
      <label for="com-label">Nome no label</label>
      <input id="com-label">
      <input placeholder="Só placeholder">
      <input value="valor puro">
      <button title="Título">Botão com título</button>
      <div title="Dica"></div>`

    const byName = new Map(api.elements().map((info) => [info.name, info]))

    expect(byName.get("Fechar")).toMatchObject({ tag: "button", name: "Fechar" })
    expect(byName.get("Rótulo externo")).toMatchObject({ tag: "button" })
    expect(byName.get("Imagem rotulada")).toMatchObject({ tag: "img", role: "image" })
    expect(byName.get("Nome no label")).toMatchObject({ tag: "input", role: "textbox" })
    expect(byName.get("Só placeholder")).toMatchObject({ tag: "input" })
    expect(byName.get("valor puro")).toMatchObject({ tag: "input", value: "valor puro" })
    expect(byName.get("Título")).toMatchObject({ tag: "button" })
    expect(byName.get("Dica")).toMatchObject({ tag: "div", role: "generic" })
  })

  it("usa o alt quando não há aria-label e o texto como último recurso", () => {
    document.body.innerHTML = `<img alt="Foto"><a href="/x">Texto do link</a>`

    const infos = api.elements()

    expect(infos.find((info) => info.tag === "img")).toMatchObject({ name: "Foto", role: "image" })
    expect(infos.find((info) => info.tag === "a")).toMatchObject({ name: "Texto do link", role: "link" })
  })

  it("cai para as próximas estratégias quando aria-labelledby/alt não resolvem", () => {
    document.body.innerHTML = `
      <span id="vazio"></span>
      <button aria-labelledby="vazio">Fallback pelo texto</button>
      <button aria-labelledby="nao-existe">Sem destino</button>
      <img>
      <input id="orfao" value="valor sem label">`

    const infos = api.elements()

    expect(infos.find((info) => info.tag === "button" && info.name === "Fallback pelo texto")).toBeTruthy()
    expect(infos.find((info) => info.tag === "button" && info.name === "Sem destino")).toBeTruthy()
    expect(infos.find((info) => info.tag === "img")?.name).toBe("")
    expect(infos.find((info) => info.tag === "input")).toMatchObject({ name: "valor sem label" })
  })

  it("usa o texto da opção selecionada como nome do select sem label", () => {
    document.body.innerHTML = `
      <select id="sem-label">
        <option value="sp">São Paulo</option>
        <option value="rj" selected>Rio</option>
      </select>`

    expect(api.elements().find((info) => info.tag === "select")).toMatchObject({
      name: "Rio",
      role: "combobox",
      value: "Rio",
    })
  })

  it("redige valor de senha, campos ocultos e autocomplete sensível", () => {
    document.body.innerHTML = `
      <label for="pw">Senha</label>
      <input id="pw" type="password" value="segredo123">
      <input type="hidden" value="oculto456">
      <input autocomplete="cc-number" placeholder="Cartão" value="4111111111111111">
      <input autocomplete="one-time-code" value="123456">
      <input aria-label="Público" value="visível">`

    const infos = api.elements()
    const serialized = JSON.stringify(infos)
    const senha = infos.find((info) => info.type === "password")
    const cartao = infos.find((info) => info.name.startsWith("Cartão"))
    const token = infos.find((info) => info.tag === "input" && info.name === "[value redacted]" && info.type !== "hidden")
    // input[type=hidden] tem display:none, então só aparece em generate()
    const generated = api.generate()

    expect(senha).toMatchObject({ name: "Senha [value redacted]" })
    expect(senha && "value" in senha).toBe(false)
    expect(cartao).toMatchObject({ name: "Cartão [value redacted]" })
    expect(cartao && "value" in cartao).toBe(false)
    expect(token).toBeTruthy()
    expect(token && "value" in token).toBe(false)
    expect(infos.find((info) => info.name === "Público")).toMatchObject({ value: "visível" })
    expect(generated.pageContent).toMatch(/\[ref_\d+\] textbox "[^"]*\[value redacted\]"/)
    expect(serialized).not.toContain("segredo123")
    expect(serialized).not.toContain("4111111111111111")
    expect(serialized).not.toContain("123456")
    expect(generated.pageContent).not.toContain("oculto456")
    expect(generated.pageContent).not.toContain("segredo123")
  })
})

describe("content/a11y — resolve", () => {
  it("rola até o elemento e devolve o centro da caixa", () => {
    document.body.innerHTML = `<button aria-label="Alvo">Alvo</button>`
    const alvo = document.querySelector("button")!
    alvo.getBoundingClientRect = () => fakeRect(10, 20, 100, 40)
    const ref = refFor("Alvo")

    const resolved = api.resolve(ref)

    expect(scrollIntoView).toHaveBeenCalledWith(SCROLL_OPTIONS)
    expect(resolved).toMatchObject({
      ref,
      role: "button",
      name: "Alvo",
      tag: "button",
      rect: { x: 10, y: 20, width: 100, height: 40 },
      x: 60,
      y: 40,
    })
  })

  it("devolve null para ref inexistente", () => {
    expect(api.resolve("ref_404")).toBeNull()
    expect(scrollIntoView).not.toHaveBeenCalled()
  })
})

describe("content/a11y — setValue", () => {
  it("preenche input de texto e dispara input/change", () => {
    document.body.innerHTML = `<input aria-label="Nome" value="antigo">`
    const input = document.querySelector("input")!
    const events: string[] = []
    input.addEventListener("input", () => events.push("input"))
    input.addEventListener("change", () => events.push("change"))
    const ref = refFor("Nome")

    expect(api.setValue(ref, "novo valor")).toEqual({ ok: true })

    expect(input.value).toBe("novo valor")
    expect(events).toEqual(["input", "change"])
    expect(document.activeElement).toBe(input)
  })

  it("preenche textarea e dispara input/change", () => {
    document.body.innerHTML = `<textarea aria-label="Notas"></textarea>`
    const textarea = document.querySelector("textarea")!
    const events: string[] = []
    textarea.addEventListener("input", () => events.push("input"))
    textarea.addEventListener("change", () => events.push("change"))

    expect(api.setValue(refFor("Notas"), "linha 1\nlinha 2")).toEqual({ ok: true })

    expect(textarea.value).toBe("linha 1\nlinha 2")
    expect(events).toEqual(["input", "change"])
    expect(document.activeElement).toBe(textarea)
  })

  it("seleciona opção do select por valor e por texto e erra quando não existe", () => {
    document.body.innerHTML = `
      <select aria-label="UF">
        <option value="sp">São Paulo</option>
        <option value="rj">Rio</option>
      </select>`
    const select = document.querySelector("select")!
    const events: string[] = []
    select.addEventListener("input", () => events.push("input"))
    select.addEventListener("change", () => events.push("change"))
    const ref = refFor("UF")

    expect(api.setValue(ref, "rj")).toEqual({ ok: true })
    expect(select.value).toBe("rj")
    expect(api.setValue(ref, "São Paulo")).toEqual({ ok: true })
    expect(select.value).toBe("sp")
    expect(events).toEqual(["input", "change", "input", "change"])
    expect(api.setValue(ref, "inexistente")).toEqual({ ok: false, error: "Opção não encontrada no select." })
  })

  it("marca checkbox e radio apenas quando o estado diverge", () => {
    document.body.innerHTML = `
      <input type="checkbox" aria-label="Aceito">
      <input type="radio" name="grupo" aria-label="Opção A">
      <input type="radio" name="grupo" aria-label="Opção B" checked>`
    const checkbox = document.querySelector<HTMLInputElement>('input[type="checkbox"]')!
    const radios = document.querySelectorAll<HTMLInputElement>('input[type="radio"]')
    const clickCheckbox = vi.fn()
    checkbox.addEventListener("click", clickCheckbox)
    const checkboxRef = refFor("Aceito")

    expect(api.setValue(checkboxRef, "true")).toEqual({ ok: true })
    expect(checkbox.checked).toBe(true)
    expect(clickCheckbox).toHaveBeenCalledTimes(1)

    expect(api.setValue(checkboxRef, "1")).toEqual({ ok: true })
    expect(checkbox.checked).toBe(true)
    expect(clickCheckbox).toHaveBeenCalledTimes(1)

    expect(api.setValue(checkboxRef, "false")).toEqual({ ok: true })
    expect(checkbox.checked).toBe(false)

    expect(api.setValue(refFor("Opção B"), "checked")).toEqual({ ok: true })
    expect(radios[1]!.checked).toBe(true)
    expect(api.setValue(refFor("Opção A"), "true")).toEqual({ ok: true })
    expect(radios[0]!.checked).toBe(true)
    expect(radios[1]!.checked).toBe(false)
    expect(api.setValue(refFor("Opção B"), "false")).toEqual({ ok: true })
    expect(radios[1]!.checked).toBe(false)
  })

  it("preenche contenteditable com InputEvent", () => {
    document.body.innerHTML = `<div contenteditable="true" aria-label="Editor">antigo</div>`
    const editor = document.querySelector("div")!
    const events: InputEvent[] = []
    editor.addEventListener("input", (event) => events.push(event as InputEvent))

    expect(api.setValue(refFor("Editor"), "novo")).toEqual({ ok: true })

    expect(editor.textContent).toBe("novo")
    expect(events).toHaveLength(1)
    expect(events[0]?.data).toBe("novo")
    expect(document.activeElement).toBe(editor)
  })

  it("dispara clique em <a> e <button> e erra em elementos que não aceitam valor", () => {
    document.body.innerHTML = `
      <a href="#destino" aria-label="Ir">Ir</a>
      <button aria-label="Ok">Ok</button>
      <div aria-label="Caixa">Caixa</div>`
    const link = document.querySelector("a")!
    const button = document.querySelector("button")!
    const linkClick = vi.fn((event: Event) => event.preventDefault())
    const buttonClick = vi.fn()
    link.addEventListener("click", linkClick)
    button.addEventListener("click", buttonClick)

    expect(api.setValue(refFor("Ir"), "qualquer")).toEqual({ ok: true })
    expect(linkClick).toHaveBeenCalledTimes(1)
    expect(api.setValue(refFor("Ok"), "qualquer")).toEqual({ ok: true })
    expect(buttonClick).toHaveBeenCalledTimes(1)
    expect(api.setValue(refFor("Caixa"), "x")).toEqual({ ok: false, error: "Elemento <div> não aceita valor." })
  })

  it("devolve erro para ref inexistente", () => {
    expect(api.setValue("ref_404", "x")).toEqual({ ok: false, error: "Ref ref_404 não encontrada." })
  })
})

describe("content/a11y — clickRef/hoverRef/scrollRef/focusRef", () => {
  it("clickRef rola até o elemento e dispara a sequência de eventos de mouse no centro", () => {
    document.body.innerHTML = `<button aria-label="Alvo">Alvo</button>`
    const button = document.querySelector("button")!
    button.getBoundingClientRect = () => fakeRect(0, 0, 40, 10)
    const seen: string[] = []
    for (const type of MOUSE_TYPES) {
      button.addEventListener(type, (event) => {
        const mouse = event as MouseEvent
        seen.push(`${type}:${Math.round(mouse.clientX)},${Math.round(mouse.clientY)}`)
      })
    }

    expect(api.clickRef(refFor("Alvo"))).toEqual({ ok: true })

    expect(seen).toEqual([
      "mouseover:20,5",
      "mousemove:20,5",
      "mousedown:20,5",
      "mouseup:20,5",
      "click:20,5",
    ])
    expect(scrollIntoView).toHaveBeenCalledWith(SCROLL_OPTIONS)
  })

  it("hoverRef dispara mouseover/mousemove sem clique", () => {
    document.body.innerHTML = `<button aria-label="Alvo">Alvo</button>`
    const button = document.querySelector("button")!
    const seen: string[] = []
    for (const type of MOUSE_TYPES) button.addEventListener(type, () => seen.push(type))

    expect(api.hoverRef(refFor("Alvo"))).toEqual({ ok: true })

    expect(seen).toEqual(["mouseover", "mousemove"])
    expect(scrollIntoView).toHaveBeenCalledWith(SCROLL_OPTIONS)
  })

  it("scrollRef apenas rola até o elemento, sem eventos de mouse", () => {
    document.body.innerHTML = `<button aria-label="Alvo">Alvo</button>`
    const button = document.querySelector("button")!
    const seen: string[] = []
    for (const type of MOUSE_TYPES) button.addEventListener(type, () => seen.push(type))

    expect(api.scrollRef(refFor("Alvo"))).toEqual({ ok: true })

    expect(seen).toEqual([])
    expect(scrollIntoView).toHaveBeenCalledWith(SCROLL_OPTIONS)
  })

  it("focusRef rola até o elemento e dá foco", () => {
    document.body.innerHTML = `<input aria-label="Campo">`
    const input = document.querySelector("input")!

    expect(api.focusRef(refFor("Campo"))).toEqual({ ok: true })

    expect(document.activeElement).toBe(input)
    expect(scrollIntoView).toHaveBeenCalledWith(SCROLL_OPTIONS)
  })

  it("devolve erro para ref inexistente em todos os comandos", () => {
    for (const command of [api.clickRef, api.hoverRef, api.scrollRef, api.focusRef]) {
      expect(command("ref_404")).toEqual({ ok: false, error: "Ref ref_404 não encontrada." })
    }
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it("focusRef não quebra em elementos que não são HTMLElement (ex.: svg)", () => {
    document.body.innerHTML = `<svg width="10" height="10"><circle r="5"></circle></svg>`
    const svg = document.querySelector("svg")!
    const ref = api.elements().find((info) => info.tag === "svg")!.ref

    expect(api.focusRef(ref)).toEqual({ ok: true })

    expect(document.activeElement).not.toBe(svg)
    expect(scrollIntoView).toHaveBeenCalledWith(SCROLL_OPTIONS)
  })
})

describe("content/a11y — uploadFiles", () => {
  it("envia arquivos para input[type=file] e dispara input/change", async () => {
    document.body.innerHTML = `<input type="file" aria-label="Anexo">`
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!
    prepareFileInput(input)
    const events: string[] = []
    input.addEventListener("input", () => events.push("input"))
    input.addEventListener("change", () => events.push("change"))

    const result = api.uploadFiles(refFor("Anexo"), [
      { data: btoa("conteudo do arquivo"), name: "nota.txt", mimeType: "text/plain" },
    ])

    expect(result).toEqual({ ok: true, target: "input" })
    const files = input.files as unknown as File[]
    expect(files).toHaveLength(1)
    expect(files[0]!.name).toBe("nota.txt")
    expect(files[0]!.type).toBe("text/plain")
    expect(await files[0]!.text()).toBe("conteudo do arquivo")
    expect(events).toEqual(["input", "change"])
  })

  it("usa mimeType padrão quando ele não é informado", () => {
    document.body.innerHTML = `<input type="file" aria-label="Anexo">`
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!
    prepareFileInput(input)

    api.uploadFiles(refFor("Anexo"), [{ data: btoa("x"), name: "x.bin" }])

    expect((input.files as unknown as File[])[0]!.type).toBe("application/octet-stream")
  })

  it("encontra input[type=file] dentro do alvo", () => {
    document.body.innerHTML = `<label aria-label="Enviar arquivo"><input type="file"></label>`
    const nested = document.querySelector<HTMLInputElement>('input[type="file"]')!
    prepareFileInput(nested)

    const result = api.uploadFiles(refFor("Enviar arquivo"), [{ data: btoa("y"), name: "y.txt" }])

    expect(result).toEqual({ ok: true, target: "input" })
    expect((nested.files as unknown as File[])[0]!.name).toBe("y.txt")
  })

  it("usa drag & drop quando não há input[type=file]", () => {
    document.body.innerHTML = `<div aria-label="Área de soltura">Solte aqui</div>`
    const area = document.querySelector("div")!
    const seen: string[] = []
    for (const type of ["dragenter", "dragover", "drop"]) {
      area.addEventListener(type, (event) => {
        seen.push(`${type}:${(event as DragEvent).dataTransfer ? "com-arquivo" : "sem-arquivo"}`)
      })
    }

    const result = api.uploadFiles(refFor("Área de soltura"), [{ data: btoa("z"), name: "z.png" }])

    expect(result).toEqual({ ok: true, target: "drop" })
    expect(seen).toEqual(["dragenter:com-arquivo", "dragover:com-arquivo", "drop:com-arquivo"])
  })

  it("devolve erro para base64 inválido e para ref inexistente", () => {
    document.body.innerHTML = `<div aria-label="Área">Área</div>`
    const ref = refFor("Área")

    const invalido = api.uploadFiles(ref, [{ data: "não é base64!!", name: "x.txt" }])
    expect(invalido.ok).toBe(false)
    expect(invalido.error).toBeTruthy()

    vi.stubGlobal("atob", () => {
      throw "falha não-Error"
    })
    expect(api.uploadFiles(ref, [{ data: "QUJD", name: "x.txt" }])).toEqual({
      ok: false,
      error: "Falha ao montar o arquivo.",
    })

    expect(api.uploadFiles("ref_404", [{ data: btoa("x"), name: "x.txt" }])).toEqual({
      ok: false,
      error: "Ref ref_404 não encontrada.",
    })
  })
})

describe("content/a11y — pageText", () => {
  it("prefere article e devolve título/url/fonte", () => {
    document.body.innerHTML = `<article>${"a".repeat(300)}</article><main>curto</main>`

    const result = api.pageText()

    expect(result.source).toBe("article")
    expect(result.text).toBe("a".repeat(300))
    expect(result.title).toBe("Página de teste")
    expect(result.url).toBe(location.href)
  })

  it("usa main quando não há article", () => {
    document.body.innerHTML = `<main>${"m".repeat(250)}</main><div>curto</div>`

    expect(api.pageText().source).toBe("main")
  })

  it("usa [role=main] quando não há article/main", () => {
    document.body.innerHTML = `<div role="main">${"z".repeat(250)}</div>`

    expect(api.pageText().source).toBe("div")
  })

  it("faz fallback para o body e colapsa quebras de linha", () => {
    document.body.innerHTML = `<p>a</p>\n\n\n\n<p>b</p>`

    const result = api.pageText()

    expect(result.source).toBe("body")
    expect(result.text).toBe("a\n\nb")
  })

  it("trunca em maxChars na última quebra de linha", () => {
    const lines = Array.from({ length: 60 }, (_, index) => `linha ${index} ${"x".repeat(20)}`)
    document.body.innerHTML = `<p>${lines.join("\n")}</p>`

    const result = api.pageText(300)

    expect(result.text.endsWith("[truncado]")).toBe(true)
    const content = result.text.replace("\n\n[truncado]", "")
    expect(content.length).toBeLessThanOrEqual(300)
    expect(content.length).toBeGreaterThan(200)
  })

  it("trunca texto longo sem quebra de linha no limite informado", () => {
    document.body.innerHTML = `<p>${"y".repeat(500)}</p>`

    const result = api.pageText(200)

    const content = result.text.replace("\n\n[truncado]", "")
    expect(result.text.endsWith("[truncado]")).toBe(true)
    expect(content.length).toBeLessThanOrEqual(200)
    expect(content.length).toBeGreaterThan(150)
  })

  it("devolve texto vazio quando não há conteúdo", () => {
    const result = api.pageText()

    expect(result.text).toBe("")
    expect(result.source).toBe("body")
  })

  it("devolve texto vazio quando innerText não está disponível", () => {
    delete (HTMLElement.prototype as unknown as { innerText?: unknown }).innerText
    document.body.innerHTML = `<p>conteúdo</p>`

    const result = api.pageText()

    expect(result.text).toBe("")
    expect(result.source).toBe("body")
    expect(result.title).toBe("Página de teste")
  })
})
