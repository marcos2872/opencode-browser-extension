const HOST_ID = "opencode-browser-indicator"

let host: HTMLDivElement | null = null
let root: ShadowRoot | null = null
let pill: HTMLDivElement | null = null
let label: HTMLSpanElement | null = null
let cursor: HTMLDivElement | null = null

function mount(): void {
  if (window.top !== window) return
  if (document.getElementById(HOST_ID)) return
  host = document.createElement("div")
  host.id = HOST_ID
  host.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483647;"
  root = host.attachShadow({ mode: "closed" })

  const style = document.createElement("style")
  style.textContent = `
    :host { all: initial; }
    .frame {
      position: fixed; inset: 0;
      border: 2px solid #d97757;
      box-shadow: inset 0 0 0 1px rgba(217,119,87,.35), inset 0 0 48px rgba(217,119,87,.10);
      pointer-events: none;
      animation: pulse 2.4s ease-in-out infinite;
    }
    @keyframes pulse { 0%,100% { opacity:.55 } 50% { opacity:.9 } }
    .pill {
      position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%);
      display: flex; align-items: center; gap: 10px;
      background: #141413; color: #faf9f5;
      font: 500 13px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      padding: 9px 10px 9px 14px; border-radius: 999px;
      box-shadow: 0 12px 32px rgba(0,0,0,.28);
      pointer-events: auto;
    }
    .dot { width: 7px; height: 7px; border-radius: 50%; background: #d97757; }
    .dot.busy { animation: blink 1s ease-in-out infinite; }
    @keyframes blink { 0%,100% { opacity:.35 } 50% { opacity:1 } }
    .stop {
      border: 0; border-radius: 999px; padding: 6px 10px;
      background: #faf9f5; color: #141413; font: 600 12px/1 inherit; cursor: pointer;
    }
    .stop:hover { background: #f1efe8; }
    .cursor {
      position: fixed; width: 18px; height: 24px; margin: -2px 0 0 -2px;
      pointer-events: none; transition: transform 120ms cubic-bezier(.2,0,0,1);
      filter: drop-shadow(0 1px 2px rgba(0,0,0,.35));
    }
  `
  root.appendChild(style)

  const frame = document.createElement("div")
  frame.className = "frame"
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
}

function unmount(): void {
  host?.remove()
  host = null
  root = null
  pill = null
  label = null
  cursor = null
}

function ensureCursor(): HTMLDivElement | null {
  if (!root) return null
  if (cursor) return cursor
  cursor = document.createElement("div")
  cursor.className = "cursor"
  cursor.innerHTML = `
    <svg width="18" height="24" viewBox="0 0 18 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M1 1 L1 18 L5 14.5 L7.5 22 L11 20.5 L8.5 13 L14 13 Z"
        fill="#faf9f5" stroke="#141413" stroke-width="1.5" stroke-linejoin="round"/>
    </svg>`
  root.appendChild(cursor)
  return cursor
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
      unmount()
      return
    }
    if (message?.type === "indicator:status") {
      if (label && typeof message.text === "string") label.textContent = message.text
      const dot = root?.querySelector<HTMLElement>('[data-role="dot"]')
      if (dot) dot.classList.toggle("busy", Boolean(message.busy))
      return
    }
    if (message?.type === "indicator:cursor") {
      const element = ensureCursor()
      if (element && typeof message.x === "number" && typeof message.y === "number") {
        element.style.transform = `translate3d(${message.x}px, ${message.y}px, 0)`
      }
    }
  })
}
