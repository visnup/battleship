import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  build: { rollupOptions: { input: ["index.html", "fleet.html"].map((f) => resolve(import.meta.dirname, f)) } },
});
