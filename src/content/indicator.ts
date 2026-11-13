const HOST_ID = "opencode-browser-indicator"
const FADE_MS = 350
const PRESS_MS = 160
const RIPPLE_MS = 650

let host: HTMLDivElement | null = null
let root: ShadowRoot | null = null
let frame: HTMLDivElement | null = null
let pill: HTMLDivElement | null = null
let label: HTMLSpanElement | null = null
let cursor: HTMLDivElement | null = null
let cursorPlaced = false
let fadeTimer: ReturnType<typeof setTimeout> | null = null
let pressTimer: ReturnType<typeof setTimeout> | null = null

const STYLE = `
  :host { all: initial; }

  /* Borda: anel de 3px onde um gradiente cônico gira, mais um brilho interno pulsando. */
  .frame {
    position: fixed; inset: 0; pointer-events: none;
    opacity: 0; transition: opacity ${FADE_MS}ms ease;
  }
  .frame.on { opacity: 1; }
  .ring {
    position: absolute; inset: 0; padding: 3px; overflow: hidden;
    -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
    -webkit-mask-composite: xor;
    mask: linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0);
  }
  .ring::before {
    content: ""; position: absolute; left: 50%; top: 50%;
    width: 200vmax; height: 200vmax; margin: -100vmax 0 0 -100vmax;
    background: conic-gradient(from 0deg,
      #d97757 0%, #f4b896 12%, #d97757 28%,
      rgba(217,119,87,.18) 50%,
      #d97757 72%, #f4b896 88%, #d97757 100%);
    animation: spin 3.4s linear infinite;
  }
  .glow {
    position: absolute; inset: 0;
    box-shadow: inset 0 0 40px 4px rgba(217,119,87,.30), inset 0 0 120px rgba(217,119,87,.10);
    animation: pulse 2.6s ease-in-out infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes pulse { 0%,100% { opacity: .55; } 50% { opacity: 1; } }

  /* Rótulo com o botão Parar. */
  .pill {
    position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%);
    display: flex; align-items: center; gap: 10px;
    background: #141413; color: #faf9f5;
    font: 500 13px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    padding: 9px 10px 9px 14px; border-radius: 999px;
    box-shadow: 0 12px 32px rgba(0,0,0,.28);
    pointer-events: auto;
    opacity: 0; transition: opacity ${FADE_MS}ms ease;
  }
  .pill.on { opacity: 1; }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: #d97757; }
  .dot.busy { animation: blink 1s ease-in-out infinite; }
  @keyframes blink { 0%,100% { opacity: .35; } 50% { opacity: 1; } }
  .stop {
    border: 0; border-radius: 999px; padding: 6px 10px;
    background: #faf9f5; color: #141413; font: 600 12px/1 inherit; cursor: pointer;
  }
  .stop:hover { background: #f1efe8; }

  /* Mouse virtual: viaja suavemente, "afunda" ao clicar e solta uma onda. */
  .cursor {
    position: fixed; left: 0; top: 0; width: 22px; height: 28px; margin: -1px 0 0 -2px;
    pointer-events: none; opacity: 0;
    transition: transform 320ms cubic-bezier(.22,.8,.24,1), opacity 200ms ease;
    will-change: transform;
    filter: drop-shadow(0 2px 4px rgba(0,0,0,.35));
  }
  .cursor.on { opacity: 1; }
  .cursor.snap { transition: opacity 200ms ease; }
  .cursor svg { display: block; transform-origin: 2px 2px; transition: transform ${PRESS_MS / 2}ms ease-out; }
  .cursor.press svg { transform: scale(.78); }
  .ripple {
    position: fixed; left: 0; top: 0; width: 38px; height: 38px; margin: -19px 0 0 -19px;
    border-radius: 50%; pointer-events: none;
    border: 2px solid #d97757; background: rgba(217,119,87,.22);
    animation: ripple ${RIPPLE_MS}ms ease-out forwards;
  }
  @keyframes ripple { from { transform: translate3d(var(--x), var(--y), 0) scale(.2); opacity: .95; }
                      to   { transform: translate3d(var(--x), var(--y), 0) scale(1.5); opacity: 0; } }

  @media (prefers-reduced-motion: reduce) {
    .ring::before { animation: none; }
    .glow { animation: none; opacity: .8; }
    .cursor { transition: opacity 200ms ease; }
    .ripple { animation-duration: 1ms; }
  }
`

function cancelFade(): void {
  if (fadeTimer) clearTimeout(fadeTimer)
  fadeTimer = null
}

function mount(): void {
  if (window.top !== window) return
  cancelFade()
  if (host && document.documentElement.contains(host)) {
    // Voltou durante o fade-out: só reacende.
    frame?.classList.add("on")
    pill?.classList.add("on")
    if (cursorPlaced) cursor?.classList.add("on")
    return
  }
  // Sobra de um content script órfão (extensão recarregada): sem dono, nunca seria apagada.
  document.getElementById(HOST_ID)?.remove()
  host = document.createElement("div")
  host.id = HOST_ID
  host.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483647;"
  root = host.attachShadow({ mode: "closed" })

  const style = document.createElement("style")
  style.textContent = STYLE
  root.appendChild(style)

  frame = document.createElement("div")
  frame.className = "frame"
  const ring = document.createElement("div")
  ring.className = "ring"
  const glow = document.createElement("div")
  glow.className = "glow"
  frame.append(glow, ring)
  root.appendChild(frame)

  pill = document.createElement("div")
  pill.className = "pill"
  const dot = document.createElement("span")
  dot.className = "dot"
  dot.dataset.role = "dot"
  label = document.createElement("span")
  label.textContent = "OpenCode está nesta aba"
  const stop = document.createElement("button")
  stop.className = "stop"
  stop.textContent = "Parar"
  stop.addEventListener("click", () => {
    void chrome.runtime.sendMessage({ type: "browser:stop" })
  })
  pill.append(dot, label, stop)
  root.appendChild(pill)

  document.documentElement.appendChild(host)
  // Força o layout antes de acender, para a transição de opacidade rodar.
  void frame.offsetWidth
  frame.classList.add("on")
  pill.classList.add("on")
}

function unmount(): void {
  host?.remove()
  host = null
  root = null
  frame = null
  pill = null
  label = null
  cursor = null
  cursorPlaced = false
  cancelFade()
  if (pressTimer) clearTimeout(pressTimer)
  pressTimer = null
}

/** Apaga com fade e só então remove do DOM. */
function hide(): void {
  if (!host) return
  frame?.classList.remove("on")
  pill?.classList.remove("on")
  cursor?.classList.remove("on")
  cancelFade()
  fadeTimer = setTimeout(unmount, FADE_MS)
}

function ensureCursor(): HTMLDivElement | null {
  if (!root) return null
  if (cursor) return cursor
  cursor = document.createElement("div")
  cursor.className = "cursor snap"
  cursor.innerHTML = `
    <svg width="22" height="28" viewBox="0 0 18 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M1 1 L1 18 L5 14.5 L7.5 22 L11 20.5 L8.5 13 L14 13 Z"
        fill="#d97757" stroke="#faf9f5" stroke-width="1.5" stroke-linejoin="round"/>
    </svg>`
  root.appendChild(cursor)
  cursorPlaced = false
  return cursor
}

function moveCursor(x: number, y: number): HTMLDivElement | null {
  const element = ensureCursor()
  if (!element) return null
  if (typeof x !== "number" || typeof y !== "number") return element
  element.style.transform = `translate3d(${x}px, ${y}px, 0)`
  if (!cursorPlaced) {
    // Primeira aparição: nasce no destino em vez de cruzar a tela desde (0, 0).
    cursorPlaced = true
    void element.offsetWidth
    element.classList.remove("snap")
  }
  element.classList.add("on")
  return element
}

function clickAt(x: number, y: number): void {
  const element = moveCursor(x, y)
  if (!element || !root || typeof x !== "number" || typeof y !== "number") return

  element.classList.add("press")
  if (pressTimer) clearTimeout(pressTimer)
  pressTimer = setTimeout(() => element.classList.remove("press"), PRESS_MS)

  const ripple = document.createElement("div")
  ripple.className = "ripple"
  ripple.style.setProperty("--x", `${x}px`)
  ripple.style.setProperty("--y", `${y}px`)
  root.appendChild(ripple)
  setTimeout(() => ripple.remove(), RIPPLE_MS + 100)
}

export function installIndicator(): void {
  if (window.top !== window) return
  if ((window as unknown as { __opencodeIndicatorInstalled?: boolean }).__opencodeIndicatorInstalled) return
  ;(window as unknown as { __opencodeIndicatorInstalled?: boolean }).__opencodeIndicatorInstalled = true
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "indicator:show") {
      mount()
      return
    }
    if (message?.type === "indicator:hide") {
      hide()
      return
    }
    if (message?.type === "indicator:status") {
      if (label && typeof message.text === "string") label.textContent = message.text
      const dot = root?.querySelector<HTMLElement>('[data-role="dot"]')
      if (dot) dot.classList.toggle("busy", Boolean(message.busy))
      return
    }
    if (message?.type === "indicator:cursor") {
      // O cursor sozinho já acende a borda: não depende da ordem das mensagens.
      if (!root) mount()
      moveCursor(message.x, message.y)
      return
    }
    if (message?.type === "indicator:click") {
      if (!root) mount()
      clickAt(message.x, message.y)
    }
  })
}
