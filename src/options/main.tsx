import { createRoot } from "react-dom/client"
import App from "./App"
import "../styles/app.css"
import { currentLocale, loadLocale, watchLocalePreference } from "../shared/i18n/runtime"

/**
 * O `lang` do documento vem do idioma em uso. O HTML sai do build com um
 * marcador (ver `scripts/html-lang.mjs`) e é resolvido aqui, antes do React:
 * um leitor de tela e o corretor ortográfico dependem dele estar certo.
 */
function applyDocumentLang(): void {
  document.documentElement.lang = currentLocale()
}

applyDocumentLang()
watchLocalePreference()
void loadLocale().then(applyDocumentLang)

const root = document.getElementById("root")
if (!root) throw new Error("Root not found.")
createRoot(root).render(<App />)
