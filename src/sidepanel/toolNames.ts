/** Remove o prefixo do namespace do plugin (`browser_navigate` → `navigate`). */
export function normalizeToolName(name: string): string {
  return name.startsWith("browser_") ? name.slice("browser_".length) : name
}
