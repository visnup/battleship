import { readdirSync, readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { board, type Enc, move, scorer } from "../src/learned.ts";

/**
 * Where a model's pick differs from the default's on a dataset's labeled decisions, grouped by
 * what each picks and the round, with how often and the stored value it gains, in points.
 * Only the moves a row has values for are scored, so the model's pick is its best of those.
 */
const { values: args } = parseArgs({
  options: {
    model: { type: "string", default: "dataset/model-r4.json" },
    data: { type: "string", default: "dataset/data-r4b" },
    shards: { type: "string", default: "8" },
    top: { type: "string", default: "25" },
  },
});
const score = scorer(args.model);

const what = (m: Enc) =>
  m.type === "end"
    ? "end"
    : `${m.type} ${m.card?.startsWith("$") ? "money" : m.card?.startsWith("wild") ? "wild" : m.card?.startsWith("rent") ? (m.card.includes("/") || m.card === "rent(any)" ? m.card : "rent") : m.type === "place" ? "property" : m.card}`;

for (const players of [2, 3, 4, 5]) {
  const files = readdirSync(args.data)
    .filter((f) => f.startsWith(`${players}p-`))
    .sort()
    .slice(-Number(args.shards));
  const groups = new Map<string, number[]>();
  let decisions = 0;
  let overruled = 0;
  for (const f of files)
    for (const line of readFileSync(`${args.data}/${f}`, "utf8").trim().split("\n")) {
      const r = JSON.parse(line);
      if (r.moves.length < 2) continue;
      decisions++;
      const b = board(players, r);
      const scores = r.moves.map((m: Enc, j: number) => score([...b, ...move(r, m, j === r.default)]));
      const pick = scores.indexOf(Math.max(...scores));
      if (pick === r.default) continue;
      overruled++;
      const round = Math.ceil(r.turn / players);
      const key = `${what(r.moves[r.default])} → ${what(r.moves[pick])}, round ${round === 1 ? "1" : round <= 3 ? "2–3" : "4+"}`;
      const gain = 100 * (r.moves[pick].value - r.moves[r.default].value);
      groups.set(key, [...(groups.get(key) ?? []), gain]);
    }
  console.log(`\n${players} players: ${overruled} overruled of ${decisions} decisions`);
  const rows = [...groups].map(([k, g]) => {
    const mean = g.reduce((a, b) => a + b, 0) / g.length;
    const se = Math.sqrt(g.reduce((a, b) => a + (b - mean) ** 2, 0) / (g.length - 1) / g.length);
    return { k, n: g.length, mean, se, total: (mean * g.length) / decisions };
  });
  for (const r of rows.sort((a, b) => b.total - a.total).slice(0, Number(args.top)))
    console.log(`${r.total.toFixed(3).padStart(7)} ${String(r.n).padStart(6)} ${r.mean.toFixed(2).padStart(6)} ± ${(r.se || 0).toFixed(2)}  ${r.k}`);
}
