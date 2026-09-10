import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    host: "127.0.0.1",
    port: Number(process.env.PORT ?? 3000),
    strictPort: true,
    fs: {
      allow: [".", "../../packages/core", "../../node_modules"],
      deny: [
        ".env",
        ".env.*",
        "*.{crt,pem,key,p12,pfx,cer,der}",
        ".npmrc",
        ".yarnrc.yml",
        "**/.git/**",
        "*.{har,jsonl}",
        "cookies.json",
        "session.json",
        "*.session.json",
      ],
    },
    proxy: {
      "/api": {
        target: process.env.API_ORIGIN ?? "http://127.0.0.1:3001",
        rewrite: (path) => path.replace(/^\/api/, ""),
        configure: (proxy) => {
          proxy.on("error", (_error, _request, response) => {
            if ("writeHead" in response && !response.headersSent) {
              response.writeHead(502, { "Content-Type": "application/json" });
              response.end(JSON.stringify({ message: "The jobs API is unavailable." }));
            }
          });
        },
      },
    },
  },
});
