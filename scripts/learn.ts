import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { COLORS, type Color, DECK } from "../src/cards.ts";
import { defaultPolicy, Game, type Move, mulberry32, name, type Player, type Policy } from "../src/game.ts";
import { parallel } from "../src/parallel.ts";
import { headToHead, moves } from "../src/strategies.ts";
import { encode, key, observe } from "./dataset.ts";

// A move scorer learned from the dataset: gradient-boosted trees (`learn.py`) over what the mover
// sees and what each move does, fitted to its two-round playout value.

type Obs = ReturnType<typeof observe>;
type Enc = ReturnType<typeof encode>;

const COLOR_NAMES = Object.keys(COLORS) as Color[];
const ACTIONS = ["dealBreaker", "justSayNo", "slyDeal", "forcedDeal", "debtCollector", "birthday", "doubleRent", "house", "hotel", "passGo"];
const KINDS = ["money", "property", "wild", "rent", "action"];
const TYPES = ["end", "bank", "place", "rent", "action"];
const CARDS = new Map(DECK.map((c) => [name(c), c]));
const size = (c: string) => COLORS[c as Color].rent.length;
const value = (card: string) => CARDS.get(card)!.value;
const kind = (card: string) => CARDS.get(card)!.kind;

const ofColor = (props: Obs["table"][number]["props"], c: string) => props.reduce((n, x) => n + +(x.color === c), 0);
const fulls = (props: Obs["table"][number]["props"]) => COLOR_NAMES.reduce((n, c) => n + +(ofColor(props, c) >= size(c)), 0);
const banked = (bank: string[]) => bank.reduce((s, c) => s + value(c), 0);
const rentOf = (props: Obs["table"][number]["props"], c: string) => {
  const k = Math.min(ofColor(props, c), size(c));
  return k ? COLORS[c as Color].rent[k - 1] : 0;
};

/** One card as numbers: its value, kind and action. */
const card = (c: string | null) => {
  const x = new Array<number>(2 + KINDS.length + ACTIONS.length).fill(0);
  if (!c) return x;
  const k = CARDS.get(c)!;
  x[0] = 1;
  x[1] = k.value;
  x[2 + KINDS.indexOf(k.kind)] = 1;
  if (k.kind === "action") x[2 + KINDS.length + ACTIONS.indexOf(k.action)] = 1;
  return x;
};

/** What the mover sees, as numbers. */
export function board(players: number, obs: Obs): number[] {
  const [me, ...them] = obs.table;
  const hand = new Array<number>(KINDS.length + ACTIONS.length + 1).fill(0);
  for (const c of obs.hand) {
    const k = CARDS.get(c)!;
    hand[KINDS.indexOf(k.kind)]++;
    if (k.kind === "action") hand[KINDS.length + ACTIONS.indexOf(k.action)]++;
    if (k.kind === "money") hand[KINDS.length + ACTIONS.length] += k.value;
  }
  const theirFulls = them.map((q) => fulls(q.props));
  return [
    players,
    obs.turn,
    obs.plays_left,
    obs.draw_size,
    obs.pile.length,
    ...hand,
    ...COLOR_NAMES.map((c) => ofColor(me.props, c) / size(c)),
    ...COLOR_NAMES.map((c) => Math.max(...them.map((q) => ofColor(q.props, c))) / size(c)),
    fulls(me.props),
    Math.max(...theirFulls),
    theirFulls.reduce((a, b) => a + b, 0),
    banked(me.bank),
    Math.max(...them.map((q) => banked(q.bank))),
    me.hand_size,
    Math.max(...them.map((q) => q.hand_size)),
  ];
}

/** What a move does, as numbers, after `board`. */
export function move(obs: Obs, m: Enc, isDefault: boolean): number[] {
  const me = obs.table[0];
  const target = m.target === null ? null : obs.table[m.target];
  const lead = Math.max(...obs.table.slice(1).map((q) => fulls(q.props)));
  const color = m.color ?? (m.card && kind(m.card) === "property" ? (CARDS.get(m.card) as { color: string }).color : null);
  const x = [
    ...TYPES.map((t) => +(m.type === t)),
    ...card(m.card),
    color ? ofColor(me.props, color) / size(color) : -1,
    color ? size(color) : -1,
    color ? rentOf(me.props, color) : -1,
    color && target ? ofColor(target.props, color) / size(color) : -1,
    m.target ?? -1,
    target ? fulls(target.props) : -1,
    target ? +(fulls(target.props) === lead) : -1,
    target ? banked(target.bank) : -1,
    target ? target.hand_size : -1,
    target ? target.props.length : -1,
    m.doubles,
  ];
  for (const [side, owner] of [
    [m.take, target],
    [m.give, me],
  ] as const) {
    const c = side?.color;
    x.push(
      side ? 1 : 0,
      side ? value(side.card) : -1,
      side ? +side.card.startsWith("wild") : -1,
      c ? ofColor(me.props, c) / size(c) : -1,
      c && owner ? ofColor(owner.props, c) / size(c) : -1,
      c ? size(c) : -1,
    );
  }
  x.push(+isDefault);
  return x;
}

const DATA = new URL("../dataset/data/", import.meta.url);
const FEATURES = new URL("../dataset/features/", import.meta.url);

/**
 * Features for shard `seed` of `players`, for `learn.py`: rows of floats, then each row's value
 * and the default's pick as 0 or 1, and each decision's move count.
 */
export function extract(players: number, seed: number, _n: number) {
  const lines = readFileSync(new URL(`${players}p-${String(seed).padStart(3, "0")}.jsonl`, DATA), "utf8").trim().split("\n");
  const x: number[] = [];
  const y: number[] = [];
  const groups: number[] = [];
  for (const line of lines) {
    const r = JSON.parse(line);
    const b = board(players, r);
    r.moves.forEach((m: Enc & { value: number }, j: number) => {
      x.push(...b, ...move(r, m, j === r.default));
      y.push(m.value, +(j === r.default));
    });
    groups.push(r.moves.length);
  }
  const base = new URL(`${players}p-${String(seed).padStart(3, "0")}`, FEATURES).pathname;
  writeFileSync(`${base}.x`, new Float32Array(x));
  writeFileSync(`${base}.y`, new Float32Array(y));
  writeFileSync(`${base}.g`, new Int32Array(groups));
  return [groups.length, x.length / y.length * 2];
}

/** The board as the mover sees it, every player in turn order from the mover, padded to 5. */
export function position(players: number, obs: Obs): number[] {
  const seat = (q: Obs["table"][number] | undefined) =>
    q ? [1, ...COLOR_NAMES.map((c) => ofColor(q.props, c) / size(c)), fulls(q.props), banked(q.bank), q.bank.length, q.hand_size, q.built.length] : new Array(16).fill(0);
  return [...board(players, obs).slice(0, 5 + KINDS.length + ACTIONS.length + 1), ...Array.from({ length: 5 }, (_, i) => seat(obs.table[i])).flat()];
}

/** Each decision's `position` for shard `seed` of `players`, and whether the mover won (−1 if the game stalled). */
export function boards(players: number, seed: number, _n: number) {
  const lines = readFileSync(new URL(`${players}p-${String(seed).padStart(3, "0")}.jsonl`, DATA), "utf8").trim().split("\n");
  const x: number[] = [];
  const won: number[] = [];
  for (const line of lines) {
    const r = JSON.parse(line);
    x.push(...position(players, r));
    won.push(r.won === null ? -1 : +r.won);
  }
  const base = new URL(`${players}p-${String(seed).padStart(3, "0")}`, FEATURES).pathname;
  writeFileSync(`${base}.b`, new Float32Array(x));
  writeFileSync(`${base}.w`, new Int8Array(won));
  return [won.length, x.length / won.length];
}

type Node = { split_feature?: number; threshold?: number; left_child?: Node; right_child?: Node; leaf_value?: number };
/** Every tree's nodes in flat arrays, a leaf marked by feature −1 with its value as the threshold. */
type Forest = { roots: number[]; feature: Int32Array; threshold: Float64Array; left: Int32Array; right: Int32Array };

function flatten(trees: Node[]): Forest {
  const feature: number[] = [];
  const threshold: number[] = [];
  const left: number[] = [];
  const right: number[] = [];
  const add = (t: Node): number => {
    const i = feature.length;
    feature.push(t.leaf_value !== undefined ? -1 : t.split_feature!);
    threshold.push(t.leaf_value ?? t.threshold!);
    left.push(0);
    right.push(0);
    if (t.leaf_value === undefined) [left[i], right[i]] = [add(t.left_child!), add(t.right_child!)];
    return i;
  };
  const roots = trees.map(add);
  return { roots, feature: Int32Array.from(feature), threshold: Float64Array.from(threshold), left: Int32Array.from(left), right: Int32Array.from(right) };
}

function score({ roots, feature, threshold, left, right }: Forest, x: number[]) {
  let s = 0;
  for (let i of roots) {
    for (let f = feature[i]; f >= 0; f = feature[i]) i = x[f] <= threshold[i] ? left[i] : right[i];
    s += threshold[i];
  }
  return s;
}

type Layer = { w: number[][]; b: number[] };

/** `learn_mlx.py`'s network: standardize, then ReLU layers, with weights as [out][in]. */
function network({ mean, std, layers }: { mean: number[]; std: number[]; layers: Layer[] }) {
  const ws = layers.map((l) => Float32Array.from(l.w.flat()));
  const bs = layers.map((l) => Float32Array.from(l.b));
  const acts = layers.map((l) => new Float32Array(l.b.length));
  const input = new Float32Array(mean.length);
  return (x: number[]) => {
    for (let i = 0; i < input.length; i++) input[i] = (x[i] - mean[i]) / std[i];
    let a = input;
    for (let l = 0; l < ws.length; l++) {
      const [w, b, out, n] = [ws[l], bs[l], acts[l], a.length];
      for (let o = 0; o < out.length; o++) {
        let s = b[o];
        for (let i = 0, k = o * n; i < n; i++, k++) s += w[k] * a[i];
        out[o] = l < ws.length - 1 && s < 0 ? 0 : s;
      }
      a = out;
    }
    return a[0];
  };
}

const loaded: Record<string, (x: number[]) => number> = {};

function load(file: string) {
  const json = JSON.parse(readFileSync(file, "utf8"));
  if (json.layers) return network(json);
  const trees = flatten(json.tree_info.map((t: { tree_structure: Node }) => t.tree_structure));
  return (x: number[]) => score(trees, x);
}

/** Every legal move, best first by the model in `file`: `learn.py`'s trees or `learn_mlx.py`'s network. */
export function ranked(file: string) {
  const scorer = (loaded[file] ??= load(file));
  return (game: Game, p: Player, left: number): (Move | null)[] => {
    const options = [null, ...moves(game, p, left)];
    if (options.length === 1) return options;
    const obs = observe(game, p, left);
    const b = board(game.players.length, obs);
    const pick = key(encode(game, p, defaultPolicy.move(game, p, left)));
    const scores = options.map((m) => {
      const e = encode(game, p, m);
      return scorer([...b, ...move(obs, e, key(e) === pick)]);
    });
    return options.map((m, i) => [m, scores[i]] as const).sort((a, b) => b[1] - a[1]).map(([m]) => m);
  };
}

/** `learn_value.py`'s board score, in place of `chance`: `seat`'s chance of winning `game`. */
export function boardScore(file: string) {
  const net = (loaded[file] ??= load(file));
  return (game: Game, seat: number) => 1 / (1 + Math.exp(-net(position(game.players.length, observe(game, game.players[seat], 3)))));
}

/** The default player, except that every move is the one the model in `file` scores highest. */
export function learned(file: string): Policy {
  const rank = ranked(file);
  return { ...defaultPolicy, move: (game, p, left) => rank(game, p, left)[0] };
}

const MODEL = new URL("../dataset/model.json", import.meta.url).pathname;
export const play = (model: string, players: number, seed: number, n: number) => headToHead(() => learned(model), players, seed, n);

if (import.meta.main) {
  const { values: args, positionals } = parseArgs({ allowPositionals: true, options: { n: { type: "string", default: "64" }, players: { type: "string", default: "2,3,4,5" }, model: { type: "string", default: MODEL } } });
  const counts = args.players.split(",").map(Number);
  if (positionals[0] === "extract" || positionals[0] === "boards") {
    mkdirSync(FEATURES, { recursive: true });
    for (const players of counts) {
      const [decisions, features] = await parallel<number[]>(import.meta.url, positionals[0], [players], Number(args.n), (a, b) => [a[0] + b[0], b[1]]);
      console.log(`${players} players: ${decisions} decisions from ${args.n} shards, ${features} features`);
    }
  } else {
    const n = Number(args.n);
    for (const players of counts) {
      const r = await parallel<{ wins: number }>(import.meta.url, "play", [args.model, players], n);
      console.log(`learned, ${players} players: ${((100 * r.wins) / n).toFixed(1)}% of ${n}`);
    }
  }
}
