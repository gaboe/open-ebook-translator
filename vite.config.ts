import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";

export default defineConfig({
  plugins: [solidPlugin()],
  build: {
    target: "esnext",
  },
  optimizeDeps: {
    exclude: ["@mlc-ai/web-llm"],
  },
  server: {
    port: 5173,
  },
});
