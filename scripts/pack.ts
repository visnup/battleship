import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { flatten, pack, score, unpack } from "../src/trees.ts";

// Packs src/model.json into src/packed/model.ts, for the online game's hard bots, and checks the
// packed model scores like its JSON on random rows. Rerun after the model is retrained.

const forest = flatten(JSON.parse(readFileSync(new URL("../src/model.json", import.meta.url), "utf8")));
const packed = pack(forest);
const back = unpack(packed);
const width = forest.feature.reduce((a, b) => Math.max(a, b)) + 1;
for (let k = 0; k < 1000; k++) {
  const x = Array.from({ length: width }, () => Math.round(Math.random() * 20) / (1 + Math.floor(Math.random() * 4)));
  if (score(forest, x) !== score(back, x)) throw new Error("the model scores differently packed");
}
mkdirSync(new URL("../src/packed/", import.meta.url), { recursive: true });
writeFileSync(new URL("../src/packed/model.ts", import.meta.url), `export default ${JSON.stringify(packed)};\n`);
console.log(`${forest.roots.length} trees, ${forest.feature.length} nodes, ${(packed.length / 1e6).toFixed(2)} MB packed`);
