import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { name } from "../src/cards.ts";
import { defaultPolicy, Game, type Move, moves, mulberry32, others, type Policy, STEPS } from "../src/game.ts";
import { learned, ranked } from "../src/learned.ts";

const KINDS = ["1", "2", "3", "4", "5", "6", "10", "bait", "fury", "legend", "winter", "crows", "doves"];
/** The numbers `board` and `move` in `learned.ts` make, in order. */
const FEATURES = [
  "players",
  ...KINDS.map((k) => `hand ${k}`),
  "hand size",
  "strength",
  "row size",
  "fury in row",
  "1s in row",
  "max other strength",
  "margin",
  "leads",
  "favor",
  "seat from favor",
  "others in",
  "others passed",
  "max strength in",
  "min other hand",
  "mean other hand",
  "max other hand",
  "others with cards",
  "winter",
  "chips needed",
  "chips of this color",
  "chip wins game",
  "chip wins another's game",
  "min others need",
  "in others it wins for",
  "battles",
  "pile",
  "move: pass",
  ...KINDS.map((k) => `move: ${k}`),
  "move: bait takes",
  "move: leads after",
  "move: strength after",
  "move: strength gain",
  "move: is default's",
];

const label = (m: Move) => (m ? (m.take ? "bait" : name(m.card)) : "pass");

/** Each feature's share of the split gain in `model`'s trees. */
function importance(model: string) {
  const gain = new Map<number, number>();
  type Node = { split_feature?: number; split_gain: number; left_child: Node; right_child: Node };
  const walk = (t: Node) => {
    if (t.split_feature === undefined) return;
    gain.set(t.split_feature, (gain.get(t.split_feature) ?? 0) + t.split_gain);
    walk(t.left_child);
    walk(t.right_child);
  };
  for (const t of JSON.parse(readFileSync(model, "utf8")).tree_info) walk(t.tree_structure);
  const total = [...gain.values()].reduce((a, b) => a + b, 0);
  return [...gain].sort((a, b) => b[1] - a[1]).map(([f, g]) => [FEATURES[f], g / total] as const);
}

/**
 * Plays `n` games of `players` among learned players, and at each decision of seat `i % players`
 * with a choice, compares the model's pick with the default's. Groups the differences by the
 * default's rule that made its pick (or, when none did and it passed, where it stood) and by the
 * two moves.
 */
function overrules(model: string, players: number, n: number) {
  const rank = ranked(model);
  const groups: Record<string, number> = {};
  let decisions = 0;
  let differ = 0;
  for (let i = 0; i < n; i++) {
    const watch: Policy = {
      ...learned(model),
      move(game, p) {
        const pick = rank(game, p)[0];
        if (moves(game, p).length < 2) return pick;
        decisions++;
        const d = defaultPolicy.move(game, p);
        if (label(d) === label(pick)) return pick;
        differ++;
        const where = `${game.leader() === p.seat ? "ahead" : "behind"}, row ${Math.min(p.row.length, 3)}, ${others(game, p).filter((q) => !q.passed).length} others in`;
        const rule = Object.entries(STEPS).find(([, s]) => s(game, p) !== undefined)?.[0] ?? `no rule (${where})`;
        const key = `${rule}: ${label(d)} → ${label(pick)}`;
        groups[key] = (groups[key] ?? 0) + 1;
        return pick;
      },
    };
    const policies = Array.from({ length: players }, (_, s) => (s === i % players ? watch : learned(model)));
    new Game({ players, rng: mulberry32(i + 1), policies, first: 0 }).run();
  }
  return { decisions, differ, groups };
}

if (import.meta.main) {
  const { values: args } = parseArgs({
    options: { n: { type: "string", default: "1000" }, players: { type: "string", default: "3,6" }, model: { type: "string", default: "src/model.json" }, top: { type: "string", default: "20" } },
  });
  const top = Number(args.top);
  console.log("| feature | split gain |\n| --- | --- |");
  for (const [f, g] of importance(args.model).slice(0, top)) console.log(`| ${f} | ${(100 * g).toFixed(1)}% |`);
  for (const players of args.players.split(",").map(Number)) {
    const { decisions, differ, groups } = overrules(args.model, players, Number(args.n));
    console.log(`\n## ${players} players: ${decisions} decisions with a choice, ${((100 * differ) / decisions).toFixed(1)}% differ from the default\n`);
    console.log("| the default's rule: default → model | share of decisions |\n| --- | --- |");
    for (const [k, v] of Object.entries(groups)
      .sort((a, b) => b[1] - a[1])
      .slice(0, top))
      console.log(`| ${k} | ${((100 * v) / decisions).toFixed(1)}% |`);
  }
}
