import vinext from "vinext";
import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  server: {
    host: "127.0.0.1",
  },
  resolve: {
    alias: {
      "cloudflare:workers": resolve(
        process.cwd(),
        "desktop/runtime/cloudflare-workers.ts",
      ),
    },
  },
  plugins: [vinext()],
});
