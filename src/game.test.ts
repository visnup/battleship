import assert from "node:assert/strict";
import { test } from "node:test";
import type { Card, Color } from "./cards.ts";
import { assets, defaultPolicy, Game, mulberry32, type Player, rent } from "./game.ts";

const property = (color: Color, value = 1): Card => ({ kind: "property", color, value });
const money = (value: number): Card => ({ kind: "money", value });
const action = (a: Extract<Card, { kind: "action" }>["action"], value = 1): Card => ({ kind: "action", action: a, value });
const place = (p: Player, ...cards: Card[]) => p.props.push(...cards.map((card) => ({ card, color: (card as { color: Color }).color })));

function setup(players = 2) {
  const game = new Game({ players, first: 0, rng: mulberry32(1), deck: Array.from({ length: 40 }, () => money(1)) });
  for (const p of game.players) p.hand = [];
  return game;
}

const cards = (game: Game) =>
  game.draw.length + game.pile.length + game.players.reduce((s, p) => s + p.hand.length + p.bank.length + p.props.length + p.built.length, 0);

test("random games end with a winner and keep all 106 cards", () => {
  const rng = mulberry32(42);
  let stalled = 0;
  for (let i = 0; i < 2000; i++) {
    const game = new Game({ players: 2 + (i % 4), rng });
    const result = game.run();
    assert.equal(cards(game), 106);
    stalled += +result.stalled;
  }
  assert.ok(stalled < 20, `${stalled} stalled`);
});

test("rent: by cards in the set, plus a house and hotel on a full one", () => {
  const game = setup();
  const [p] = game.players;
  place(p, property("green"), property("green"));
  assert.equal(rent(game, p, "green"), 4);
  place(p, property("green"));
  p.built.push({ card: action("house"), color: "green" }, { card: action("hotel"), color: "green" });
  assert.equal(rent(game, p, "green"), 7 + 3 + 4);
});

test("change is not given", () => {
  const game = setup();
  const [p, q] = game.players;
  q.bank.push(money(3));
  game.collect(q, p, 2);
  assert.deepEqual(p.bank, [money(3)]);
  assert.equal(assets(q), 0);
});

test("with no cards in front of you, you don't pay at all", () => {
  const game = setup();
  const [p, q] = game.players;
  q.hand.push(money(10));
  game.collect(q, p, 5);
  assert.equal(assets(p), 0);
});

test("a multicolored wild can't be used as payment", () => {
  const game = setup();
  const [p, q] = game.players;
  q.props.push({ card: { kind: "wild", colors: "any", value: 0 }, color: "red" });
  game.collect(q, p, 2);
  assert.equal(q.props.length, 1);
});

test("Just Say No cancels, and another cancels that", () => {
  const game = setup();
  const [p, q] = game.players;
  place(q, property("darkBlue", 4), property("darkBlue", 4));
  const breaker = action("dealBreaker", 5);
  p.hand.push(breaker, action("justSayNo"));
  q.hand.push(action("justSayNo"));
  game.play(p, { type: "action", card: breaker, target: 1, color: "darkBlue" });
  assert.equal(p.props.length, 2);
  assert.equal(game.pile.length, 3);
});

test("Sly Deal can't take from a full set", () => {
  const game = setup();
  const [p, q] = game.players;
  place(q, property("brown"), property("brown"), property("red"));
  p.hand.push(action("slyDeal", 3));
  const move = defaultPolicy.move(game, p, 3);
  assert.equal(move?.type === "action" && move.take?.color, "red");
});

test("3 full sets of different colors win, but not on someone else's turn", () => {
  const game = setup();
  const [p, q] = game.players;
  place(q, property("brown"), property("brown"), property("darkBlue"), property("darkBlue"), property("utility"));
  p.bank.push(money(2));
  p.props.push({ card: property("utility"), color: "utility" });
  q.hand.push(action("debtCollector", 3));
  game.current = 1;
  // q collects p's utility as payment, completing a third set on q's own turn
  game.policies = [{ ...defaultPolicy, pay: (_, p) => [p.props[0]] }, defaultPolicy];
  assert.throws(() => game.turn(q));
  assert.equal(game.winner, 1);
});

test("over 7 cards at the end of a turn go to the bottom of the draw pile", () => {
  const game = setup();
  const [p] = game.players;
  p.hand.push(...Array.from({ length: 8 }, () => action("forcedDeal", 3)));
  game.turn(p);
  // draws two $1M and banks them, then can't use the Forced Deals
  assert.equal(p.hand.length, 7);
  assert.equal(game.draw.at(-1)?.kind, "action");
});
