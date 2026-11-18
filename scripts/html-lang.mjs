/**
 * O `lang` do HTML é decidido em tempo de execução pelo idioma da interface
 * (o Vite não sabe qual é). O HTML de origem traz o marcador `__UI_LANG__` e
 * este plugin o troca pelo locale padrão no build, para que o arquivo publicado
 * nunca saia com um `lang` inválido; os entry points sobrescrevem o valor em
 * seguida com o idioma efetivo.
 */
export const UI_LANG_MARKER = "__UI_LANG__"

/**
 * Locale gravado no HTML do build. Duplica `DEFAULT_LOCALE` de propósito: o
 * script roda no build (Node), antes de existir módulo de i18n compilado.
 */
const BUILD_LOCALE = "pt-BR"

export function htmlLangPlugin() {
  return {
    name: "opencode-html-lang",
    transformIndexHtml(html) {
      return html.replaceAll(UI_LANG_MARKER, BUILD_LOCALE)
    },
  }
}
