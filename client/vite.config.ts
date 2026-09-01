import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api": "http://localhost:3001",
      "/sitemap.xml": "http://localhost:3001",
      "/robots.txt": "http://localhost:3001",
    },
  },
})
