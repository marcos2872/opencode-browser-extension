// Mantém o service worker acordado enquanto o painel/relay está em uso.
// Offscreen documents não estão sujeitos ao limite de 30s do MV3.
setInterval(() => {
  chrome.runtime.sendMessage({ type: "SW_KEEPALIVE" }).catch(() => {
    // O service worker pode estar reiniciando; o próximo tick tenta de novo.
  })
}, 20_000)

let audioContext: AudioContext | null = null

function beep(): void {
  try {
    audioContext ??= new AudioContext()
    const now = audioContext.currentTime
    const tones = [880, 660]
    tones.forEach((frequency, index) => {
      const oscillator = audioContext!.createOscillator()
      const gain = audioContext!.createGain()
      oscillator.type = "sine"
      oscillator.frequency.value = frequency
      const start = now + index * 0.16
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.08, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.14)
      oscillator.connect(gain)
      gain.connect(audioContext!.destination)
      oscillator.start(start)
      oscillator.stop(start + 0.16)
    })
  } catch {
    // Autoplay bloqueado ou áudio indisponível.
  }
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "PLAY_NOTIFICATION") beep()
})
