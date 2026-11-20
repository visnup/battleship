import { readFileSync, writeFileSync } from "node:fs";
import { flatten, pack, score, unpack } from "../src/trees.ts";

// Packs a model's JSON into src/packed/, which the learned player and the online game's bots
// load, and checks the packed model scores like its JSON on random rows. Rerun after a model is
// retrained: `node scripts/pack.ts dataset/model-rN.json src/packed/model.ts`, and the same for
// pay, sayno and discard, or a 200-tree model into src/packed/light.ts, which a game's review
// ranks moves by in the browser.

const [input, out] = process.argv.slice(2);
const forest = flatten(JSON.parse(readFileSync(input, "utf8")));
const packed = pack(forest);
const back = unpack(packed);
const width = forest.feature.reduce((a, b) => Math.max(a, b)) + 1;
for (let k = 0; k < 1000; k++) {
  const x = Array.from({ length: width }, () => Math.round(Math.random() * 20) / (1 + Math.floor(Math.random() * 4)));
  if (score(forest, x) !== score(back, x)) throw new Error(`${input} scores differently packed`);
}
writeFileSync(out, `export default ${JSON.stringify(packed)};\n`);
console.log(`${out}: ${forest.roots.length} trees, ${forest.feature.length} nodes, ${(packed.length / 1e6).toFixed(2)} MB packed`);
