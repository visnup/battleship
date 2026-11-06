import { resolve } from "node:path";

export default {
  build: { rollupOptions: { input: ["index.html", "fleet.html"].map((f) => resolve(import.meta.dirname, f)) } },
};
