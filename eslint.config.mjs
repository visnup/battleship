import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettierRecommended from "eslint-plugin-prettier/recommended";

export default defineConfig([
  { files: ["apps/**"], ignores: ["apps/battleship/**"], extends: [nextVitals] },
  nextTs,
  prettierRecommended,
  globalIgnores(["**/.next/**", "**/next-env.d.ts", "**/convex/_generated/**", "**/src/packed/**", "**/cheat/dist/**"]),
]);
