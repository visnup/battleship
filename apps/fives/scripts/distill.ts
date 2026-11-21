import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { parallel } from "kit/parallel.ts";
import { defaultPolicy, face, Game, HANDS, mulberry32, others, type Play, type Player, type Policy, STEPS, sure, TARGET, total, TRUMP, winning } from "../src/game.ts";
import { learned, same } from "../src/learned.ts";

const steps = Object.keys(STEPS) as (keyof typeof STEPS)[];

/** What a person can see at a decision, by name. */
function situation(game: Game, p: Player, plays: Play[]) {
  const led = game.led();
  const room = TARGET - total(p);
  const rest = others(game, p);
  const lead = game.trick.length ? face(game.trick.find((t) => t.seat === game.taking())!.play) : undefined;
  return {
    players: game.players.length,
    "hands left": HANDS - game.hand,
    "cards left": p.hand.length,
    "place in trick": game.trick.length + 1,
    "last to play": +(game.trick.length === game.players.length - 1),
    "to go": room,
    "chips ahead": p.chips - Math.max(...rest.map((q) => q.chips)),
    "others' best to go": Math.min(...rest.map((q) => TARGET - total(q)).filter((r) => r >= 0), 99),
    "others busted": rest.filter((q) => total(q) > TARGET).length,
    "led magenta": +(led === "magenta"),
    "led silver": +(led === TRUMP),
    "can follow": led ? +p.hand.some((c) => c.color === led) : 1,
    "taking card": lead ? lead.value : -1,
    "taking with silver": lead ? +(lead.color === TRUMP) : 0,
    "silvers in hand": p.hand.filter((c) => c.color === TRUMP).length,
    "highest in hand": Math.max(...p.hand.map((c) => c.value)),
    "a sure win fits": +plays.some((x) => face(x).value <= room && sure(game, p, x)),
    "can flip": +plays.some((x) => x.down),
  };
}

type Row = Record<string, number>;

/**
 * Plays `n` games among round 9's learned players, and at every decision with a choice records the
 * situation, the default's step and pick, and the model's pick: whether each takes the trick for
 * now, plays face down, and the card's value as played.
 */
export function distill(model: string, players: number, seed: number, n: number): Row[] {
  const rng = mulberry32(seed);
  const player = learned(model);
  const rows: Row[] = [];
  const watch: Policy = {
    play(game, p) {
      const pick = player.play(game, p);
      const plays = game.legal(p);
      if (plays.length < 2) return pick;
      const d = defaultPolicy.play(game, p);
      const step = steps.findIndex((s) => STEPS[s](game, p, plays) !== undefined);
      rows.push({
        ...situation(game, p, plays),
        "default's step": step,
        "default takes": +winning(game, d),
        "default flips": +d.down,
        "default's value": face(d).value,
        "model takes": +winning(game, pick),
        "model flips": +pick.down,
        "model's value": face(pick).value,
        same: +same(d, pick),
      });
      return pick;
    },
  };
  for (let i = 0; i < n; i++) new Game({ players, rng: mulberry32(Math.floor(rng() * 2 ** 32)), policies: watch }).run();
  return rows;
}

if (import.meta.main) {
  const { values: args } = parseArgs({
    options: { n: { type: "string", default: "2000" }, players: { type: "string", default: "3,4" }, model: { type: "string", default: "src/packed/model.ts" }, out: { type: "string", default: "dataset/distill.csv" } },
  });
  let rows: Row[] = [];
  for (const players of args.players.split(",").map(Number)) rows = rows.concat(await parallel<Row[]>(import.meta.url, "distill", [args.model, players], Number(args.n), (a, b) => a.concat(b)));
  const keys = Object.keys(rows[0]);
  writeFileSync(args.out, [keys.join(","), ...rows.map((r) => keys.map((k) => r[k]).join(","))].join("\n") + "\n");
  console.log(`${rows.length} decisions to ${args.out}; steps: ${steps.map((s, i) => `${i} ${s}`).join(", ")}`);
}
