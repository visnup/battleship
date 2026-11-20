import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { flatten, pack, score, unpack } from "../src/trees.ts";

// Packs a model's JSON into a module of base64, and checks the packed model scores like its JSON
// on random rows. `node scripts/pack.ts in.json [out]`: into src/packed/model.ts, the learned
// player's and the online game's hard bots', by default; the 50-tree model goes in
// src/packed/rollout.ts, for the Hard bots in a game's review. Rerun after a model is retrained.

const [input, out = "src/packed/model.ts"] = process.argv.slice(2);
const forest = flatten(JSON.parse(readFileSync(input, "utf8")));
const packed = pack(forest);
const back = unpack(packed);
const width = forest.feature.reduce((a, b) => Math.max(a, b)) + 1;
for (let k = 0; k < 1000; k++) {
  const x = Array.from({ length: width }, () => Math.round(Math.random() * 20) / (1 + Math.floor(Math.random() * 4)));
  if (score(forest, x) !== score(back, x)) throw new Error("the model scores differently packed");
}
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `export default ${JSON.stringify(packed)};\n`);
console.log(`${forest.roots.length} trees, ${forest.feature.length} nodes, ${(packed.length / 1e6).toFixed(2)} MB packed into ${out}`);
