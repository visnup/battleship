import { type Card, COLORS, type Fate } from "./cards.ts";
import { type Forest, flatten, score, unpack } from "./trees.ts";
import { decisive, defaultPolicy, finishIn, type Game, heuristic, type Move, moves, needed, others, type Player, type Policy, STEPS } from "./game.ts";

/** The default every model so far was trained on, before `hold` and `finish` counting the whole hand: its pick is one of a move's numbers. */
export const hint = heuristic(...(Object.keys(STEPS) as (keyof typeof STEPS)[]).filter((s) => s !== "hold").map((s) => (s === "finish" ? finishIn(4) : s)));

const KINDS: (Fate | number)[] = [1, 2, 3, 4, 5, 6, 10, "bait", "fury", "legend", "winter", "crows", "doves"];
const kindOf = (c: Card) => (c.kind === "force" ? c.value : c.kind);
const counts = (cards: Card[]) => KINDS.map((k) => cards.filter((c) => kindOf(c) === k).length);

/** What `p` sees at a decision, as numbers. */
export function board(game: Game, p: Player): number[] {
  const n = game.players.length;
  const rest = others(game, p);
  const alive = rest.filter((q) => !q.passed);
  const strengths = rest.map((q) => game.strength(q));
  const color = game.color ? COLORS.indexOf(game.color) : -1;
  return [
    n,
    ...counts(p.hand),
    p.hand.length,
    game.strength(p),
    p.row.length,
    +p.row.some((c) => c.kind === "fury"),
    p.row.filter((c) => c.kind === "force" && c.value === 1).length,
    Math.max(0, ...strengths),
    game.strength(p) - Math.max(0, ...strengths),
    +(game.leader() === p.seat),
    +(game.favor === p.seat),
    (p.seat - game.favor + n) % n,
    alive.length,
    rest.length - alive.length,
    Math.max(0, ...alive.map((q) => game.strength(q))),
    Math.min(99, ...rest.map((q) => q.hand.length)),
    rest.reduce((s, q) => s + q.hand.length, 0) / rest.length,
    Math.max(0, ...rest.map((q) => q.hand.length)),
    rest.filter((q) => q.hand.length).length,
    +game.winter,
    needed(p.chips),
    color >= 0 ? p.chips[color] : 0,
    +decisive(game, p),
    +rest.some((q) => decisive(game, q)),
    Math.min(...rest.map((q) => needed(q.chips))),
    rest.filter((q) => decisive(game, q) && !q.passed).length,
    game.battles,
    game.pile.length,
  ];
}

/** `move` as numbers: what it is, and where it leaves `p`. */
export function move(game: Game, p: Player, m: Move, isDefault: boolean): number[] {
  const kind = m ? KINDS.indexOf(kindOf(m.card)) : -1;
  let leads = 0;
  let strength = game.strength(p);
  if (m) {
    const row = p.row;
    const winter = game.winter;
    if (m.card.kind === "winter") game.winter = true;
    else if (m.card.kind === "bait") p.row = row.filter((c, i) => i !== row.indexOf(m.take!));
    else p.row = [...row, m.card];
    leads = +(game.leader() === p.seat);
    strength = game.strength(p);
    p.row = row;
    game.winter = winter;
  }
  return [+!m, ...KINDS.map((_, i) => +(i === kind)), m?.take ? m.take.value : 0, leads, strength, strength - game.strength(p), +isDefault];
}

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

/** Whether two moves are the same play. */
export const same = (a: Move, b: Move) => a === b || (!!a && !!b && a.card === b.card && a.take === b.take);

/** Every legal move, best first by the model at the path `model`, or a forest already loaded. */
export function ranked(model: string | Forest = MODEL()) {
  const forest = typeof model === "string" ? load(model) : model;
  return (game: Game, p: Player): Move[] => {
    const options = moves(game, p);
    if (options.length === 1) return options;
    const b = board(game, p);
    const pick = hint.move(game, p);
    const scores = options.map((m) => score(forest, [...b, ...move(game, p, m, same(m, pick))]));
    return options
      .map((m, i) => [m, scores[i]] as const)
      .sort((a, b) => b[1] - a[1])
      .map(([m]) => m);
  };
}

/** The default player, but making the move `model` ranks first. */
export function learned(model: string | Forest = MODEL()): Policy {
  const rank = ranked(model);
  return { ...defaultPolicy, move: (game, p) => rank(game, p)[0] };
}
