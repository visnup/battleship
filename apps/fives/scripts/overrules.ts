import { parseArgs } from "node:util";
import { parallel } from "kit/parallel.ts";
import { defaultPolicy, Game, mulberry32, type Policy, STEPS } from "../src/game.ts";
import { learned, same } from "../src/learned.ts";
import { role, situation } from "./decisions.ts";

/**
 * Plays `n` games of `players` among learned players, and at each decision of seat `i % players`
 * with a choice, compares the model's pick with the default's. Groups the differences by the
 * default's step that made its pick, where the player stands, and what each play does.
 */
export function overrules(model: string, players: number, seed: number, n: number) {
  const rng = mulberry32(seed);
  const player = learned(model);
  const groups: Record<string, number> = {};
  let decisions = 0;
  for (let i = 0; i < n; i++) {
    const seat = i % players;
    const watcher: Policy = {
      play(game, p) {
        const pick = player.play(game, p);
        if (p.seat !== seat) return pick;
        const plays = game.legal(p);
        if (plays.length < 2) return pick;
        decisions++;
        const d = defaultPolicy.play(game, p);
        if (same(d, pick)) return pick;
        const step = Object.entries(STEPS).find(([, s]) => s(game, p, plays))?.[0] ?? "none";
        const key = `${step}, ${situation(game, p)}: ${role(game, p, d)} → ${role(game, p, pick)}`;
        groups[key] = (groups[key] ?? 0) + 1;
        return pick;
      },
    };
    new Game({ players, rng: mulberry32(Math.floor(rng() * 2 ** 32)), policies: watcher }).run();
  }
  return { decisions, groups };
}

function combine(a: ReturnType<typeof overrules>, b: ReturnType<typeof overrules>) {
  for (const [k, v] of Object.entries(b.groups)) a.groups[k] = (a.groups[k] ?? 0) + v;
  return { decisions: a.decisions + b.decisions, groups: a.groups };
}

if (import.meta.main) {
  const { values: args } = parseArgs({
    options: { n: { type: "string", default: "2000" }, players: { type: "string", default: "3,4" }, model: { type: "string", default: "src/packed/model.ts" }, top: { type: "string", default: "25" } },
  });
  for (const players of args.players.split(",").map(Number)) {
    const { decisions, groups } = await parallel<ReturnType<typeof overrules>>(import.meta.url, "overrules", [args.model, players], Number(args.n), combine);
    const differ = Object.values(groups).reduce((a, b) => a + b, 0);
    const steps: Record<string, number> = {};
    for (const [k, v] of Object.entries(groups)) steps[k.split(",")[0]] = (steps[k.split(",")[0]] ?? 0) + v;
    console.log(`\n## ${players} players: ${decisions} decisions with a choice, ${((100 * differ) / decisions).toFixed(1)}% differ from the default\n`);
    console.log("| the default's step | share of decisions overruled |\n| --- | --- |");
    for (const [k, v] of Object.entries(steps).sort((a, b) => b[1] - a[1])) console.log(`| ${k} | ${((100 * v) / decisions).toFixed(1)}% |`);
    console.log("\n| step, situation: default → model | share of decisions |\n| --- | --- |");
    for (const [k, v] of Object.entries(groups)
      .sort((a, b) => b[1] - a[1])
      .slice(0, Number(args.top)))
      console.log(`| ${k} | ${((100 * v) / decisions).toFixed(2)}% |`);
  }
}
