import { COLORS, type Color, DECK } from "./cards.ts";
import { COLOR_NAMES, defaultPolicy, type Game, type Move, moves, name, payable, type Player, type Policy, size as sizeOf } from "./game.ts";
import { discarding, discards } from "./discarding.ts";
import { payment, payments } from "./paying.ts";
import { refusal } from "./refusing.ts";
import { encode, key, observe } from "./replay.ts";
import { type Forest, flatten, score } from "./trees.ts";

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

// from the repo's root, where scripts run, since Convex can't load a module that uses import.meta
export const MODEL = "src/model.json";
export const PAY = "src/pay.json";
export const NO = "src/sayno.json";
export const DISCARD = "src/discard.json";
const loaded: Record<string, (x: number[]) => number> = {};

// fetched here rather than imported, so Convex and browsers can load this module, given trees
function load(file: string) {
  const fs = (globalThis as unknown as { process: { getBuiltinModule(id: "node:fs"): { readFileSync(file: string, encoding: "utf8"): string } } }).process.getBuiltinModule("node:fs");
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  if (json.layers) return network(json);
  const trees = flatten(json);
  return (x: number[]) => score(trees, x);
}

/** A model to score by: a JSON file's path, or packed trees (`src/packed`). */
export type Model = string | Forest;

/** `model` as a function of `board` and `move`'s numbers. */
export const scorer = (model: Model = MODEL) => (typeof model === "string" ? (loaded[model] ??= load(model)) : (x: number[]) => score(model, x));

/** Every legal move, best first by `model`: `learn.py`'s trees or `learn_mlx.py`'s network. */
export function ranked(model: Model = MODEL) {
  const rate = scorer(model);
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

/** The payment `model` (`learn.py` on `paydata.ts`'s features) scores highest, of `payments`' first 24. */
export function paid(model: Model = PAY): Policy["pay"] {
  const rate = scorer(model);
  return (game, p, amount) => {
    const all = payable(p);
    const options = payments(game, p, amount, 24);
    if (options.length === 1) return options[0].map((j) => all[j]);
    const features = payment(game, p, amount);
    const scores = options.map((o) => rate(features(o.map((j) => all[j]))));
    return options[scores.indexOf(Math.max(...scores))].map((j) => all[j]);
  };
}

/** The discard `model` (`learn.py` on `discarddata.ts`'s features) scores highest, of `discards`' first 24. */
export function discarded(model: Model = DISCARD): Policy["discard"] {
  const rate = scorer(model);
  return (game, p, n) => {
    const options = discards(game, p, n);
    if (options.length === 1) return options[0].map((j) => p.hand[j]);
    const features = discarding(game, p, n);
    const scores = options.map((o) => rate(features(o.map((j) => p.hand[j]))));
    return options[scores.indexOf(Math.max(...scores))].map((j) => p.hand[j]);
  };
}

/** Whether to Just Say No, by `model` (`learn.py` on `saynodata.ts`'s features): whichever it scores higher. */
export function said(model: Model = NO): Policy["sayNo"] {
  const rate = scorer(model);
  return (game, p, move, to) => {
    const features = refusal(game, p, move, to);
    return rate(features(true)) > rate(features(false));
  };
}

/** The default player, except that it moves, pays, says no and discards by the models. */
export function learned(model: Model = MODEL, pay: Model = PAY, no: Model = NO, discard: Model = DISCARD): Policy {
  const rank = ranked(model);
  return { ...defaultPolicy, move: (game, p, left) => rank(game, p, left)[0], pay: paid(pay), sayNo: said(no), discard: discarded(discard) };
}
