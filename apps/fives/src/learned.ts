import { type Forest, flatten, score, unpack } from "./trees.ts";
import { BACK, type Card, COLORS as HUES } from "./cards.ts";
import { beats, defaultPolicy, face, type Game, HANDS, others, type Play, type Player, type Policy, sure, TARGET, top, total, TRUMP, unseen, winning } from "./game.ts";

/** What `p` sees at a decision, as numbers. */
export function board(game: Game, p: Player): number[] {
  const n = game.players.length;
  const rest = others(game, p);
  const led = game.led();
  const lead = game.trick.length ? face(game.trick.find((t) => t.seat === game.taking())!.play) : undefined;
  const t = top(game, p);
  const chips = rest.map((q) => q.chips);
  const points = rest.map((q) => total(q));
  return [
    n,
    game.hand,
    HANDS - game.hand,
    p.hand.length,
    game.trick.length,
    n - 1 - game.trick.length,
    total(p),
    TARGET - total(p),
    p.won.length,
    p.chips,
    p.chips - Math.max(...chips),
    p.chips - Math.min(...chips),
    game.pot,
    Math.max(...points),
    Math.min(...points),
    rest.filter((q) => total(q) > TARGET).length,
    rest.filter((q) => total(q) === TARGET).length,
    ...rest.map((q) => TARGET - total(q)),
    ...(n === 3 ? [99] : []),
    ...HUES.map((c) => +(led === c)),
    lead ? lead.value : -1,
    lead ? +(lead.color === TRUMP) : 0,
    +game.trick.some((x) => x.play.down),
    ...HUES.map((c) => p.hand.filter((x) => x.color === c).length),
    ...HUES.map((c) => Math.max(-1, ...p.hand.filter((x) => x.color === c).map((x) => x.value))),
    ...HUES.map((c) => Math.min(99, ...p.hand.filter((x) => x.color === c).map((x) => x.value))),
    p.hand.reduce((s, x) => s + x.value, 0),
    ...t,
    ...HUES.map((c) => rest.filter((q) => q.voids.includes(c)).length),
  ];
}

/** `play` as numbers: what it is, and where it leaves `p`. */
export function move(game: Game, p: Player, play: Play, isDefault: boolean): number[] {
  const f = face(play);
  const wins = winning(game, play);
  const higher = p.hand.filter((c) => c.color === play.card.color && c.value > play.card.value).length;
  return [
    +play.down,
    ...HUES.map((c) => +(play.card.color === c)),
    play.card.value,
    f.value,
    +(f.color === TRUMP),
    +wins,
    +sure(game, p, play),
    TARGET - total(p) - f.value,
    +(total(p) + f.value > TARGET),
    +(total(p) + f.value === TARGET),
    higher,
    +isDefault,
  ];
}

/** The players still to play in this trick after `p`. */
const after = (game: Game, p: Player) => others(game, p).slice(0, game.players.length - 1 - game.trick.length);

/**
 * Version 2's card counting, added to `board`: each color's cards `p` hasn't seen, their two
 * highest, the cards in hand nothing unseen beats, and each other player's place in the trick and
 * the colors they're out of.
 */
export function board2(game: Game, p: Player): number[] {
  const out = unseen(game, p);
  const led = game.led();
  const rest = others(game, p);
  const of = (c: (typeof HUES)[number]) =>
    out
      .filter((x) => x.color === c)
      .map((x) => x.value)
      .sort((a, b) => b - a);
  const counted = HUES.map(of);
  const later = after(game, p);
  return [
    ...counted.map((v) => v.length),
    ...counted.map((v) => v[1] ?? -1),
    ...HUES.map((c, i) => p.hand.filter((x) => x.color === c && x.value > (counted[i][0] ?? -1)).length),
    ...rest.flatMap((q) => [+later.includes(q), +(!!led && q.voids.includes(led)), +q.voids.includes(TRUMP), q.won.length]),
    ...(game.players.length === 3 ? [0, 0, 0, 0] : []),
    led ? counted[HUES.indexOf(led)].length : -1,
    led ? later.filter((q) => q.voids.includes(led)).length : -1,
    later.filter((q) => q.voids.includes(TRUMP)).length,
  ];
}

/** Version 2's card counting for a play, added to `move`: what's unseen above it, and who still to play could beat it. */
export function move2(game: Game, p: Player, play: Play): number[] {
  const f = face(play);
  const out = unseen(game, p);
  const led = game.led() ?? f.color;
  const beaters = out.filter((c: Card) => beats(c, f, led));
  const later = after(game, p);
  return [out.filter((c) => c.color === f.color && c.value > f.value).length, beaters.length, +!beaters.length, later.filter((q) => q.voids.includes(led) && !q.voids.includes(TRUMP)).length, +(f === BACK)];
}

/** The numbers each version of the features gives for a decision and for each play; a model says which it was fit to. */
const FEATURES = {
  1: { board, move },
  2: {
    board: (game: Game, p: Player) => [...board(game, p), ...board2(game, p)],
    move: (game: Game, p: Player, play: Play, isDefault: boolean) => {
      // whether it's the default's pick stays last, where `learn.py` looks for it
      const m = move(game, p, play, isDefault);
      return [...m.slice(0, -1), ...move2(game, p, play), m.at(-1)!];
    },
  },
};
/** The version `dataset.ts` writes. */
export const VERSION = 2;
export const features = (v: number = VERSION) => FEATURES[v as keyof typeof FEATURES];

const forests = new Map<string, Forest>();
const load = (path: string) => {
  // getBuiltinModule, so Convex's bundler, which has no file system, never sees an import of node:fs
  const fs = (globalThis as unknown as { process: { getBuiltinModule(id: "node:fs"): { readFileSync(file: string, encoding: "utf8"): string } } }).process.getBuiltinModule("node:fs");
  if (!forests.has(path)) {
    const text = fs.readFileSync(path, "utf8");
    forests.set(path, path.endsWith(".ts") ? unpack(JSON.parse(text.slice(text.indexOf('"'), text.lastIndexOf('"') + 1))) : flatten(JSON.parse(text)));
  }
  return forests.get(path)!;
};
/** `src/packed/model.ts`, found when first needed, since Convex can't evaluate `import.meta` as it loads a module. */
const MODEL = () => new URL("./packed/model.ts", import.meta.url).pathname;

/** Whether two plays are the same. */
export const same = (a: Play, b: Play) => a.card === b.card && a.down === b.down;

/** The player making the play the model at the path `model`, or a forest already loaded, scores highest. */
export function learned(model: string | Forest = MODEL()): Policy {
  const forest = typeof model === "string" ? load(model) : model;
  return {
    play(game, p) {
      const options = game.legal(p);
      if (options.length === 1) return options[0];
      const { board, move } = features(forest.v);
      const b = board(game, p);
      const pick = defaultPolicy.play(game, p);
      let x: Float64Array | undefined;
      let best = options[0];
      let top = -Infinity;
      for (const m of options) {
        const y = move(game, p, m, same(m, pick));
        if (!x) (x = new Float64Array(b.length + y.length)).set(b);
        x.set(y, b.length);
        const s = score(forest, x);
        if (s > top) [best, top] = [m, s];
      }
      return best;
    },
  };
}
