import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { htmlLangPlugin } from "./scripts/html-lang.mjs"

export default defineConfig({
  plugins: [react(), htmlLangPlugin()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "chrome116",
    rollupOptions: {
      input: {
        sidepanel: "sidepanel.html",
        options: "options.html",
      },
      output: {
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
})
