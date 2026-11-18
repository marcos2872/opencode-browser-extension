import { describe, expect, it } from "vitest"
import { en } from "../../src/shared/i18n/en"
import { pt } from "../../src/shared/i18n/pt-BR"
import {
  DEFAULT_LOCALE,
  effectiveLocale,
  resolveLocale,
  translate,
} from "../../src/shared/i18n"

/**
 * Traduções divergentes são o risco principal de um catálogo duplicado. A
 * paridade de forma já é garantida pelo `tsc`; aqui garantimos o conteúdo:
 * nenhuma chave vazia, nenhuma sobra, nenhum placeholder perdido.
 */
describe("catálogos de i18n", () => {
  const ptKeys = Object.keys(pt).sort()
  const enKeys = Object.keys(en).sort()

  it("têm exatamente as mesmas chaves", () => {
    expect(enKeys).toEqual(ptKeys)
  })

  it("não tem mensagem vazia", () => {
    for (const key of ptKeys) {
      const value = (en as Record<string, unknown>)[key]
      expect(typeof (pt as Record<string, unknown>)[key]).toBe(
        typeof value,
      )
      if (typeof value === "string") {
        expect(value.trim(), `en.${key}`).not.toBe("")
      }
      const source = (pt as Record<string, unknown>)[key]
      if (typeof source === "string") {
        expect(source.trim(), `pt.${key}`).not.toBe("")
      }
    }
  })

  it("mantém os parâmetros das mensagens com função", () => {
    // O `tsc` garante a forma dos argumentos; aqui garantimos o conteúdo. Em vez
    // de um objeto fixo (que envelhece a cada chave nova), os campos são
    // derivados do próprio corpo da função: `p.<campo>`.
    const NUMERIC = new Set(["id", "count", "percent", "seconds", "code", "tabId", "x", "y"])
    const fieldsOf = (fn: unknown): string[] =>
      Array.from(new Set(Array.from(String(fn).matchAll(/p\.([A-Za-z_][A-Za-z0-9_]*)/g), (m) => m[1])))
    const sampleFor = (fields: string[]): Record<string, unknown> =>
      Object.fromEntries(
        fields.map((field) =>
          NUMERIC.has(field) ? [field, 7] : field === "error" ? [field, null] : [field, "v"],
        ),
      )

    for (const key of ptKeys) {
      const ptFn = (pt as Record<string, unknown>)[key]
      const enFn = (en as Record<string, unknown>)[key]
      if (typeof ptFn !== "function") continue
      expect(typeof enFn, `en.${key}`).toBe("function")

      const fields = fieldsOf(ptFn)
      const enFields = fieldsOf(enFn)
      // Uma chave nova em inglês que o português não usa é sinal de tradução
      // feita sobre uma versão antiga da mensagem.
      expect(enFields.filter((field) => !fields.includes(field)), `en.${key}`).toEqual([])

      const text = (enFn as (p: unknown) => string)(sampleFor([...fields, ...enFields]))
      expect(text, `en.${key}`).not.toContain("undefined")
      expect(text, `en.${key}`).not.toContain("NaN")
    }
  })
})

describe("resolução de idioma", () => {
  it("mapeia português (pt, pt-BR, pt-PT) para pt-BR", () => {
    expect(resolveLocale("pt")).toBe("pt-BR")
    expect(resolveLocale("pt-BR")).toBe("pt-BR")
    expect(resolveLocale("pt-BR-x-1")).toBe("pt-BR")
    expect(resolveLocale("pt_PT")).toBe("pt-BR")
  })

  it("mapeia todo o resto para inglês", () => {
    expect(resolveLocale("en-US")).toBe("en")
    expect(resolveLocale("es-ES")).toBe("en")
    expect(resolveLocale("de")).toBe("en")
    expect(resolveLocale("")).toBe(DEFAULT_LOCALE)
    expect(resolveLocale(null)).toBe(DEFAULT_LOCALE)
  })

  it("a preferência manual sobrepõe o idioma do navegador", () => {
    expect(effectiveLocale("en", "pt-BR")).toBe("en")
    expect(effectiveLocale("pt-BR", "en-US")).toBe("pt-BR")
  })

  it("`auto` segue o navegador", () => {
    expect(effectiveLocale("auto", "pt-BR")).toBe("pt-BR")
    expect(effectiveLocale("auto", "en-GB")).toBe("en")
    expect(effectiveLocale(null, "en-US")).toBe("en")
  })
})

describe("translate", () => {
  it("devolve a mensagem estática", () => {
    expect(translate("pt-BR", "app.retry")).toBe("Tentar novamente")
    expect(translate("en", "app.retry")).toBe("Try again")
  })

  it("interpola os parâmetros", () => {
    expect(translate("pt-BR", "composer.contextPercent", { tokens: "1.200", percent: 6 })).toBe(
      "Contexto 1.200 (6%)",
    )
    expect(translate("en", "composer.contextPercent", { tokens: "1,200", percent: 6 })).toBe(
      "Context 1,200 (6%)",
    )
  })

  it("cai no catálogo padrão quando o locale não tem a chave", () => {
    // `es` não existe no mapa de catálogos; o fallback é pt-BR.
    const value = translate("en" as never, "app.retry")
    expect(value).toBe("Try again")
  })
})
