#!/usr/bin/env bash
#
# Instala a extensão OpenCode Browser e o plugin do relay.
#
# Uso (na raiz do repositório ou de qualquer lugar):
#   ./scripts/install.sh
#
# O script valida Node.js 20+, npm e OpenCode v2 antes de instalar, buildar,
# copiar o plugin para ~/.config/opencode/plugins e reiniciar o serviço.
# Requer Linux ou macOS.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [ -t 1 ]; then
  BOLD=$'\033[1m'
  GREEN=$'\033[32m'
  YELLOW=$'\033[33m'
  RED=$'\033[31m'
  RESET=$'\033[0m'
else
  BOLD=""
  GREEN=""
  YELLOW=""
  RED=""
  RESET=""
fi

step() { printf '\n%s==> %s%s\n' "$BOLD" "$*" "$RESET"; }
ok() { printf '    %s✓%s %s\n' "$GREEN" "$RESET" "$*"; }
warn() { printf '    %s!%s %s\n' "$YELLOW" "$RESET" "$*"; }
fail() {
  printf '\n%s✗ %s%s\n' "$RED" "$*" "$RESET" >&2
  exit 1
}

# ---------------------------------------------------------------- validações

step "Validando o ambiente"

[ -f "$ROOT/package.json" ] ||
  fail "package.json não encontrado em $ROOT. Rode o script de dentro do repositório."

command -v node >/dev/null 2>&1 ||
  fail "Node.js não encontrado no PATH. Instale Node.js 20 ou superior: https://nodejs.org"

NODE_VERSION="$(node -v 2>/dev/null || true)"
NODE_MAJOR="$(printf '%s' "$NODE_VERSION" | sed -E 's/^v([0-9]+).*/\1/')"
case "$NODE_MAJOR" in
  '' | *[!0-9]*) fail "Não foi possível ler a versão do Node.js (saída: ${NODE_VERSION:-vazia})." ;;
esac
[ "$NODE_MAJOR" -ge 20 ] ||
  fail "Node.js ${NODE_VERSION} encontrado; é necessário Node.js 20 ou superior."
ok "Node.js ${NODE_VERSION}"

command -v npm >/dev/null 2>&1 ||
  fail "npm não encontrado no PATH. Ele vem com o Node.js: reinstale em https://nodejs.org"
ok "npm $(npm -v 2>/dev/null || echo '?')"

OPENCODE="$(command -v opencode || true)"
if [ -z "$OPENCODE" ] && [ -x "${HOME}/.opencode/bin/opencode" ]; then
  OPENCODE="${HOME}/.opencode/bin/opencode"
  warn "opencode não está no PATH; usando ${OPENCODE}"
  warn "Adicione ${HOME}/.opencode/bin ao PATH para os próximos terminais."
fi
[ -n "$OPENCODE" ] ||
  fail "OpenCode v2 não encontrado no PATH. Instale o OpenCode v2 e abra um novo terminal."

OPENCODE_VERSION_OUTPUT="$("$OPENCODE" --version 2>/dev/null | head -n 1 || true)"
OPENCODE_VERSION="$(printf '%s\n' "$OPENCODE_VERSION_OUTPUT" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -n 1 || true)"
[ -n "$OPENCODE_VERSION" ] ||
  fail "Não foi possível interpretar a versão do OpenCode (saída: ${OPENCODE_VERSION_OUTPUT:-vazia}). Confirme com 'opencode --version'."
OPENCODE_MAJOR="${OPENCODE_VERSION%%.*}"
[ "$OPENCODE_MAJOR" -ge 2 ] ||
  fail "OpenCode v${OPENCODE_VERSION} encontrado. Esta extensão exige OpenCode v2 ou superior."
ok "OpenCode v${OPENCODE_VERSION} (${OPENCODE})"

# ---------------------------------------------------------------- instalação

step "Instalando dependências (npm install)"
npm install || fail "Falha no npm install. Veja o erro acima."
ok "Dependências instaladas."

step "Gerando o build da extensão (npm run build)"
npm run build || fail "Falha no build. Veja o erro acima."
ok "Build gerado em ${ROOT}/dist"

step "Instalando o plugin no OpenCode (npm run install:plugin)"
npm run install:plugin || fail "Falha ao instalar o plugin."
ok "Plugin copiado para a pasta de plugins do OpenCode."

step "Reiniciando o serviço do OpenCode (opencode service restart)"
if ! "$OPENCODE" service restart; then
  fail "Não foi possível reiniciar o serviço. Rode 'opencode service restart' manualmente; sem isso o plugin antigo continua em memória."
fi
ok "Serviço reiniciado."

# O relay só responde depois que o plugin carrega. Falha aqui não invalida a
# instalação, por isso é só um aviso.
if command -v curl >/dev/null 2>&1; then
  for _ in 1 2 3 4 5; do
    if curl -fsS --max-time 1 http://127.0.0.1:8799/health >/dev/null 2>&1; then
      ok "Relay do plugin respondendo em http://127.0.0.1:8799/health"
      break
    fi
    sleep 1
  done
  if ! curl -fsS --max-time 1 http://127.0.0.1:8799/health >/dev/null 2>&1; then
    warn "O relay ainda não respondeu em 127.0.0.1:8799. Abra o painel da extensão e verifique."
  fi
fi

# ---------------------------------------------------------------- resumo

printf '\n%sInstalação concluída.%s\n\n' "$BOLD$GREEN" "$RESET"
cat <<'EOF'
Próximos passos:
  1. Abra chrome://extensions e recarregue "OpenCode Browser"
     (ou use "Carregar sem compactação" apontando para a pasta dist/).
  2. Abra o side panel e clique em "Conectar" para parear com o OpenCode.
  3. Se o painel não conectar, confira o relay:
       curl http://127.0.0.1:8799/health
EOF
