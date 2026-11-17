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

const cards = (game: Game) => game.draw.length + game.pile.length + game.players.reduce((s, p) => s + p.hand.length + p.bank.length + p.props.length + p.built.length, 0);

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

test("a clone plays out without changing the game it came from", () => {
  const game = new Game({ players: 3, rng: mulberry32(7) });
  for (let i = 0; i < 6; i++) game.turn(game.players[i % 3]);
  const before = JSON.stringify([game.players, game.draw, game.pile]);
  const result = game.clone().run();
  assert.notEqual(result.winner, null);
  assert.equal(JSON.stringify([game.players, game.draw, game.pile]), before);
});

test("noIsPlay:with no plays left, you can't counter a Just Say No on your turn", () => {
  const game = setup();
  game.rules.noIsPlay = true;
  const [p, q] = game.players;
  place(q, property("darkBlue", 4), property("darkBlue", 4));
  const breaker = action("dealBreaker", 5);
  p.hand.push(breaker, action("justSayNo"));
  q.hand.push(action("justSayNo"));
  game.left = 0;
  game.play(p, { type: "action", card: breaker, target: 1, color: "darkBlue" });
  assert.equal(p.props.length, 0);
  assert.equal(p.hand.length, 1);
});

test("strandedToBank: a house paid off a full set's property goes to the bank", () => {
  const game = setup();
  game.rules.strandedToBank = true;
  const [p, q] = game.players;
  place(q, property("brown"), property("brown"));
  q.built.push({ card: action("house", 3), color: "brown" });
  game.policies = [defaultPolicy, { ...defaultPolicy, pay: (_, q) => [q.props[0]] }];
  game.collect(q, p, 1);
  assert.deepEqual(q.built, []);
  assert.equal(q.bank[0].kind, "action");
});

test("breakerTakesBuildings off: Deal Breaker leaves the house in the victim's bank", () => {
  const game = setup();
  game.rules.breakerTakesBuildings = false;
  const [p, q] = game.players;
  place(q, property("brown"), property("brown"));
  q.built.push({ card: action("house", 3), color: "brown" });
  const breaker = action("dealBreaker", 5);
  p.hand.push(breaker);
  game.play(p, { type: "action", card: breaker, target: 1, color: "brown" });
  assert.equal(p.props.length, 2);
  assert.deepEqual(p.built, []);
  assert.equal(q.bank[0].kind, "action");
});

// The default player's rules, one board each.
const twoColor = (a: Color, b: Color): Card => ({ kind: "rent", colors: [a, b], value: 1 });
const anyColor: Card = { kind: "rent", colors: "any", value: 3 };
const choose = (game: Game, left = 3) => defaultPolicy.move(game, game.players[0], left);

test("default: banks Forced Deal in the first round at 3+ players, not at 2", () => {
  for (const players of [2, 3]) {
    const game = setup(players);
    const forced = action("forcedDeal", 3);
    game.players[0].hand.push(forced, money(1));
    assert.equal(choose(game)?.card, players === 2 ? game.players[0].hand[1] : forced);
  }
});

test("default: Pass Go with a play left after it, otherwise money first", () => {
  const game = setup();
  const [p] = game.players;
  p.hand.push(money(1), action("passGo"));
  assert.equal(choose(game, 2)?.card, p.hand[1]);
  assert.equal(choose(game, 1)?.card, p.hand[0]);
});

test("default: completes a set before anything else", () => {
  const game = setup();
  const [p, q] = game.players;
  place(p, property("brown"));
  place(q, property("red"));
  p.hand.push(action("slyDeal", 3), property("brown"));
  assert.deepEqual(choose(game), { type: "place", card: p.hand[1], color: "brown" });
});

test("default: Deal Breaker takes the highest-rent set of a color it doesn't have", () => {
  const game = setup();
  const [p, q] = game.players;
  place(q, property("brown"), property("brown"), property("darkBlue", 4), property("darkBlue", 4));
  p.hand.push(action("dealBreaker", 5));
  const color = () => {
    const m = choose(game);
    return m?.type === "action" && m.color;
  };
  assert.equal(color(), "darkBlue");
  place(p, property("darkBlue", 4), property("darkBlue", 4));
  assert.equal(color(), "brown");
});

test("default: charges a $1M rent at 2 players, but not $1M in all at 3", () => {
  for (const players of [2, 3]) {
    const game = setup(players);
    const [p, q] = game.players;
    place(p, property("brown"));
    q.bank.push(money(5));
    p.hand.push(twoColor("brown", "lightBlue"));
    assert.equal(choose(game)?.type === "rent", players === 2);
  }
});

test("default: aims the any-color Rent at whoever has to pay in property", () => {
  const game = setup(3);
  const [p, q, r] = game.players;
  place(p, property("darkBlue", 4));
  q.bank.push(money(10));
  place(r, property("green", 4));
  p.hand.push(anyColor);
  const move = choose(game);
  assert.equal(move?.type === "rent" && move.target, r.seat);
});

test("default: banks Double the Rent ahead of money when there's no rent to double", () => {
  const game = setup();
  const [p] = game.players;
  p.hand.push(money(5), action("doubleRent"));
  assert.deepEqual(choose(game), { type: "bank", card: p.hand[1] });
});

test("default: never builds; banks houses and hotels", () => {
  const game = setup();
  const [p] = game.players;
  place(p, property("brown"), property("brown"));
  p.hand.push(action("house", 3));
  assert.deepEqual(choose(game), { type: "bank", card: p.hand[0] });
});

test("default: Birthday, but not in the first round", () => {
  const game = setup();
  const [p, q] = game.players;
  q.bank.push(money(5));
  const birthday = action("birthday", 2);
  p.hand.push(money(1), birthday);
  game.turns = 1;
  assert.notEqual(choose(game)?.card, birthday);
  game.turns = 3;
  assert.equal(choose(game)?.card, birthday);
});

test("default: banks what it won't play when that empties the hand", () => {
  const game = setup();
  const [p] = game.players;
  p.hand.push(twoColor("brown", "lightBlue"));
  assert.deepEqual(choose(game, 1), { type: "bank", card: p.hand[0] });
  p.hand.push(twoColor("red", "yellow"));
  assert.equal(choose(game, 1), null);
});

test("default: banks money until $10M, then lays properties down first", () => {
  const game = setup();
  const [p] = game.players;
  p.hand.push(property("red", 3), money(5));
  assert.equal(choose(game)?.type, "bank");
  p.bank.push(money(10));
  assert.equal(choose(game)?.type, "place");
});
