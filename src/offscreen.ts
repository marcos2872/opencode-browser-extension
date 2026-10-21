// Mantém o service worker acordado enquanto o painel/relay está em uso.
// Offscreen documents não estão sujeitos ao limite de 30s do MV3.
setInterval(() => {
  chrome.runtime.sendMessage({ type: "SW_KEEPALIVE" }).catch(() => {
    // O service worker pode estar reiniciando; o próximo tick tenta de novo.
  })
}, 20_000)
