import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

/// Stub keeps its own dev ports so a second local project cannot claim them.
/// They must match PORT and APP_URL in server/.env.
const API_ORIGIN = process.env.STUB_API_ORIGIN ?? "http://localhost:3101"
const WEB_PORT = Number(process.env.STUB_WEB_PORT) || 5273

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: WEB_PORT,
    // Silently moving to another port breaks the API proxy and cookie origin.
    strictPort: true,
    proxy: {
      "/api": API_ORIGIN,
      "/sitemap.xml": API_ORIGIN,
      "/robots.txt": API_ORIGIN,
    },
  },
})
