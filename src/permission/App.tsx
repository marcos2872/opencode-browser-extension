import { useEffect, useState } from "react"
import { PermissionCard } from "../components/PermissionCard"
import type { PermissionDecision, PermissionRequest } from "../shared/types"

const REQUEST_KEY = "permission.request."

export default function App() {
  const [request, setRequest] = useState<PermissionRequest | null>(null)
  const [missing, setMissing] = useState(false)
  const requestId = new URLSearchParams(window.location.search).get("requestId") ?? ""

  useEffect(() => {
    if (!requestId) {
      setMissing(true)
      return
    }
    void chrome.storage.session.get(REQUEST_KEY + requestId).then((data) => {
      const value = data[REQUEST_KEY + requestId] as PermissionRequest | undefined
      if (value) setRequest(value)
      else setMissing(true)
    })

    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== "session") return
      if (!(REQUEST_KEY + requestId in changes)) return
      const next = changes[REQUEST_KEY + requestId].newValue
      if (!next) window.close()
    }
    chrome.storage.onChanged.addListener(listener)
    return () => chrome.storage.onChanged.removeListener(listener)
  }, [requestId])

  async function decide(decision: PermissionDecision) {
    if (!request) return
    try {
      await chrome.runtime.sendMessage({
        type: "permission:respond",
        requestId: request.id,
        decision,
      })
    } finally {
      window.close()
    }
  }

  return (
    <div className="options-page" style={{ display: "grid", placeItems: "center", minHeight: "100vh" }}>
      {request ? (
        <PermissionCard request={request} onDecision={(decision) => void decide(decision)} />
      ) : (
        <div className="card" style={{ maxWidth: 380 }}>
          <h2>Pedido indisponível</h2>
          <p className="desc">
            {missing
              ? "Este pedido expirou ou já foi respondido. Volte ao painel do OpenCode Browser."
              : "Carregando pedido..."}
          </p>
          <button className="btn" onClick={() => window.close()}>
            Fechar
          </button>
        </div>
      )}
    </div>
  )
}
