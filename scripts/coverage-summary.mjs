import { readFileSync } from "node:fs"

const path = process.argv[2] ?? "coverage/coverage-summary.json"

let data
try {
  data = JSON.parse(readFileSync(path, "utf8"))
} catch {
  console.log("## Cobertura de testes\n")
  console.log("Sem relatório de cobertura (os testes falharam antes de gerar o arquivo).")
  process.exit(0)
}

const total = data.total ?? {}
const rows = [
  ["Linhas", total.lines],
  ["Funções", total.functions],
  ["Branches", total.branches],
  ["Instruções", total.statements],
]

console.log("## Cobertura de testes\n")
console.log("| Métrica | Cobertura | Cobertos | Total |")
console.log("|---|---:|---:|---:|")
for (const [label, metric] of rows) {
  if (!metric) continue
  console.log(`| ${label} | ${metric.pct}% | ${metric.covered} | ${metric.total} |`)
}

const files = Object.entries(data)
  .filter(([key]) => key !== "total")
  .map(([key, value]) => [key.replace(`${process.cwd()}/`, ""), value?.lines?.pct ?? 0])
  .sort((a, b) => a[1] - b[1])
  .slice(0, 5)

if (files.length > 0) {
  console.log("\n### Arquivos com menor cobertura\n")
  console.log("| Arquivo | Linhas |")
  console.log("|---|---:|")
  for (const [file, pct] of files) console.log(`| \`${file}\` | ${pct}% |`)
}

const threshold = 80
const below = rows.filter(([, metric]) => metric && metric.pct < threshold).map(([label]) => label)
if (below.length > 0) {
  console.log(`\n> **Abaixo do mínimo de ${threshold}%:** ${below.join(", ")}.`)
} else {
  console.log(`\n> Mínimo de ${threshold}% atingido em todas as métricas.`)
}
