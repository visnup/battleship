import { readFileSync, writeFileSync } from "node:fs";
import { flatten, pack, score, unpack } from "../src/trees.ts";

// Packs src/model.json, pay.json, sayno.json and discard.json into src/packed/*.ts, for the
// online game's learned bots, and checks each packed model scores like its JSON on random rows.
// Rerun after any of them is retrained. `node scripts/pack.ts in.json out.ts` packs one: a
// 200-tree model into src/packed/light.ts, which a game's review ranks moves by in the browser.

const [input, out] = process.argv.slice(2);
for (const [from, to] of input ? [[input, out]] : ["model", "pay", "sayno", "discard"].map((name) => [`src/${name}.json`, `src/packed/${name}.ts`])) {
  const forest = flatten(JSON.parse(readFileSync(from, "utf8")));
  const packed = pack(forest);
  const back = unpack(packed);
  const width = forest.feature.reduce((a, b) => Math.max(a, b)) + 1;
  for (let k = 0; k < 1000; k++) {
    const x = Array.from({ length: width }, () => Math.round(Math.random() * 20) / (1 + Math.floor(Math.random() * 4)));
    if (score(forest, x) !== score(back, x)) throw new Error(`${from} scores differently packed`);
  }
  writeFileSync(to, `export default ${JSON.stringify(packed)};\n`);
  console.log(`${to}: ${forest.roots.length} trees, ${forest.feature.length} nodes, ${(packed.length / 1e6).toFixed(2)} MB packed`);
}
