import { createRoot } from "react-dom/client"
import App from "./App"
import "../styles/app.css"

const root = document.getElementById("root")
if (!root) throw new Error("Root não encontrado.")
createRoot(root).render(<App />)
