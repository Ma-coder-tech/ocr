import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  root: "web",
  build: {
    outDir: "../public",
    emptyOutDir: false,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:3000",
      "/report": "http://127.0.0.1:3000",
      "/signin": "http://127.0.0.1:3000",
      "/signup": "http://127.0.0.1:3000",
    },
  },
});
