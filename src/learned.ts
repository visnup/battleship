import { readFileSync } from "node:fs";
import { COLORS, type Color, DECK } from "./cards.ts";
import { COLOR_NAMES, defaultPolicy, type Game, type Move, moves, name, payable, type Player, type Policy, size as sizeOf } from "./game.ts";
import { payment, payments } from "./paying.ts";
import { refusal } from "./refusing.ts";
import { encode, key, observe } from "./replay.ts";

// A move scorer learned from the dataset: gradient-boosted trees (`scripts/learn.py`) over what
// the mover sees and what each move does, fitted to its two-round playout value.

export type Obs = ReturnType<typeof observe>;
export type Enc = ReturnType<typeof encode>;

const ACTIONS = ["dealBreaker", "justSayNo", "slyDeal", "forcedDeal", "debtCollector", "birthday", "doubleRent", "house", "hotel", "passGo"];
const KINDS = ["money", "property", "wild", "rent", "action"];
const TYPES = ["end", "bank", "place", "rent", "action"];
const CARDS = new Map(DECK.map((c) => [name(c), c]));
const size = (c: string) => sizeOf(c as Color);
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
    x.push(side ? 1 : 0, side ? value(side.card) : -1, side ? +side.card.startsWith("wild") : -1, c ? ofColor(me.props, c) / size(c) : -1, c && owner ? ofColor(owner.props, c) / size(c) : -1, c ? size(c) : -1);
  }
  x.push(+isDefault);
  return x;
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

export const MODEL = `${import.meta.dirname}/model.json`;
export const PAY = `${import.meta.dirname}/pay.json`;
export const NO = `${import.meta.dirname}/sayno.json`;
const loaded: Record<string, (x: number[]) => number> = {};

function load(file: string) {
  const json = JSON.parse(readFileSync(file, "utf8"));
  if (json.layers) return network(json);
  const trees = flatten(json.tree_info.map((t: { tree_structure: Node }) => t.tree_structure));
  return (x: number[]) => score(trees, x);
}

/** The model in `file` as a function of `board` and `move`'s numbers. */
export const scorer = (file = MODEL) => (loaded[file] ??= load(file));

/** Every legal move, best first by the model in `file`: `learn.py`'s trees or `learn_mlx.py`'s network. */
export function ranked(file = MODEL) {
  const rate = scorer(file);
  return (game: Game, p: Player, left: number): (Move | null)[] => {
    const options = [null, ...moves(game, p, left)];
    if (options.length === 1) return options;
    const obs = observe(game, p, left);
    const b = board(game.players.length, obs);
    const pick = key(encode(game, p, defaultPolicy.move(game, p, left)));
    const scores = options.map((m) => {
      const e = encode(game, p, m);
      return rate([...b, ...move(obs, e, key(e) === pick)]);
    });
    return options
      .map((m, i) => [m, scores[i]] as const)
      .sort((a, b) => b[1] - a[1])
      .map(([m]) => m);
  };
}

/** The payment the model in `file` (`learn.py` on `paydata.ts`'s features) scores highest, of `payments`' first 24. */
export function paid(file = PAY): Policy["pay"] {
  const rate = scorer(file);
  return (game, p, amount) => {
    const all = payable(p);
    const options = payments(game, p, amount, 24);
    if (options.length === 1) return options[0].map((j) => all[j]);
    const features = payment(game, p, amount);
    const scores = options.map((o) => rate(features(o.map((j) => all[j]))));
    return options[scores.indexOf(Math.max(...scores))].map((j) => all[j]);
  };
}

/** Whether to Just Say No, by the model in `file` (`learn.py` on `saynodata.ts`'s features): whichever it scores higher. */
export function said(file = NO): Policy["sayNo"] {
  const rate = scorer(file);
  return (game, p, move, to) => {
    const features = refusal(game, p, move, to);
    return rate(features(true)) > rate(features(false));
  };
}

/** The default player, except that every move is the one the model in `file` scores highest, and every payment the one `src/pay.json` does. */
export function learned(file: string): Policy {
  const rank = ranked(file);
  return { ...defaultPolicy, move: (game, p, left) => rank(game, p, left)[0], pay: paid() };
}
