import { existsSync, readFileSync } from "node:fs";
import { type Card, COLORS, type Fate } from "./cards.ts";
import { decisive, defaultPolicy, type Game, type Move, moves, needed, others, type Player, type Policy } from "./game.ts";

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

type Node = { split_feature?: number; threshold?: number; left_child?: Node; right_child?: Node; leaf_value?: number };
type Forest = { roots: Int32Array; feature: Int16Array; threshold: Float64Array; right: Int32Array };

/** LightGBM's trees (`learn.py`'s JSON) as flat arrays in preorder, as in monopoly-deal's `trees.ts`. */
export function flatten(json: { tree_info: { tree_structure: Node }[] }): Forest {
  const feature: number[] = [];
  const threshold: number[] = [];
  const right: number[] = [];
  const add = (t: Node): number => {
    const i = feature.length;
    feature.push(t.leaf_value !== undefined ? -1 : t.split_feature!);
    threshold.push(t.leaf_value ?? t.threshold!);
    right.push(0);
    if (t.leaf_value === undefined) {
      add(t.left_child!);
      right[i] = add(t.right_child!);
    }
    return i;
  };
  const roots = json.tree_info.map((t) => add(t.tree_structure));
  return { roots: Int32Array.from(roots), feature: Int16Array.from(feature), threshold: Float64Array.from(threshold), right: Int32Array.from(right) };
}

export function score({ roots, feature, threshold, right }: Forest, x: number[]) {
  let s = 0;
  for (let i of roots) {
    for (let f = feature[i]; f >= 0; f = feature[i]) i = x[f] <= threshold[i] ? i + 1 : right[i];
    s += threshold[i];
  }
  return s;
}

const forests = new Map<string, Forest>();
const load = (path: string) => {
  if (!forests.has(path)) forests.set(path, flatten(JSON.parse(readFileSync(path, "utf8"))));
  return forests.get(path)!;
};
export const MODEL = new URL("./model.json", import.meta.url).pathname;
export const hasModel = () => existsSync(MODEL);

/** Every legal move, best first by the model at `path`. */
export function ranked(path = MODEL) {
  const forest = load(path);
  return (game: Game, p: Player): Move[] => {
    const options = moves(game, p);
    if (options.length === 1) return options;
    const b = board(game, p);
    const pick = defaultPolicy.move(game, p);
    const same = (a: Move, b: Move) => a === b || (!!a && !!b && a.card === b.card && a.take === b.take);
    const scores = options.map((m) => score(forest, [...b, ...move(game, p, m, same(m, pick))]));
    return options.map((m, i) => [m, scores[i]] as const).sort((a, b) => b[1] - a[1]).map(([m]) => m);
  };
}

/** The default player, but making the move the model at `path` ranks first. */
export function learned(path = MODEL): Policy {
  const rank = ranked(path);
  return { ...defaultPolicy, move: (game, p) => rank(game, p)[0] };
}
