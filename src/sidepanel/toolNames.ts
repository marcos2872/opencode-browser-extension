/** Nome da tool na extensão quando o nome exposto ao modelo é diferente. */
const ALIASES: Record<string, string> = {
  // `browser_tabs_close_tab` evita colisão com o browser nativo do OpenCode;
  // na extensão o handler continua `tabs_close`.
  tabs_close_tab: "tabs_close",
}

/** Remove o prefixo do namespace do plugin (`browser_navigate` → `navigate`). */
export function normalizeToolName(name: string): string {
  const normalized = name.startsWith("browser_")
    ? name.slice("browser_".length)
    : name
  return ALIASES[normalized] ?? normalized
}
