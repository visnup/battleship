import { readFileSync, writeFileSync } from "node:fs";
import { flatten, pack, score, unpack } from "../src/trees.ts";

// Packs src/model.json, pay.json, sayno.json and discard.json into src/packed/*.ts, for the
// online game's learned bots, and checks each packed model scores like its JSON on random rows.
// Rerun after any of them is retrained.

for (const name of ["model", "pay", "sayno", "discard"]) {
  const json = JSON.parse(readFileSync(new URL(`../src/${name}.json`, import.meta.url), "utf8"));
  const forest = flatten(json);
  const packed = pack(forest);
  const back = unpack(packed);
  const width = forest.feature.reduce((a, b) => Math.max(a, b)) + 1;
  for (let k = 0; k < 1000; k++) {
    const x = Array.from({ length: width }, () => Math.round(Math.random() * 20) / (1 + Math.floor(Math.random() * 4)));
    if (score(forest, x) !== score(back, x)) throw new Error(`${name} scores differently packed`);
  }
  writeFileSync(new URL(`../src/packed/${name}.ts`, import.meta.url), `export default ${JSON.stringify(packed)};\n`);
  console.log(`${name}: ${forest.roots.length} trees, ${forest.feature.length} nodes, ${(packed.length / 1e6).toFixed(2)} MB packed`);
}
